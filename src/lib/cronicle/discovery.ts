import "server-only";
import { cronicleGet, isCronicleConfigured } from "./client";
import {
  findRunningSyncLog,
  findSyncLogIdNearTime,
  getSyncLogStatusById,
  medianRecentDurationMs,
  type SyncLogType,
} from "@/lib/sync/logs-query";
import { TYPE_TO_URL_PATH } from "./correlate";
import { getSyncProgressForLogId } from "@/lib/sync/issue-sync";
import { getDeploymentBackfillProgressForLogId } from "@/lib/sync/deployment-backfill";
import { getTeamSyncProgressForLogId } from "@/lib/sync/team-sync";
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
 * Pick the Cronicle job whose `time_start` is closest to the anchor
 * timestamp (usually a sync_log's `startedAt` in epoch seconds). Used
 * instead of "just take the latest job" so the schedule panel's
 * external-link deep-links to the specific Cronicle fire that matches
 * the sync_log we're actually surfacing — not a later retry. Returns
 * `undefined` when `jobs` is empty or every entry lacks a usable time.
 */
function pickCorrelatedJob(
  jobs: CronicleJob[],
  anchorEpochSec: number,
): CronicleJob | undefined {
  let best: { job: CronicleJob; delta: number } | undefined;
  for (const j of jobs) {
    const t = j.time_start ?? j.event_start;
    if (!t) continue;
    const delta = Math.abs(t - anchorEpochSec);
    if (!best || delta < best.delta) best = { job: j, delta };
  }
  return best?.job;
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
 *  `sync_logs.type` enum value whose cron route writes that URL. Used
 *  for Cronicle-job-to-sync_log correlation, so it deliberately
 *  excludes `manual` (which has no corresponding Cronicle fire). */
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

/** Broader version used for the progress-bar projection. Includes
 *  `manual` as part of the issue-sync event so a Settings-page "Sync
 *  Issues" click (which writes type='manual') still surfaces its live
 *  progress under the issue-sync event on /automations. */
function runningTypesForUrlPath(urlPath: string): SyncLogType[] {
  const base = syncTypesForUrlPath(urlPath);
  // The three issue-sync entry points all share a sync family. If this
  // event represents that family, include all three.
  if (base.includes("full") || base.includes("incremental")) {
    const merged = new Set<SyncLogType>(base);
    merged.add("manual");
    return [...merged];
  }
  return base;
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
  // Fetch a small window of recent jobs so `pickCorrelatedJob` can
  // match the job that actually corresponds to our sync_log (instead of
  // blindly using the most recent Cronicle job, which could be a retry
  // that fired after the original timed out).
  const jobs = await listEventHistory(event.id, 5);
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
  // Broader set for "is something running?" — includes `manual` so a
  // Settings-page Sync Issues click still shows its progress on the
  // /automations panel under the issue-sync event.
  const runningTypes = runningTypesForUrlPath(urlPath);
  if (runningTypes.length > 0) {
    try {
      runningSyncLog = await findRunningSyncLog(runningTypes);
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

  // Resolve the Cronicle job that BEST corresponds to the sync_log
  // we're surfacing (by closest `time_start` to the sync_log's
  // `startedAt`). Using `latest` directly would point at a later
  // retry if Cronicle auto-retried after a timeout, which would send
  // the admin to the wrong job in the external-link flow.
  const syncLogStartSec = runningSyncLog
    ? Math.floor(runningSyncLog.startedAt.getTime() / 1000)
    : null;
  let correlatedJob: CronicleJob | undefined;
  if (syncLogStartSec !== null && jobs.length > 0) {
    correlatedJob = pickCorrelatedJob(jobs, syncLogStartSec);
  } else if (syncLogId && jobs.length > 0) {
    // Non-running sync_log — fetch its startedAt to anchor the pick.
    try {
      const anchorRow = await getSyncLogStatusById(syncLogId);
      void anchorRow;
      // Keep logic cheap: we don't need startedAt in this path because
      // `findSyncLogIdNearTime` above already matched the sync_log to
      // Cronicle's `time_start` within ±60s, so `latest` is overwhelmingly
      // the right pick. Leave `correlatedJob` as `undefined` → falls
      // through to `latest` below.
    } catch {
      // swallow
    }
  }
  const jobForLink = correlatedJob ?? latest;

  const cronicleBase = (process.env.CRONICLE_BASE_URL || "").replace(/\/$/, "");
  const jobDetailsUrl =
    jobForLink && cronicleBase
      ? `${cronicleBase}/#JobDetails?id=${jobForLink.id}`
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
              : logStatus.type === "team_sync"
                ? getTeamSyncProgressForLogId(syncLogId)
                : null;
        if (raw) {
          // Normalize across the three progress shapes:
          //   issue sync:         issuesProcessed / issuesTotal
          //   backfill:           issuesProcessed / issuesTotal
          //   team sync:          membersProcessed / membersTotal
          const processed =
            "membersProcessed" in raw
              ? (raw.membersProcessed ?? null)
              : "issuesProcessed" in raw
                ? (raw.issuesProcessed ?? null)
                : null;
          const total =
            "membersTotal" in raw
              ? (raw.membersTotal ?? null)
              : "issuesTotal" in raw
                ? (raw.issuesTotal ?? null)
                : null;
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
          // Sync IS running but this process can't see its in-memory
          // counts (different server, or sync type that doesn't publish
          // progress). Indeterminate bar, no ETA — real-time only.
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

  // Build lastRun following the truth hierarchy:
  //   1. Running sync_log → "running" (app is authoritative).
  //   2. Correlated sync_log that's terminal (completed/failed) → use
  //      sync_log's status. Cronicle's job might say "timeout" because
  //      its HTTP timeout fired while our handler was still working, but
  //      the app actually finished — we trust the app's record.
  //   3. Only a Cronicle job, no correlated sync_log → use Cronicle's
  //      status (DNS failures, crashes before logRunStart, etc.).
  //   4. Nothing → no last run.
  //
  // `statusSource` tells the client which rung of this hierarchy won,
  // so the drawer can render an "app succeeded but Cronicle timed out"
  // disclosure banner when appropriate.
  const cronicleJobStatus = jobForLink ? normalizeJobStatus(jobForLink) : null;
  let lastRun: CronicleEventPublic["lastRun"] = null;
  if (runningSyncLog) {
    lastRun = {
      jobId: jobForLink?.id,
      start: Math.floor(runningSyncLog.startedAt.getTime() / 1000),
      end: null,
      status: "running",
      statusSource: "app",
      elapsed: undefined,
      syncLogId,
      cronicleJobStatus,
      jobDetailsUrl,
      progress,
    };
  } else if (syncLogId) {
    // Correlated but not currently running — fetch the sync_log's
    // terminal status and project it. This is where the
    // Cronicle-says-timeout / app-says-completed case gets resolved
    // correctly.
    //
    // `row === null` means the sync_logs row was deleted between the
    // correlation step and this read (rare race — e.g. admin-purge
    // while the panel is mid-render). Treat that exactly like the
    // lookup throwing: fall back to Cronicle's verdict rather than
    // synthesizing a `running` app record, which would keep the 1s
    // poll loop alive against a row that no longer exists.
    let row: Awaited<ReturnType<typeof getSyncLogStatusById>> = null;
    try {
      row = await getSyncLogStatusById(syncLogId);
    } catch {
      row = null;
    }
    if (row) {
      let appStatus: "success" | "error" | "running" = "running";
      if (row.status === "completed") appStatus = "success";
      else if (row.status === "failed") appStatus = "error";
      else if (row.status === "running") appStatus = "running";
      // Best-effort: the anchor time belongs to the sync_log if we
      // have it, so the start timestamp on screen reflects the app's
      // view, not Cronicle's.
      const appStartSec = row.startedAt
        ? Math.floor(new Date(row.startedAt).getTime() / 1000)
        : (jobForLink?.time_start ?? 0);
      lastRun = {
        jobId: jobForLink?.id,
        start: appStartSec,
        end: jobForLink?.time_end ?? null,
        status: appStatus,
        statusSource: "app",
        elapsed: jobForLink?.elapsed,
        syncLogId,
        cronicleJobStatus,
        jobDetailsUrl,
        progress,
      };
    } else if (jobForLink) {
      // `row === null` means the sync_logs row we correlated against
      // no longer exists. Drop the stale `syncLogId` from the
      // projection — otherwise the panel renders the "open drawer"
      // button, which would open against a missing row and 404. With
      // `syncLogId: null`, the panel falls through to the external
      // Cronicle-job link, which is the correct UX for "no app-side
      // record."
      lastRun = {
        jobId: jobForLink.id,
        start: jobForLink.time_start,
        end: jobForLink.time_end ?? null,
        status: normalizeJobStatus(jobForLink),
        statusSource: "cronicle",
        elapsed: jobForLink.elapsed,
        syncLogId: null,
        cronicleJobStatus,
        jobDetailsUrl,
        progress,
      };
    }
  } else if (latest) {
    lastRun = {
      jobId: latest.id,
      start: latest.time_start,
      end: latest.time_end ?? null,
      status: normalizeJobStatus(latest),
      statusSource: "cronicle",
      elapsed: latest.elapsed,
      syncLogId,
      cronicleJobStatus,
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
