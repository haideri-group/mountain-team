export function getConfig() {
  return {
    baseUrl: process.env.NEXT_PUBLIC_JIRA_BASE_URL || "",
    email: process.env.JIRA_USER_EMAIL || "",
    token: process.env.JIRA_API_TOKEN || "",
  };
}

export function getAuthHeader(): string {
  const { email, token } = getConfig();
  if (!email || !token) {
    throw new Error("JIRA credentials not configured");
  }
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

export function getBaseUrl(): string {
  const { baseUrl } = getConfig();
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_JIRA_BASE_URL not configured");
  }
  return baseUrl.replace(/\/$/, "");
}

export function isJiraConfigured(): boolean {
  const { baseUrl, email, token } = getConfig();
  return !!(baseUrl && email && token) && !baseUrl.includes("your-domain") && !token.includes("your-jira");
}

// Sanitize API error responses to prevent credential leakage in logs
export function sanitizeErrorText(text: string): string {
  return text
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/token[=:]\s*["']?[A-Za-z0-9._-]+/gi, "token=[REDACTED]")
    .substring(0, 500); // Truncate to prevent large error dumps
}

async function jiraFetch<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}/rest/api/3${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JIRA API error ${res.status}: ${sanitizeErrorText(text)}`);
  }

  return res.json();
}

// Types for JIRA API responses
interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  style: string;
  avatarUrls: Record<string, string>;
  isPrivate: boolean;
}

export interface JiraProjectInfo {
  key: string;
  name: string;
  type: string;
  avatarUrl: string | null;
}

export interface JiraProjectsPage {
  projects: JiraProjectInfo[];
  total: number;
  startAt: number;
  maxResults: number;
  isLast: boolean;
}

interface JiraProjectSearchResponse {
  values: JiraProject[];
  total: number;
  startAt: number;
  maxResults: number;
  isLast: boolean;
}

// Fetch projects from JIRA with pagination
export async function fetchJiraProjects(
  startAt = 0,
  maxResults = 12,
  query?: string,
): Promise<JiraProjectsPage> {
  let path = `/project/search?startAt=${startAt}&maxResults=${maxResults}&orderBy=key`;
  if (query) {
    path += `&query=${encodeURIComponent(query)}`;
  }

  const data = await jiraFetch<JiraProjectSearchResponse>(path);

  return {
    projects: data.values.map((p) => ({
      key: p.key,
      name: p.name,
      type: p.projectTypeKey,
      avatarUrl: p.avatarUrls?.["48x48"] || null,
    })),
    total: data.total,
    startAt: data.startAt,
    maxResults: data.maxResults,
    isLast: data.isLast,
  };
}

// Verify a JIRA user exists
export async function verifyJiraUser(query: string): Promise<boolean> {
  try {
    const results = await jiraFetch<Array<{ accountId: string }>>(
      `/user/search?query=${encodeURIComponent(query)}&maxResults=1`,
    );
    return Array.isArray(results) && results.length > 0;
  } catch {
    return false;
  }
}
