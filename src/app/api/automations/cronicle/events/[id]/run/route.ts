import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  invalidateScheduleCache,
  listTeamFlowEvents,
} from "@/lib/cronicle/discovery";
import { TYPE_TO_URL_PATH } from "@/lib/cronicle/correlate";
import {
  getActiveLock,
  isSyncRunning,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";
import { runIssueSync } from "@/lib/sync/issue-sync";
import { runTeamSync } from "@/lib/sync/team-sync";
import { runReleaseSync } from "@/lib/sync/release-sync";
import { runWorklogSync } from "@/lib/sync/worklog-sync";
import { runTimeDoctorSync } from "@/lib/sync/timedoctor-sync";
import { runDeploymentBackfill } from "@/lib/sync/deployment-backfill";
import type { SyncLogType } from "@/lib/sync/logs-query";

/**
 * POST /api/automations/cronicle/events/[id]/run
 *
 * Triggers a one-off run of a TeamFlow sync that's registered as a
 * Cronicle event. Admin-only.
 *
 * Architecture note: previously this endpoint called Cronicle's
 * `run_event` API to let Cronicle dispatch the HTTP fire. That worked
 * for record-keeping (Cronicle history showed the manual run) but
 * introduced a cross-process bug: if Cronicle's configured URL is a
 * DIFFERENT server than the one receiving the Run click (e.g. dev
 * clicks but Cronicle fires prod), the dev-process's marker registry
 * is useless — prod has no idea the run was manual, so it stamps
 * `triggeredBy='cron'`.
 *
 * New approach: run the sync DIRECTLY on whichever server received
 * the click. Same process → session.user.id is captured, the runner's
 * INSERT stamps `triggeredBy='manual'` + the userId with zero indirection.
 * Fire-and-forget so the HTTP response returns immediately; the
 * runner logs its own completion via the existing sync_logs + SSE
 * channels. Concurrency lock prevents parallel runs.
 *
 * Trade-off: Cronicle's own job history no longer records manual runs.
 * The /automations page reads from sync_logs (the source of truth for
 * the app) so the admin still sees everything there.
 */

function resolveSyncTypeFromUrl(url: string): SyncLogType | null {
  for (const [type, path] of Object.entries(TYPE_TO_URL_PATH) as Array<
    [SyncLogType, string]
  >) {
    if (!path) continue;
    if (url.includes(path)) return type;
  }
  return null;
}

function fireRunner(
  type: SyncLogType,
  userId: string | null,
): Promise<unknown> {
  const opts = { triggeredBy: "manual" as const, triggeredByUserId: userId };
  switch (type) {
    case "team_sync":
      return runTeamSync(undefined, opts);
    case "full":
    case "incremental":
    case "manual":
      return runIssueSync(type, undefined, opts);
    case "release_sync":
      return runReleaseSync(opts);
    case "worklog_sync":
      return runWorklogSync(7, opts);
    case "timedoctor_sync":
      return runTimeDoctorSync(7, opts);
    case "deployment_backfill":
      return runDeploymentBackfill(opts);
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  // Whitelist check: the event must belong to the TeamFlow category.
  // This also gives us the event's URL so we can map it to a sync type.
  const events = await listTeamFlowEvents();
  const event = events.find((e) => e.id === id);
  if (!event) {
    return NextResponse.json(
      { error: "Event is not in the TeamFlow category or not found" },
      { status: 404 },
    );
  }

  const eventUrl = event.params?.url ?? "";
  const representativeType = resolveSyncTypeFromUrl(eventUrl);
  if (!representativeType) {
    return NextResponse.json(
      { error: `No TeamFlow sync type mapped to URL: ${eventUrl}` },
      { status: 400 },
    );
  }

  // Pre-check concurrency lock — surface a 409 so the UI toast can
  // explain "already running" instead of silently firing a duplicate.
  if (isSyncRunning(representativeType)) {
    const lock = getActiveLock(representativeType);
    return NextResponse.json(
      {
        error: "This cron is already running",
        runningSince: lock?.startedAt.toISOString() ?? null,
      },
      { status: 409 },
    );
  }

  // Acquire the lock NOW so the fire-and-forget run below owns it for
  // the entire duration. Concurrency guarantees are preserved even
  // though we aren't awaiting the runner.
  if (!tryAcquireSyncLock(representativeType)) {
    const lock = getActiveLock(representativeType);
    return NextResponse.json(
      {
        error: "This cron is already running",
        runningSince: lock?.startedAt.toISOString() ?? null,
      },
      { status: 409 },
    );
  }

  const userId = session.user.id ?? null;

  // Fire-and-forget: return to the client immediately with the lock
  // held; the runner writes its own sync_log row (with triggeredBy=
  // 'manual' + userId) and releases the lock when it completes.
  (async () => {
    try {
      await fireRunner(representativeType, userId);
    } catch (err) {
      console.error(
        `[run-now] runner failed for ${representativeType}:`,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      releaseSyncLock(representativeType);
      // Invalidate Cronicle schedule cache so the panel refreshes.
      invalidateScheduleCache();
    }
  })();

  return NextResponse.json({
    success: true,
    eventId: id,
    eventTitle: event.title,
    syncType: representativeType,
    triggeredBy: "manual",
    triggeredByUserId: userId,
  });
}
