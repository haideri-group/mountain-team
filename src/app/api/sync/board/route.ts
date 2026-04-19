import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { runIssueSync, getSyncProgress } from "@/lib/sync/issue-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";

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

    // Family-aware lock: per-board manual sync shares the `issue` family
    // with scheduled full/incremental, so we can't double-fire JIRA.
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
    } finally {
      releaseSyncLock("manual");
    }
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
