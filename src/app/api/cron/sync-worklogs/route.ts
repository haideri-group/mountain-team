import { NextResponse } from "next/server";
import { runWorklogSync } from "@/lib/sync/worklog-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!tryAcquireSyncLock("worklog_sync")) {
      const lock = getActiveLock("worklog_sync");
      return NextResponse.json({
        success: true,
        deferred: true,
        reason: "already_running",
        runningSince: lock?.startedAt.toISOString() ?? null,
      });
    }

    try {
      const { logId, result } = await runWorklogSync(7);

      return NextResponse.json({
        success: true,
        logId,
        issuesScanned: result.issuesScanned,
        worklogsUpserted: result.worklogsUpserted,
        errors: result.errors,
      });
    } finally {
      releaseSyncLock("worklog_sync");
    }
  } catch (error) {
    console.error("Cron worklog sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
