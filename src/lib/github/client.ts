import { createHmac, timingSafeEqual } from "crypto";

// --- Config ---

export function getGitHubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || "",
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
  };
}

export function isGitHubConfigured(): boolean {
  const { token } = getGitHubConfig();
  return !!token && !token.includes("your-github");
}

function getAuthHeaders(): Record<string, string> {
  const { token } = getGitHubConfig();
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// --- Sanitize ---

function sanitizeErrorText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/token[=:]\s*["']?[A-Za-z0-9._-]+/gi, "token=[REDACTED]")
    .substring(0, 500);
}

// --- Fetch ---

/**
 * Last-seen GitHub rate-limit state, updated by every githubFetch /
 * githubFetchAll response that carries `X-RateLimit-*` headers.
 * Module-level so all GH-touching flows (per-issue sync, webhook,
 * backfill, etc.) contribute to one shared counter. Callers that care
 * (e.g., the deployment-backfill circuit breaker) read it via
 * `getLastKnownRateLimit()`.
 *
 * Null means we haven't seen a response yet this process lifetime.
 * After a restart, the next request repopulates it.
 */
let lastRateLimit: { remaining: number; limit: number; resetAt: Date } | null = null;

export function getLastKnownRateLimit(): { remaining: number; limit: number; resetAt: Date } | null {
  return lastRateLimit ? { ...lastRateLimit } : null;
}

/** Parse `X-RateLimit-*` headers from a fetch Response and update module state.
 *  Safe to call on any response — if headers are absent, nothing changes. */
function captureRateLimitHeaders(res: Response): void {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const limit = res.headers.get("x-ratelimit-limit");
  const reset = res.headers.get("x-ratelimit-reset");
  if (remaining === null || reset === null) return;
  const remainingNum = Number.parseInt(remaining, 10);
  const resetSec = Number.parseInt(reset, 10);
  if (!Number.isFinite(remainingNum) || !Number.isFinite(resetSec)) return;
  lastRateLimit = {
    remaining: remainingNum,
    limit: limit ? Number.parseInt(limit, 10) : lastRateLimit?.limit ?? 5000,
    resetAt: new Date(resetSec * 1000),
  };
}

export async function githubFetch<T>(path: string): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `https://api.github.com${path}`;

  const res = await fetch(url, {
    headers: getAuthHeaders(),
    cache: "no-store",
  });

  captureRateLimitHeaders(res);

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
    const res: Response = await fetch(url, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });

    captureRateLimitHeaders(res);

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
 * Also updates the module-level `lastRateLimit` as a side effect via
 * githubFetch.
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
