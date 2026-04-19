import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cronicleGet, isCronicleConfigured } from "@/lib/cronicle/client";
import {
  invalidateScheduleCache,
  listTeamFlowEvents,
} from "@/lib/cronicle/discovery";
import { TYPE_TO_URL_PATH } from "@/lib/cronicle/correlate";
import { getActiveLock, isSyncRunning } from "@/lib/sync/concurrency";
import { markPendingManual } from "@/lib/sync/triggers";
import type { SyncLogType } from "@/lib/sync/logs-query";

/**
 * POST /api/automations/cronicle/events/[id]/run
 *
 * Fires a one-off run of a Cronicle event. Admin-only.
 *
 * Constraints:
 *   - Event id MUST be one of the TeamFlow-category events discovered via
 *     `CRONICLE_TEAMFLOW_CATEGORY_ID`. An admin of this app can't use this
 *     endpoint to fire arbitrary homelab-wide Cronicle jobs — that would
 *     be privilege expansion beyond TeamFlow's scope.
 *   - Cronicle must be configured; otherwise we can't invoke anything.
 *
 * Implementation note: Cronicle's run_event API uses a POST shape but
 * our `cronicleGet` helper is GET-only. Calling `/api/app/run_event/v1`
 * with `?id=...` in the query string works for the instances we've
 * observed (Cronicle 0.9.74). If a future version rejects GET, switch to
 * a dedicated POST helper.
 */

interface CronicleRunResponse {
  code: number;
  ids?: string[];
  description?: string;
}

/**
 * Reverse of `TYPE_TO_URL_PATH` — given the URL the Cronicle event fires
 * at, return a representative `SyncLogType` whose family we can check.
 * Returns null for URLs not managed by TeamFlow syncs (in which case we
 * skip the pre-check and rely on the runner's internal guard).
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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!isCronicleConfigured()) {
    return NextResponse.json(
      { error: "Cronicle is not configured on this server" },
      { status: 503 },
    );
  }

  const { id } = await params;

  // Whitelist check: the event must belong to the TeamFlow category.
  const events = await listTeamFlowEvents();
  const event = events.find((e) => e.id === id);
  if (!event) {
    return NextResponse.json(
      { error: "Event is not in the TeamFlow category or not found" },
      { status: 404 },
    );
  }

  // Pre-check the family-aware concurrency lock. If a run is already in
  // flight (scheduled or another admin's click), surface a 409 rather than
  // firing a duplicate Cronicle job. This avoids two parallel hits against
  // the same upstream API for one logical cron.
  const eventUrl = event.params?.url ?? "";
  const representativeType = resolveSyncTypeFromUrl(eventUrl);
  if (representativeType && isSyncRunning(representativeType)) {
    const lock = getActiveLock(representativeType);
    return NextResponse.json(
      {
        error: "This cron is already running",
        runningSince: lock?.startedAt.toISOString() ?? null,
      },
      { status: 409 },
    );
  }

  // Mark BEFORE firing Cronicle so whenever Cronicle's subsequent HTTP
  // call to /api/cron/* lands, `consumePendingManual` returns true and
  // the sync_log row gets stamped `triggeredBy='manual'` instead of
  // inheriting the default `cron`. 60s TTL is plenty of headroom —
  // Cronicle typically dispatches within 1–3 seconds of run_event.
  console.log(
    `[run-now] eventId=${id} eventUrl=${eventUrl} representativeType=${representativeType ?? "null"} sessionUserId=${session.user.id ?? "null"}`,
  );
  if (representativeType) {
    markPendingManual(representativeType, session.user.id ?? null);
  } else {
    console.warn(
      `[run-now] NOT stamping manual: representativeType could not be resolved for url=${eventUrl}`,
    );
  }

  const res = await cronicleGet<CronicleRunResponse>("/api/app/run_event/v1", {
    id,
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Cronicle call failed: ${res.error}` },
      { status: 502 },
    );
  }
  if (res.data.code !== 0) {
    return NextResponse.json(
      {
        error: `Cronicle rejected the trigger: ${res.data.description ?? "code=" + res.data.code}`,
      },
      { status: 502 },
    );
  }

  // Drop the schedule + history caches so the UI's next refetch sees
  // the new job in Cronicle's history instead of the pre-trigger snapshot.
  invalidateScheduleCache();

  const jobIds = res.data.ids ?? [];
  return NextResponse.json({
    success: true,
    eventId: id,
    eventTitle: event.title,
    jobIds,
  });
}
