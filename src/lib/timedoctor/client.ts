// ─── Time Doctor 2 API Client ────────────────────────────────────────────────

const TD_BASE = "https://api2.timedoctor.com/api/1.0";

// ─── Config ──────────────────────────────────────────────────────────────────

export function isTimeDoctorConfigured(): boolean {
  return !!(
    process.env.TIMEDOCTOR_EMAIL &&
    process.env.TIMEDOCTOR_PASSWORD
  );
}

function getCompanyId(): string {
  return process.env.TIMEDOCTOR_COMPANY_ID || "";
}

// ─── JWT Token Cache ─────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function login(): Promise<{ token: string; companyId: string }> {
  const res = await fetch(`${TD_BASE}/authorization/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.TIMEDOCTOR_EMAIL,
      password: process.env.TIMEDOCTOR_PASSWORD,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Time Doctor login failed (${res.status}): ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  const token = data.data?.token || data.token;
  const companies = data.data?.companies || data.companies || [];
  const companyId = getCompanyId() || companies[0]?.id || "";

  if (!token) throw new Error("Time Doctor login returned no token");

  return { token, companyId };
}

export async function getTDToken(): Promise<{ token: string; companyId: string }> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return { token: cachedToken, companyId: getCompanyId() };
  }

  const result = await login();
  cachedToken = result.token;
  // Cache for 24h (actual token valid 6 months, but re-auth daily is safer)
  tokenExpiry = now + 24 * 60 * 60 * 1000;

  // Store companyId if discovered
  if (result.companyId && !process.env.TIMEDOCTOR_COMPANY_ID) {
    process.env.TIMEDOCTOR_COMPANY_ID = result.companyId;
  }

  return result;
}

// ─── Generic Fetch ───────────────────────────────────────────────────────────

export async function tdFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const { token, companyId } = await getTDToken();

  const url = new URL(`${TD_BASE}${path.replace("{companyId}", companyId)}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `JWT ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  // Retry once on 401 (token expired)
  if (res.status === 401) {
    cachedToken = null;
    tokenExpiry = 0;
    const { token: newToken } = await getTDToken();

    const retryRes = await fetch(url.toString(), {
      headers: {
        Authorization: `JWT ${newToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!retryRes.ok) {
      const text = await retryRes.text().catch(() => "");
      throw new Error(`Time Doctor API error (${retryRes.status}): ${text.substring(0, 200)}`);
    }

    return retryRes.json();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Time Doctor API error (${res.status}): ${text.substring(0, 200)}`);
  }

  return res.json();
}

// ─── Typed API Calls ─────────────────────────────────────────────────────────

export interface TDUser {
  id: string;
  email: string;
  name: string;
}

export interface TDWorklogEntry {
  id?: string;
  userId: string;
  taskId?: string;
  taskName?: string;
  projectId?: string;
  projectName?: string;
  start: string;    // ISO datetime
  end?: string;
  length?: number;  // duration in seconds
  duration?: number; // alternative field name
}

interface TDUsersResponse {
  data: {
    users?: TDUser[];
  } | TDUser[];
}

interface TDWorklogResponse {
  data: TDWorklogEntry[] | { worklogs?: TDWorklogEntry[] };
}

export async function fetchTDUsers(): Promise<TDUser[]> {
  const res = await tdFetch<TDUsersResponse>("/companies/{companyId}/users");
  const data = res.data;
  if (Array.isArray(data)) return data;
  return data.users || [];
}

export async function fetchTDWorklogs(
  from: string,
  to: string,
  userIds?: string[],
): Promise<TDWorklogEntry[]> {
  const params: Record<string, string> = { from, to };
  if (userIds?.length) {
    params.user_id = userIds.join(",");
  }

  const res = await tdFetch<TDWorklogResponse>("/companies/{companyId}/worklog", params);
  const data = res.data;
  if (Array.isArray(data)) return data;
  return data.worklogs || [];
}
