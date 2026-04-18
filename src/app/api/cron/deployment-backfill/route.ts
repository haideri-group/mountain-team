import { NextResponse } from "next/server";
import { runDeploymentBackfill } from "@/lib/sync/deployment-backfill";
import { sanitizeErrorText } from "@/lib/jira/client";

/**
 * Cron entry point for the Phase 20 deployment backfill.
 *
 * Schedule: every 3 hours (30 0,3,6,9,12,15,18,21 * * *) — 00:30, 03:30, 06:30, 09:30,
 * 12:30, 15:30, 18:30, 21:30 UTC. The offset avoids the busy 06:00–06:10
 * window used by team/issue/release syncs so those finish first.
 *
 * Runs synchronously inside the request. Per-run cap (200 issues default)
 * keeps the duration bounded; the runner's rate-limit circuit breaker
 * stops cleanly if GitHub quota drops below the floor.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.SYNC_SECRET;
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runDeploymentBackfill();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      recorded: result.recorded,
      errors: result.errors,
      rateLimitStopped: result.rateLimitStopped,
      deferred: result.deferred,
      durationMs: result.durationMs,
      checkpointAtJiraKey: result.checkpointAtJiraKey,
    });
  } catch (error) {
    console.error("Cron deployment-backfill failed:", error);
    return NextResponse.json(
      { error: sanitizeErrorText(error instanceof Error ? error.message : "Backfill failed") },
      { status: 500 },
    );
  }
}
