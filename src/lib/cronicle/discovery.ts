import "server-only";
import { cronicleGet, isCronicleConfigured } from "./client";
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

/** Convert a single Cronicle job `code` + `description` into the public
 *  status taxonomy the UI knows how to color. */
function normalizeJobStatus(
  job: CronicleJob,
): "success" | "error" | "timeout" | "running" {
  if (job.time_end === undefined || job.time_end === null) return "running";
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

/**
 * Build the client-safe projection for an event, including its most-recent
 * run summary. Never fails; missing history just leaves `lastRun: null`.
 */
export async function projectEventPublic(
  event: CronicleEvent,
): Promise<CronicleEventPublic> {
  const jobs = await listEventHistory(event.id, 1);
  const latest = jobs[0];
  const lastRun = latest
    ? {
        jobId: latest.id,
        start: latest.time_start,
        end: latest.time_end ?? null,
        status: normalizeJobStatus(latest),
        elapsed: latest.elapsed,
      }
    : null;
  return {
    id: event.id,
    title: event.title,
    enabled: event.enabled === 1,
    urlPath: extractUrlPath(event.params.url),
    timing: event.timing,
    lastRun,
    nextRun: computeNextRun(event.timing),
  };
}

export { normalizeJobStatus };
