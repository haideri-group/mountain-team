import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runWorklogSync } from "@/lib/sync/worklog-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const days = Math.max(1, Math.min(parseInt(url.searchParams.get("days") || "7", 10) || 7, 90));

    if (!tryAcquireSyncLock("worklog_sync")) {
      const lock = getActiveLock("worklog_sync");
      return NextResponse.json(
        {
          error: "A worklog sync is already in progress",
          runningSince: lock?.startedAt.toISOString() ?? null,
        },
        { status: 409 },
      );
    }

    try {
      const { logId, result } = await runWorklogSync(days);

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
    console.error("Worklog sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
