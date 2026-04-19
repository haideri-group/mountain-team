import "server-only";
import { cronicleGet, isCronicleConfigured } from "./client";
import {
  findRunningSyncLog,
  findSyncLogIdNearTime,
  getSyncLogStatusById,
  type SyncLogType,
} from "@/lib/sync/logs-query";
import { TYPE_TO_URL_PATH } from "./correlate";
import { getSyncProgressForLogId } from "@/lib/sync/issue-sync";
import { getDeploymentBackfillProgressForLogId } from "@/lib/sync/deployment-backfill";
import type { CronicleEvent, CronicleEventPublic, CronicleJob } from "./types";

/**
 * Category-based discovery of TeamFlow Cronicle events. Replaces any
 * hardcoded event-ID mapping — admins can add a new TeamFlow cron
 * through the Cronicle UI (as long as they assign it to the category
 * whose ID matches `CRONICLE_TEAMFLOW_CATEGORY_ID`) without a code change.
 *
 * All failures are swallowed and return empty results. The caller
 * (`/api/automations` routes or the UI panel) surfaces `unavailable: true`
 * in the response so the client can show a dismissible banner without
 * breaking the rest of the page.
 */

// 60s TTL for the schedule (small, rarely-changing list of ~4 events).
// 30s TTL for per-event history (we re-query when user opens a drawer,
// but don't want drawer-open storms to hammer Cronicle).
const SCHEDULE_TTL_MS = 60_000;
const HISTORY_TTL_MS = 30_000;

let scheduleCache: { at: number; events: CronicleEvent[] } | null = null;
const historyCache = new Map<string, { at: number; jobs: CronicleJob[] }>();

function getCategoryId(): string | null {
  return process.env.CRONICLE_TEAMFLOW_CATEGORY_ID || null;
}

function extractUrlPath(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export interface TeamFlowSchedule {
  events: CronicleEvent[];
  /** True when we could not fetch a fresh schedule AND have no cached
   *  schedule to fall back to. The UI surfaces this as a banner; array
   *  consumers that only need `events` can ignore it. */
  unavailable: boolean;
  /** Human-readable reason when unavailable (missing env, fetch error,
   *  category unset). Used in the UI banner. */
  reason?: string;
}

/**
 * Full-detail version of `listTeamFlowEvents` that distinguishes
 * three zero-event scenarios:
 *   1. Cronicle not configured / category env var missing → `unavailable: true`
 *   2. Cronicle fetch failed and no stale cache → `unavailable: true`
 *   3. Cronicle healthy but category is empty → `unavailable: false, events: []`
 *
 * Cached 60s for the success path; on failure it returns the last
 * successful cache (if any) AND flags `unavailable: true` so the UI
 * can show the "data may be stale" banner without hiding the data.
 */
export async function getTeamFlowSchedule(): Promise<TeamFlowSchedule> {
  if (!isCronicleConfigured()) {
    return { events: [], unavailable: true, reason: "cronicle_not_configured" };
  }
  const categoryId = getCategoryId();
  if (!categoryId) {
    return {
      events: [],
      unavailable: true,
      reason: "CRONICLE_TEAMFLOW_CATEGORY_ID not set",
    };
  }

  const now = Date.now();
  if (scheduleCache && now - scheduleCache.at < SCHEDULE_TTL_MS) {
    return { events: scheduleCache.events, unavailable: false };
  }

  const res = await cronicleGet<{ rows: CronicleEvent[] }>(
    "/api/app/get_schedule/v1",
  );
  if (!res.ok) {
    console.warn("[cronicle] schedule fetch failed:", res.error);
    // Serve stale cache if we have one, but flag as unavailable so
    // callers can show "data may be stale" to the admin.
    return {
      events: scheduleCache?.events ?? [],
      unavailable: true,
      reason: res.error,
    };
  }

  const events = (res.data.rows || []).filter(
    (e) => e.category === categoryId,
  );
  scheduleCache = { at: now, events };
  return { events, unavailable: false };
}

/**
 * Legacy shortcut kept for callers that only need the events array (the
 * Cronicle correlate + run endpoints). For the admin `/automations`
 * events API route, prefer `getTeamFlowSchedule()` so the UI gets an
 * explicit `unavailable` signal.
 */
export async function listTeamFlowEvents(): Promise<CronicleEvent[]> {
  return (await getTeamFlowSchedule()).events;
}

/** Force the next `listTeamFlowEvents` / `listEventHistory` call to
 *  hit Cronicle fresh. Call this after mutating actions (e.g. triggering
 *  a run) so the UI sees the new state on its next poll instead of
 *  serving the pre-mutation snapshot for up to a minute. */
export function invalidateScheduleCache(): void {
  scheduleCache = null;
  historyCache.clear();
}

/** Per-event history, cached 30s per eventId. */
export async function listEventHistory(
  eventId: string,
  limit = 20,
): Promise<CronicleJob[]> {
  if (!isCronicleConfigured()) return [];
  const key = `${eventId}:${limit}`;
  const cached = historyCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < HISTORY_TTL_MS) return cached.jobs;

  const res = await cronicleGet<{ rows: CronicleJob[] }>(
    "/api/app/get_event_history/v1",
    { id: eventId, limit: String(limit) },
  );
  if (!res.ok) {
    console.warn(`[cronicle] history fetch failed for ${eventId}:`, res.error);
    return cached?.jobs ?? [];
  }
  const jobs = res.data.rows || [];
  historyCache.set(key, { at: now, jobs });
  return jobs;
}

