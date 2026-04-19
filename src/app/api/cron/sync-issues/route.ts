import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import { runIssueSync, type IssueSyncType } from "@/lib/sync/issue-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";
import { consumePendingManual } from "@/lib/sync/triggers";

export async function GET(request: Request) {
  try {
    // Verify secret for cron auth
    const authHeader = request.headers.get("authorization");
    const expectedSecret =
      process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (
      !expectedSecret ||
      authHeader !== `Bearer ${expectedSecret}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Determine sync type: full if no previous sync or last sync > 24h ago
    let syncType: IssueSyncType = "full";

    const [lastSync] = await db
      .select()
      .from(syncLogs)
      .where(inArray(syncLogs.type, ["full", "incremental", "manual"]))
      .orderBy(desc(syncLogs.startedAt))
      .limit(1);

    if (
      lastSync?.status === "completed" &&
      lastSync.startedAt
    ) {
      const hoursSince =
        (Date.now() - new Date(lastSync.startedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        syncType = "incremental";
      }
    }

    // Family-aware lock: an in-flight `manual` or `full` run will defer
    // the scheduled `incremental` — all three land in the same `issue`
    // family, so we don't double-hit JIRA.
    if (!tryAcquireSyncLock(syncType)) {
      const lock = getActiveLock(syncType);
      return NextResponse.json({
        success: true,
        deferred: true,
        reason: "already_running",
        runningSince: lock?.startedAt.toISOString() ?? null,
      });
    }

    try {
      // Consume any "Run Now" marker set by the /automations panel, pass
      // source + user directly into the runner so the INSERT itself
      // carries the correct triggeredBy — no after-the-fact UPDATE race.
      const pending = await consumePendingManual(syncType);
      console.log(
        `[cron/sync-issues] syncType=${syncType} pending=${JSON.stringify(pending)}`,
      );
      const { logId, result } = await runIssueSync(syncType, undefined, {
        triggeredBy: pending ? "manual" : "cron",
        triggeredByUserId: pending?.userId ?? null,
      });

      return NextResponse.json({
        success: true,
        syncType,
        logId,
        inserted: result.inserted,
        updated: result.updated,
        skippedNoBoard: result.skippedNoBoard,
        total: result.total,
        errors: result.errors,
      });
    } finally {
      releaseSyncLock(syncType);
    }
  } catch (error) {
    console.error("Cron issue sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
