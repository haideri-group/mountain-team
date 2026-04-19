import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import { runIssueSync, getSyncProgress } from "@/lib/sync/issue-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";

// POST /api/sync/issues -- Trigger manual issue sync (admin only)
export async function POST() {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    // Family-aware lock: `manual` shares the `issue` family with
    // `full` + `incremental`, so a running scheduled sync will 409 here.
    if (!tryAcquireSyncLock("manual")) {
      const lock = getActiveLock("manual");
      return NextResponse.json(
        {
          error: "An issue sync is already in progress",
          runningSince: lock?.startedAt.toISOString() ?? null,
        },
        { status: 409 },
      );
    }

    try {
      const { logId, result } = await runIssueSync("manual");

      return NextResponse.json({
        success: true,
        logId,
        inserted: result.inserted,
        updated: result.updated,
        skippedNoBoard: result.skippedNoBoard,
        total: result.total,
        errors: result.errors,
      });
    } finally {
      releaseSyncLock("manual");
    }
  } catch (error) {
    console.error("Manual issue sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}

// GET /api/sync/issues -- Get last sync status + live progress
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const progressOnly = url.searchParams.get("progress") === "1";

    // Fast path: just return live progress (polled during sync)
    if (progressOnly) {
      return NextResponse.json({ progress: getSyncProgress() });
    }

    const [lastSync] = await db
      .select()
      .from(syncLogs)
      .where(inArray(syncLogs.type, ["full", "incremental", "manual"]))
      .orderBy(desc(syncLogs.startedAt))
      .limit(1);

    return NextResponse.json({
      lastSync: lastSync || null,
      progress: getSyncProgress(),
    });
  } catch (error) {
    console.error("Failed to fetch issue sync status:", error);
    return NextResponse.json(
      { error: "Failed to fetch sync status" },
      { status: 500 },
    );
  }
}