/** Convert a Cronicle job record into the public status taxonomy.
 *
 *  Cronicle's API is inconsistent: `time_end` is frequently null on
 *  historical records EVEN WHEN the job finished cleanly. The true
 *  signal of completion is `code` (0 = success, non-zero = error) or
 *  `elapsed` (set when the job ended). Only treat as "running" when
 *  BOTH are missing — indicating the job genuinely has no completion
 *  data yet. */
function normalizeJobStatus(
  job: CronicleJob,
): "success" | "error" | "timeout" | "running" {
  const hasCompletionData =
    (job.code !== undefined && job.code !== null) ||
    (job.elapsed !== undefined && job.elapsed !== null);
  if (!hasCompletionData) return "running";
  if (job.code === 0) return "success";
  if (/timeout/i.test(job.description ?? "")) return "timeout";
  return "error";
}

/**
 * Compute the next fire timestamp (epoch seconds) for a Cronicle event's
 * timing spec. Best-effort: handles the common shape we use
 * (hours + minutes, optional days/months/weekdays) without a full cron
 * parser. For exotic timings, returns null and the UI omits the field.
 */
function computeNextRun(
  timing: CronicleEvent["timing"],
  fromMs = Date.now(),
): number | null {
  // Cronicle stores hours/minutes as arrays but does NOT guarantee order —
  // [23, 9] would pick 23:00 as "next" when 9:00 (tomorrow) is actually
  // closer. Sort ascending before the inner loops so the first match we
  // find IS the earliest upcoming fire within each day.
  const hours = [...(timing.hours ?? [])].sort((a, b) => a - b);
  const minutes = [...(timing.minutes ?? [])].sort((a, b) => a - b);
  if (hours.length === 0 || minutes.length === 0) return null;

  const base = new Date(fromMs);
  // 8 days was enough for the daily/3-hourly TeamFlow jobs, but day-of-
  // month or month-gated schedules can have their next fire further out.
  // 366 guarantees at least one candidate for any annual schedule.
  for (let dayOffset = 0; dayOffset < 366; dayOffset++) {
    const probe = new Date(base);
    probe.setUTCDate(base.getUTCDate() + dayOffset);
    // Gate by weekdays/months/days if specified
    if (timing.months && timing.months.length > 0) {
      if (!timing.months.includes(probe.getUTCMonth() + 1)) continue;
    }
    if (timing.days && timing.days.length > 0) {
      if (!timing.days.includes(probe.getUTCDate())) continue;
    }
    if (timing.weekdays && timing.weekdays.length > 0) {
      if (!timing.weekdays.includes(probe.getUTCDay())) continue;
    }
    for (const h of hours) {
      for (const m of minutes) {
        const candidate = new Date(
          Date.UTC(
            probe.getUTCFullYear(),
            probe.getUTCMonth(),
            probe.getUTCDate(),
            h,
            m,
            0,
            0,
          ),
        );
        if (candidate.getTime() > fromMs) {
          return Math.floor(candidate.getTime() / 1000);
        }
      }
    }
  }
  return null;
}

