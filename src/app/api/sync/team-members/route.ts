import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { runTeamSync } from "@/lib/sync/team-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";

// POST /api/sync/team-members — Trigger manual sync (admin only)
export async function POST() {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    // Family-aware lock: blocks only if another team-sync is running
    // (scheduled cron or a concurrent admin click). Other families
    // (issues, releases, ...) are unaffected.
    if (!tryAcquireSyncLock("team_sync")) {
      const lock = getActiveLock("team_sync");
      return NextResponse.json(
        {
          error: "A team sync is already in progress",
          runningSince: lock?.startedAt.toISOString() ?? null,
        },
        { status: 409 },
      );
    }

    try {
      // Pass Google token for email matching if available
      const googleToken = session.user.googleAccessToken;
      const { logId, result } = await runTeamSync(googleToken);

      return NextResponse.json({
        success: true,
        logId,
        added: result.added,
        departed: result.departed,
        updated: result.updated,
        rejoined: result.rejoined,
        unchanged: result.unchanged,
        emailsMatched: result.emailsMatched,
        total: result.total,
        errors: result.errors,
      });
    } finally {
      releaseSyncLock("team_sync");
    }
  } catch (error) {
    console.error("Manual team sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}

// GET /api/sync/team-members — Get last sync status
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [lastSync] = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.type, "team_sync"))
      .orderBy(desc(syncLogs.startedAt))
      .limit(1);

    return NextResponse.json({ lastSync: lastSync || null });
  } catch (error) {
    console.error("Failed to fetch sync status:", error);
    return NextResponse.json(
      { error: "Failed to fetch sync status" },
      { status: 500 },
    );
  }
}
