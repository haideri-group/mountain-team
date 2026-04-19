import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSyncLogById } from "@/lib/sync/logs-query";
import { isCronicleConfigured } from "@/lib/cronicle/client";
import { correlateSyncLog } from "@/lib/cronicle/correlate";
import {
  getDeploymentBackfillProgress,
  getDeploymentBackfillProgressForLogId,
} from "@/lib/sync/deployment-backfill";
import {
  getSyncProgress,
  getSyncProgressForLogId,
} from "@/lib/sync/issue-sync";

const RECLAIM_GRACE_MS = 2 * 60 * 1000;

// Single outage-dedupe clock. This route is polled every second by the
// drawer while a row is `running`; a Cronicle outage would otherwise log
// a warning 60× per minute per open drawer. Log at most once per minute
// across all concurrent pollers (module-scoped).
let lastCronicleWarnAt = 0;
const CRONICLE_WARN_THROTTLE_MS = 60_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const log = await getSyncLogById(id);
  if (!log) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Live progress (in-memory, only for types that expose it). Keyed by
  // logId so opening a stale `running` row (from a crashed prior process)
  // does NOT show the CURRENT sync's progress attributed to the wrong
  // row — returns `null` when the in-memory activeLogId ≠ this row.
  let liveProgress:
    | ReturnType<typeof getDeploymentBackfillProgress>
    | ReturnType<typeof getSyncProgress>
    | null = null;
  if (log.status === "running") {
    if (log.type === "deployment_backfill") {
      liveProgress = getDeploymentBackfillProgressForLogId(log.id);
    } else if (
      log.type === "full" ||
      log.type === "incremental" ||
      log.type === "manual"
    ) {
      liveProgress = getSyncProgressForLogId(log.id);
    }
  }

  // Cronicle correlation (optional; graceful fallback).
  let cronicle: Awaited<ReturnType<typeof correlateSyncLog>> = null;
  let cronicleUnavailable = false;
  if (isCronicleConfigured()) {
    try {
      cronicle = await correlateSyncLog({
        type: log.type,
        startedAt: new Date(log.startedAt),
      });
      if (!cronicle) cronicleUnavailable = false; // just "no match", not "down"
    } catch (err) {
      const now = Date.now();
      if (now - lastCronicleWarnAt > CRONICLE_WARN_THROTTLE_MS) {
        lastCronicleWarnAt = now;
        console.warn(
          "[logs] correlate failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
      cronicleUnavailable = true;
    }
  } else {
    cronicleUnavailable = true;
  }

  const startedAt = new Date(log.startedAt).getTime();
  const canReclaim =
    log.status === "running" && Date.now() - startedAt > RECLAIM_GRACE_MS;

  return NextResponse.json({
    log,
    liveProgress,
    cronicle,
    cronicleUnavailable,
    canReclaim,
  });
}
