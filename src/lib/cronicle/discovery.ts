import "server-only";
import { cronicleGet, isCronicleConfigured } from "./client";
import { findLatestSyncLogIdByTypes, type SyncLogType } from "@/lib/sync/logs-query";
import { TYPE_TO_URL_PATH } from "./correlate";
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

/**
 * Fetches the full Cronicle schedule, filters to events whose category
 * matches `CRONICLE_TEAMFLOW_CATEGORY_ID`. Cached 60s.
 *
 * Returns `[]` if Cronicle is unreachable, unconfigured, or the category
 * env var isn't set.
 */
export async function listTeamFlowEvents(): Promise<CronicleEvent[]> {
  if (!isCronicleConfigured()) return [];
  const categoryId = getCategoryId();
  if (!categoryId) return [];

  const now = Date.now();
  if (scheduleCache && now - scheduleCache.at < SCHEDULE_TTL_MS) {
    return scheduleCache.events;
  }

  const res = await cronicleGet<{ rows: CronicleEvent[] }>(
    "/api/app/get_schedule/v1",
  );
  if (!res.ok) {
    console.warn("[cronicle] schedule fetch failed:", res.error);
    return scheduleCache?.events ?? [];
  }

  const events = (res.data.rows || []).filter(
    (e) => e.category === categoryId,
  );
  scheduleCache = { at: now, events };
  return events;
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
  const hours = timing.hours ?? [];
  const minutes = timing.minutes ?? [];
  if (hours.length === 0 || minutes.length === 0) return null;

  const base = new Date(fromMs);
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
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

  let syncLogId: string | null = null;
  const urlPath = extractUrlPath(event.params.url);
  const types = syncTypesForUrlPath(urlPath);
  if (types.length > 0) {
    try {
      syncLogId = await findLatestSyncLogIdByTypes(types);
    } catch (err) {
      console.warn(
        "[cronicle] sync_log lookup failed for event",
        event.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const lastRun = latest
    ? {
        jobId: latest.id,
        start: latest.time_start,
        end: latest.time_end ?? null,
        status: normalizeJobStatus(latest),
        elapsed: latest.elapsed,
        syncLogId,
      }
    : null;

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
