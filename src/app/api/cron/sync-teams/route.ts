import { NextResponse } from "next/server";
import { runTeamSync } from "@/lib/sync/team-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";

export async function GET(request: Request) {
  try {
    // Verify secret for cron auth (Vercel uses CRON_SECRET, we also accept SYNC_SECRET)
    const authHeader = request.headers.get("authorization");
    const expectedSecret =
      process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (
      !expectedSecret ||
      authHeader !== `Bearer ${expectedSecret}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Concurrency guard: skip the scheduled fire if a manual trigger is
    // still running (or vice-versa). Returns 200 with `deferred: true` so
    // Cronicle doesn't record a false-positive error.
    if (!tryAcquireSyncLock("team_sync")) {
      const lock = getActiveLock("team_sync");
      return NextResponse.json({
        success: true,
        deferred: true,
        reason: "already_running",
        runningSince: lock?.startedAt.toISOString() ?? null,
      });
    }

    try {
      const { logId, result } = await runTeamSync();

      return NextResponse.json({
        success: true,
        logId,
        added: result.added,
        departed: result.departed,
        updated: result.updated,
        rejoined: result.rejoined,
        unchanged: result.unchanged,
        total: result.total,
        errors: result.errors,
      });
    } finally {
      releaseSyncLock("team_sync");
    }
  } catch (error) {
    console.error("Cron team sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
