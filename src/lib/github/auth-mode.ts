import { getInstallationToken, isAppAuthConfigured } from "./app-auth";

export { isAppAuthConfigured };

/**
 * Dual-auth selector: prefer GitHub App when it's configured and working,
 * fall back to classic PAT only when the App is genuinely unavailable
 * (missing env vars, malformed private key, token-exchange 4xx/5xx).
 *
 * Important: we do NOT switch to PAT when the App is just low on quota.
 * That would use PAT as an overflow bucket for the same logical workload
 * — which GitHub treats as abuse of the secondary rate-limit system.
 * When the App is rate-limited, the request fails with 403; the backfill's
 * circuit breaker catches this and stops the batch cleanly.
 *
 * PAT fallback is a resilience pattern (App is broken → keep working),
 * not a throughput multiplier.
 */

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

/** Choose which auth mode to use for the NEXT request.
 *  Prefer App; fall back to PAT only if App isn't configured. Rate-limit
 *  state is observed for telemetry but deliberately NOT used to switch
 *  modes — see module-level comment for why. */
function selectMode(): AuthMode {
  if (isAppAuthConfigured()) return "app";
  if (isPatConfigured()) return "pat";
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
 *  made a request. Silently no-ops if headers are absent. */
export function captureRateLimitForMode(mode: AuthMode, res: Response): void {
  if (mode === "none") return;
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

/** Last-seen rate limit for the currently-active auth mode.
 *  Consumed by the deployment-backfill circuit breaker. */
export function getActiveRateLimit(): RateLimitSnapshot | null {
  const mode = selectMode();
  if (mode === "app") return appRate;
  if (mode === "pat") return patRate;
  return null;
}

/** Diagnostic view of both auth modes and their rate-limit state. */
export function getAuthModeStatus() {
  return {
    selectedMode: selectMode(),
    lastUsedMode,
    app: {
      configured: isAppAuthConfigured(),
      rateLimit: appRate ? { ...appRate } : null,
    },
    pat: {
      configured: isPatConfigured(),
      rateLimit: patRate ? { ...patRate } : null,
    },
  };
}
