import { createHmac, timingSafeEqual } from "crypto";
import {
  captureRateLimitForMode,
  getActiveRateLimit,
  getAuthForRequest,
  isAppAuthConfigured as isAppConfigured,
} from "./auth-mode";
import { clearInstallationTokenCache } from "./app-auth";

// --- Config ---

export function getGitHubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || "",
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
  };
}

/** True if ANY supported auth method is available (App or PAT). */
export function isGitHubConfigured(): boolean {
  if (isAppConfigured()) return true;
  const { token } = getGitHubConfig();
  return !!token && !token.includes("your-github");
}

/** Shared header set used by both `githubFetch*` and the raw-fetch
 *  callers in `deployment-propagation.ts` / `issue-deployment-sync.ts`.
 *  Returned object also carries the auth `mode` so callers can invoke
 *  `captureRateLimitForMode(mode, res)` after their fetch. */
export async function getGitHubRequestHeaders(): Promise<{
  headers: Record<string, string>;
  mode: "app" | "pat";
}> {
  const auth = await getAuthForRequest();
  return {
    headers: {
      Authorization: auth.header,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    mode: auth.mode,
  };
}

/** Merge caller-supplied headers with GitHub auth/default headers.
 *  `RequestInit.headers` is `HeadersInit` — it may be a `Headers`
 *  instance, a `[string, string][]` tuple array, or a plain object.
 *  Object-spread silently drops headers for the first two forms
 *  (`{...new Headers()}` is `{}`, `{...[["k","v"]]}` produces numeric
 *  keys). Pipe through the `Headers` constructor so all three shapes
 *  survive, then apply GitHub auth on top. */
function mergeRequestHeaders(
  callerHeaders: HeadersInit | undefined,
  authHeaders: Record<string, string>,
): Headers {
  const merged = new Headers(callerHeaders);
  for (const [key, value] of Object.entries(authHeaders)) {
    merged.set(key, value);
  }
  return merged;
}

/** Low-level fetch with one-retry on App 401. Installation tokens can
 *  go stale between requests (key rotation, permissions revoked at the
 *  org) and our cache would keep serving them for up to 55 min. On a
 *  401 from App auth, clear the cache and try once more — the retry
 *  refetches a fresh token (or falls through to PAT if App is broken
 *  entirely). Rate-limit capture happens for both attempts. */
export async function githubRawFetch(
  url: string,
  init?: RequestInit,
): Promise<{ res: Response; mode: "app" | "pat" }> {
  let { headers, mode } = await getGitHubRequestHeaders();
  let res = await fetch(url, {
    ...init,
    headers: mergeRequestHeaders(init?.headers, headers),
    cache: "no-store",
  });
  captureRateLimitForMode(mode, res);

  if (res.status === 401 && mode === "app") {
    clearInstallationTokenCache();
    ({ headers, mode } = await getGitHubRequestHeaders());
    res = await fetch(url, {
      ...init,
      headers: mergeRequestHeaders(init?.headers, headers),
      cache: "no-store",
    });
    captureRateLimitForMode(mode, res);
  }
  return { res, mode };
}

// --- Sanitize ---

function sanitizeErrorText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/token[=:]\s*["']?[A-Za-z0-9._-]+/gi, "token=[REDACTED]")
    .substring(0, 500);
}

// --- Rate-limit public surface (kept stable for existing callers) ---

/**
 * Last-seen rate limit for the CURRENTLY-ACTIVE auth mode. The backfill
 * circuit breaker consumes this — it cares about the bucket it's about
 * to draw from next. App and PAT have separate buckets; the selector
 * flips between them.
 */
export function getLastKnownRateLimit(): { remaining: number; limit: number; resetAt: Date } | null {
  const snap = getActiveRateLimit();
  return snap ? { ...snap } : null;
}

// --- Fetch ---

export async function githubFetch<T>(path: string): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `https://api.github.com${path}`;

  const { res } = await githubRawFetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GitHub API error ${res.status}: ${sanitizeErrorText(text)}`,
    );
  }

  return res.json();
}

// Paginated fetch — follows Link header
export async function githubFetchAll<T>(path: string, maxPages = 10): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = path.startsWith("http")
    ? path
    : `https://api.github.com${path}`;
  let page = 0;

  while (url && page < maxPages) {
    const { res } = await githubRawFetch(url);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `GitHub API error ${res.status}: ${sanitizeErrorText(text)}`,
      );
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      results.push(...data);
    }

    // Parse Link header for next page
    const linkHeader: string | null = res.headers.get("link");
    const nextMatch: RegExpMatchArray | null = linkHeader?.match(/<([^>]+)>;\s*rel="next"/) ?? null;
    url = nextMatch ? nextMatch[1] : null;
    page++;
  }

  return results;
}

// --- Webhook Signature Verification ---

export function verifyWebhookSignature(
  body: string,
  signature: string | null,
): boolean {
  const { webhookSecret } = getGitHubConfig();

  // If no secret configured, skip verification (but log warning)
  if (!webhookSecret) {
    console.warn("GITHUB_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }

  if (!signature) return false;

  const expected =
    "sha256=" + createHmac("sha256", webhookSecret).update(body).digest("hex");

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// --- Rate Limit ---

/**
 * Active poll of the GitHub rate-limit endpoint. Preferred over the
 * passively-captured `lastRateLimit` when you need a guaranteed-fresh
 * reading (e.g., pre-flight check at the start of a long-running
 * backfill). The `/rate_limit` endpoint itself does NOT count against
 * the rate limit — it's free to call.
 *
 * Also updates the active-mode rate-limit snapshot as a side effect via
 * `githubFetch`.
 */
export async function getRateLimit(): Promise<{
  remaining: number;
  limit: number;
  reset: number;
}> {
  const data = await githubFetch<{
    rate: { remaining: number; limit: number; reset: number };
  }>("/rate_limit");
  return data.rate;
}
