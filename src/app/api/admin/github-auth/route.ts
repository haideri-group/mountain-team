import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthModeStatus } from "@/lib/github/auth-mode";
import { getCachedInstallationTokenExpiry } from "@/lib/github/app-auth";
import { getRateLimit } from "@/lib/github/client";
import { sanitizeErrorText } from "@/lib/jira/client";

/**
 * Diagnostic endpoint — shows both GitHub auth modes, their current
 * rate-limit state, and which mode the selector would pick right now.
 *
 * Useful for verifying the App flow works in prod before removing the
 * PAT, and for observing quota headroom at a glance.
 *
 * Admin-only. Does not expose the token itself or any secret material.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const probe = url.searchParams.get("probe") === "1";

  // Optionally do a live `/rate_limit` call (free — doesn't count against
  // the quota) so the snapshots refresh with the currently-selected mode.
  let probeResult: { ok: true; rate: { remaining: number; limit: number; reset: number } } | { ok: false; error: string } | null = null;
  if (probe) {
    try {
      const rate = await getRateLimit();
      probeResult = { ok: true, rate };
    } catch (err) {
      probeResult = { ok: false, error: sanitizeErrorText(err instanceof Error ? err.message : String(err)) };
    }
  }

  const status = getAuthModeStatus();
  return NextResponse.json({
    ...status,
    appTokenCacheExpiresAt: getCachedInstallationTokenExpiry(),
    probeResult,
  });
}
