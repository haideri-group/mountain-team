import { getInstallationToken, isAppAuthConfigured } from "./app-auth";

export { isAppAuthConfigured };

/**
 * Dual-auth selector: prefer GitHub App, fall back to PAT when the App
 * is unavailable for any reason:
 *   - App env vars missing / private key malformed
 *   - Installation-token exchange errored out (4xx/5xx)
 *   - App's rate-limit budget is exhausted (remaining < floor)
 *
 * Rate-limit state is tracked per mode so we flip back to App once
 * its window resets, rather than sticking on PAT forever.
 */

const FALLBACK_FLOOR = Number.parseInt(
  process.env.GITHUB_APP_FALLBACK_FLOOR || "200",
  10,
);

export type AuthMode = "app" | "pat" | "none";

interface RateLimitSnapshot {
  remaining: number;
  limit: number;
  resetAt: Date;
}

let appRate: RateLimitSnapshot | null = null;
let patRate: RateLimitSnapshot | null = null;
let lastUsedMode: AuthMode = "none";

/** Whether PAT env is populated (and isn't a placeholder). */
function isPatConfigured(): boolean {
  const t = process.env.GITHUB_TOKEN || "";
  return !!t && !t.includes("your-github");
}

/** True if a mode has budget to spend. Null snapshot = unused = assume healthy.
 *  Expired reset-at = window rolled over, treat as healthy (headers will
 *  refresh on next call). */
function modeIsHealthy(snap: RateLimitSnapshot | null): boolean {
  if (!snap) return true;
  if (snap.resetAt.getTime() <= Date.now()) return true;
  return snap.remaining > FALLBACK_FLOOR;
}

/** Choose which auth mode to use for the NEXT request.
 *  Prefer App when healthy. Fall back to PAT when App is unconfigured OR
 *  exhausted. Flip back to App automatically once its window resets. */
function selectMode(): AuthMode {
  const appOk = isAppAuthConfigured();
  const patOk = isPatConfigured();

  if (appOk && modeIsHealthy(appRate)) return "app";
  if (patOk && modeIsHealthy(patRate)) return "pat";
  // Both exhausted but at least one exists → return it (caller surfaces 403).
  if (appOk) return "app";
  if (patOk) return "pat";
  return "none";
}

/** Return Authorization header + auth mode used. Caller should pass the
 *  mode back into `captureRateLimitForMode(mode, res)` after the fetch. */
export async function getAuthForRequest(): Promise<{
  header: string;
  mode: Exclude<AuthMode, "none">;
}> {
  const mode = selectMode();
  if (mode === "none") {
    throw new Error(
      "No GitHub auth configured — set GITHUB_APP_* or GITHUB_TOKEN",
    );
  }
  lastUsedMode = mode;

  if (mode === "app") {
    try {
      const token = await getInstallationToken();
      return { header: `Bearer ${token}`, mode };
    } catch (err) {
      // App token exchange failed (malformed key, network blip, etc.).
      // Fall through to PAT if available.
      console.warn(
        "GitHub App token exchange failed — falling back to PAT:",
        err instanceof Error ? err.message : String(err),
      );
      if (isPatConfigured()) {
        lastUsedMode = "pat";
        return { header: `Bearer ${process.env.GITHUB_TOKEN}`, mode: "pat" };
      }
      throw err;
    }
  }

  // PAT
  return { header: `Bearer ${process.env.GITHUB_TOKEN}`, mode: "pat" };
}

/** Update the tracked rate-limit snapshot for whichever auth mode just
 *  made a request. Only core-bucket responses update the snapshot;
 *  search and graphql endpoints have their own smaller quotas (e.g.
 *  30/min for search) and would corrupt the core state — see
 *  `x-ratelimit-resource` header (GitHub sends `core`, `search`, or
 *  `graphql`). Silently no-ops if headers are absent or non-core. */
export function captureRateLimitForMode(mode: AuthMode, res: Response): void {
  if (mode === "none") return;
  const resource = res.headers.get("x-ratelimit-resource");
  // GitHub returns `x-ratelimit-resource` on every authenticated response.
  // If it's missing, err on the side of ignoring the update — unknown
  // resource is safer than corrupting the core snapshot.
  if (resource !== "core") return;

  const remaining = res.headers.get("x-ratelimit-remaining");
  const limit = res.headers.get("x-ratelimit-limit");
  const reset = res.headers.get("x-ratelimit-reset");
  if (remaining === null || reset === null) return;
  const remainingNum = Number.parseInt(remaining, 10);
  const resetSec = Number.parseInt(reset, 10);
  if (!Number.isFinite(remainingNum) || !Number.isFinite(resetSec)) return;

  const snap: RateLimitSnapshot = {
    remaining: remainingNum,
    limit: limit ? Number.parseInt(limit, 10) : 5000,
    resetAt: new Date(resetSec * 1000),
  };

  if (mode === "app") appRate = snap;
  else patRate = snap;
}

/** Last-seen rate limit for the auth mode that ACTUALLY served recent
 *  requests — not the one `selectMode()` would pick next. Those diverge
 *  when App token exchange fails and requests transparently fall back to
 *  PAT: `selectMode()` still returns "app" (env is configured), but the
 *  real quota being drawn down is PAT's. Following `lastUsedMode` makes
 *  the backfill circuit breaker observe the bucket we're truly consuming.
 *
 *  Returns null when:
 *    - no request has been made yet (cold start)
 *    - the snapshot's `resetAt` has already passed (stale — the next
 *      successful call will refresh it; meanwhile treat as "unknown"
 *      so the breaker doesn't trip on pre-reset counters). */
export function getActiveRateLimit(): RateLimitSnapshot | null {
  const snap =
    lastUsedMode === "app"
      ? appRate
      : lastUsedMode === "pat"
        ? patRate
        : null;
  if (!snap) return null;
  if (snap.resetAt.getTime() <= Date.now()) return null;
  return snap;
}

/** Diagnostic view of both auth modes and their rate-limit state. */
export function getAuthModeStatus() {
  return {
    selectedMode: selectMode(),
    lastUsedMode,
    app: {
      configured: isAppAuthConfigured(),
      rateLimit: appRate ? { ...appRate } : null,
      healthy: modeIsHealthy(appRate),
    },
    pat: {
      configured: isPatConfigured(),
      rateLimit: patRate ? { ...patRate } : null,
      healthy: modeIsHealthy(patRate),
    },
    fallbackFloor: FALLBACK_FLOOR,
  };
}
