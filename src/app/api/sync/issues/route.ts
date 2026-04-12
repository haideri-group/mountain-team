import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { runIssueSync, getSyncProgress } from "@/lib/sync/issue-sync";

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

    // Check if a sync is already running
    const [running] = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.status, "running"))
      .limit(1);

    if (running) {
      return NextResponse.json(
        { error: "A sync is already in progress" },
        { status: 409 },
      );
    }

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