/** Reverse of `TYPE_TO_URL_PATH`: given a URL path, return every
 *  `sync_logs.type` enum value whose cron route writes that URL. */
function syncTypesForUrlPath(urlPath: string): SyncLogType[] {
  if (!urlPath) return [];
  const types: SyncLogType[] = [];
  for (const [type, path] of Object.entries(TYPE_TO_URL_PATH) as [
    SyncLogType,
    string,
  ][]) {
    if (path && path === urlPath) types.push(type);
  }
  return types;
}

/**
 * Build the client-safe projection for an event, including its most-recent
 * run summary AND the id of the most recent correlated `sync_logs` row so
 * the UI can deep-link the last-run icon straight to the drawer.
 *
 * Never fails; missing history just leaves `lastRun: null`.
 */
export async function projectEventPublic(
  event: CronicleEvent,
): Promise<CronicleEventPublic> {
  const jobs = await listEventHistory(event.id, 1);
  const latest = jobs[0];

  // Look for a currently-RUNNING sync_log of this event's type FIRST.
  // Run Now invokes the runner directly (bypassing Cronicle), so
  // Cronicle's history won't have a matching job for a manual run —
  // but the sync_logs table will. Catching that here is what makes the
  // schedule panel's progress bar appear for manual runs too.
  let syncLogId: string | null = null;
  let runningSyncLog: Awaited<ReturnType<typeof findRunningSyncLog>> = null;
  const urlPath = extractUrlPath(event.params.url);
  const types = syncTypesForUrlPath(urlPath);
  if (types.length > 0) {
    try {
      runningSyncLog = await findRunningSyncLog(types);
      if (runningSyncLog) syncLogId = runningSyncLog.id;
    } catch (err) {
      console.warn(
        "[cronicle] running sync_log lookup failed for event",
        event.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Fall back to Cronicle-correlated sync_log — for the completed case
  // the schedule panel's "Last run" icon uses this to deep-link to the
  // specific drawer row that matches Cronicle's most recent job.
  if (!syncLogId && latest && types.length > 0) {
    const anchor = latest.time_start ?? latest.event_start;
    if (Number.isFinite(anchor)) {
      try {
        syncLogId = await findSyncLogIdNearTime({
          types,
          anchorEpochSec: anchor,
          windowSec: 60,
        });
      } catch (err) {
        console.warn(
          "[cronicle] sync_log lookup failed for event",
          event.id,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  // Build a direct Cronicle link for the icon to fall back to when we
  // have no matching app-side sync_logs row. Covers the case where
  // Cronicle couldn't even reach TeamFlow (DNS failure, connection
  // refused, TLS error) — the failure exists only in Cronicle's log
  // and this link takes the admin there.
  const cronicleBase = (process.env.CRONICLE_BASE_URL || "").replace(/\/$/, "");
  const jobDetailsUrl =
    latest && cronicleBase
      ? `${cronicleBase}/#JobDetails?id=${latest.id}`
      : null;

  // In-flight progress for the schedule panel's inline bar. We only surface
  // it when the sync_log is still `running` per our DB — the Cronicle
  // history endpoint is cached 30s so relying on its status alone can
  // keep showing "running" after the sync has actually completed. This
  // path queries the sync_log's current status live (cheap single-row
  // select) and pulls progress from the in-memory singleton only when
  // the activeLogId matches the id we're looking up.
  let progress: CronicleEventPublic["lastRun"] extends infer L
    ? L extends { progress: infer P }
      ? P
      : never
    : never = null;
  if (syncLogId) {
    try {
      const logStatus = await getSyncLogStatusById(syncLogId);
      if (logStatus?.status === "running") {
        const raw =
          logStatus.type === "deployment_backfill"
            ? getDeploymentBackfillProgressForLogId(syncLogId)
            : logStatus.type === "full" ||
                logStatus.type === "incremental" ||
                logStatus.type === "manual"
              ? getSyncProgressForLogId(syncLogId)
              : null;
        if (raw) {
          const processed =
            "issuesProcessed" in raw
              ? (raw.issuesProcessed ?? null)
              : null;
          const total =
            "issuesTotal" in raw ? (raw.issuesTotal ?? null) : null;
          const pct =
            processed !== null && total !== null && total > 0
              ? Math.min(100, Math.round((processed / total) * 100))
              : null;
          // Linear-extrapolation ETA: rate = processed / elapsed,
          // remaining = total - processed, eta = remaining / rate.
          // Skip when the signal is too noisy to be useful:
          //   - no total (indeterminate bar),
          //   - nothing processed yet (fetching phase),
          //   - < 5s elapsed (extrapolation is meaningless),
          //   - already at 100%.
          let etaSeconds: number | null = null;
          if (
            runningSyncLog &&
            processed !== null &&
            processed > 0 &&
            total !== null &&
            total > processed
          ) {
            const elapsedMs = Date.now() - runningSyncLog.startedAt.getTime();
            if (elapsedMs >= 5_000) {
              const rate = processed / (elapsedMs / 1000); // items per sec
              const remaining = total - processed;
              etaSeconds = Math.round(remaining / rate);
            }
          }
          progress = {
            phase: String(raw.phase ?? "running"),
            message: String(raw.message ?? ""),
            processed,
            total,
            pct,
            etaSeconds,
          };
        } else {
          // Sync IS running, but we can't see its in-memory progress:
          //   - different server process (scheduled cron on prod while
          //     viewing /automations on dev), OR
          //   - sync family that doesn't publish progress (team_sync,
          //     release_sync, worklog_sync, timedoctor_sync).
          // Fall back to an indeterminate bar so the admin can tell
          // the run is in flight without live counts. No ETA possible
          // without counts.
          progress = {
            phase: "running",
            message: "In progress",
            processed: null,
            total: null,
            pct: null,
            etaSeconds: null,
          };
        }
      }
    } catch (err) {
      // Never let the progress lookup break the whole projection.
      console.warn(
        "[cronicle] progress lookup failed for syncLog",
        syncLogId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Build lastRun. Prefer the running sync_log when one exists — that's
  // the authoritative source for "there's an active run" (regardless of
  // whether Cronicle has a matching job, which Run Now skips). Otherwise
  // fall back to Cronicle's latest job. Progress bar shows whenever
  // `progress` is populated AND status === "running".
  let lastRun: CronicleEventPublic["lastRun"] = null;
  if (runningSyncLog) {
    lastRun = {
      jobId: latest?.id,
      start: Math.floor(runningSyncLog.startedAt.getTime() / 1000),
      end: null,
      status: "running",
      elapsed: undefined,
      syncLogId,
      jobDetailsUrl,
      progress,
    };
  } else if (latest) {
    lastRun = {
      jobId: latest.id,
      start: latest.time_start,
      end: latest.time_end ?? null,
      status: normalizeJobStatus(latest),
      elapsed: latest.elapsed,
      syncLogId,
      jobDetailsUrl,
      progress,
    };
  }

  return {
    id: event.id,
    title: event.title,
    enabled: event.enabled === 1,
    urlPath,
    timing: event.timing,
    lastRun,
    nextRun: computeNextRun(event.timing),
  };
}

export { normalizeJobStatus };
