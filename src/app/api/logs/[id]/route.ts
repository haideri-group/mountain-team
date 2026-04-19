import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSyncLogById } from "@/lib/sync/logs-query";
import { isCronicleConfigured } from "@/lib/cronicle/client";
import { correlateSyncLog } from "@/lib/cronicle/correlate";
import { getDeploymentBackfillProgress } from "@/lib/sync/deployment-backfill";
import { getSyncProgress } from "@/lib/sync/issue-sync";

const RECLAIM_GRACE_MS = 2 * 60 * 1000;

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

  // Live progress (in-memory, only for types that expose it).
  let liveProgress:
    | ReturnType<typeof getDeploymentBackfillProgress>
    | ReturnType<typeof getSyncProgress>
    | null = null;
  if (log.status === "running") {
    if (log.type === "deployment_backfill") {
      liveProgress = getDeploymentBackfillProgress();
    } else if (
      log.type === "full" ||
      log.type === "incremental" ||
      log.type === "manual"
    ) {
      liveProgress = getSyncProgress();
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
      console.warn(
        "[logs] correlate failed:",
        err instanceof Error ? err.message : String(err),
      );
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
