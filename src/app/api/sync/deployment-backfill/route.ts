import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";
import {
  getDeploymentBackfillProgress,
  isBackfillRunning,
  runDeploymentBackfill,
} from "@/lib/sync/deployment-backfill";

/**
 * Admin endpoint for the Phase 20 deployment backfill.
 *
 * - `POST` triggers one run (same code path as the cron). Admin-only.
 * - `GET`  returns the last sync_logs row + live in-memory progress.
 *   Progress is polled by the Settings UI panel while a run is active.
 * - `GET ?progress=1` returns progress only (fast path, low DB load).
 */

export async function POST() {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    if (isBackfillRunning()) {
      return NextResponse.json(
        { error: "A deployment backfill is already running" },
        { status: 409 },
      );
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
    console.error("Manual deployment backfill failed:", error);
    return NextResponse.json(
      {
        error: sanitizeErrorText(
          error instanceof Error ? error.message : "Backfill failed",
        ),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const progressOnly = url.searchParams.get("progress") === "1";

    if (progressOnly) {
      return NextResponse.json({ progress: getDeploymentBackfillProgress() });
    }

    const [lastSync] = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.type, "deployment_backfill"))
      .orderBy(desc(syncLogs.startedAt))
      .limit(1);

    return NextResponse.json({
      lastSync: lastSync || null,
      progress: getDeploymentBackfillProgress(),
      isRunning: isBackfillRunning(),
    });
  } catch (error) {
    console.error("Failed to fetch deployment backfill status:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 },
    );
  }
}
