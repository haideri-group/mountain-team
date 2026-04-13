import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runIssueSync, getSyncProgress } from "@/lib/sync/issue-sync";

// POST /api/sync/board?key=GOLC — Sync a single board (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const boardKey = request.nextUrl.searchParams.get("key");
    if (!boardKey) {
      return NextResponse.json(
        { error: "Board key is required (e.g., ?key=GOLC)" },
        { status: 400 },
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

    const { logId, result } = await runIssueSync("manual", boardKey.toUpperCase());

    return NextResponse.json({
      success: true,
      logId,
      boardKey: boardKey.toUpperCase(),
      inserted: result.inserted,
      updated: result.updated,
      skippedNoBoard: result.skippedNoBoard,
      total: result.total,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Board sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}

// GET /api/sync/board?progress=1 — Live progress for board sync
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ progress: getSyncProgress() });
  } catch (error) {
    return NextResponse.json({ progress: null });
  }
}
