import "server-only";
import type { SyncLogType } from "@/lib/sync/logs-query";
import { listEventHistory, listTeamFlowEvents, normalizeJobStatus } from "./discovery";
import type {
  CronicleCorrelation,
  CronicleEvent,
  CronicleJob,
} from "./types";

/**
 * Correlate a single `sync_logs` row to its Cronicle job.
 *
 * Strategy:
 *   1. Resolve the URL path the sync's cron fires at (TYPE_TO_URL_PATH).
 *   2. Find the TeamFlow event whose `params.url` contains that path.
 *   3. Pull that event's recent history and pick the job whose
 *      `time_start` (when Cronicle actually fired the HTTP request) is
 *      within ±60s of the sync row's `startedAt`. Fallback to
 *      `event_start` (scheduled fire time) only when `time_start` is
 *      missing — scheduled time can lag real fire time by minutes for
 *      queued or retried jobs (notably deployment_backfill).
 *   4. Project to `CronicleCorrelation` + build a direct link to the job
 *      in the Cronicle UI.
 *
 * Any step failure returns `null`. The caller surfaces that as "no
 * correlation found" — the sync row is still displayed in full.
 */

export const TYPE_TO_URL_PATH: Record<SyncLogType, string> = {
  team_sync: "/api/cron/sync-teams",
  full: "/api/cron/sync-issues",
  incremental: "/api/cron/sync-issues",
  manual: "", // user-initiated, not fired by Cronicle — never correlated
  worklog_sync: "/api/cron/sync-worklogs",
  timedoctor_sync: "/api/cron/sync-timedoctor",
  release_sync: "/api/cron/sync-releases",
  deployment_backfill: "/api/cron/deployment-backfill",
};

const CORRELATION_WINDOW_SEC = 60;

function buildJobDetailsUrl(jobId: string): string {
  const base = (process.env.CRONICLE_BASE_URL || "").replace(/\/$/, "");
  return `${base}/#JobDetails?id=${jobId}`;
}

function findMatchingEvent(
  events: CronicleEvent[],
  urlPath: string,
): CronicleEvent | null {
  const matches = events.filter((e) =>
    (e.params?.url ?? "").includes(urlPath),
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Prefer exact suffix match to disambiguate similar paths (e.g. "/api/cron/sync-issues" vs "/api/cron/sync-issues-extra").
  const exact = matches.find((e) => (e.params?.url ?? "").endsWith(urlPath));
  return exact ?? matches[0];
}

function findMatchingJob(
  jobs: CronicleJob[],
  startedAtSec: number,
): CronicleJob | null {
  let best: { job: CronicleJob; delta: number } | null = null;
  for (const j of jobs) {
    // Anchor on actual fire time (`time_start`), not scheduled time
    // (`event_start`). For deployment_backfill and other long-running
    // or retried jobs, the two can differ by minutes and the sync_logs
    // row's `startedAt` tracks `time_start`, not `event_start`.
    const anchor = j.time_start ?? j.event_start;
    if (!anchor) continue;
    const delta = Math.abs(anchor - startedAtSec);
    if (delta > CORRELATION_WINDOW_SEC) continue;
    if (!best || delta < best.delta) best = { job: j, delta };
  }
  return best?.job ?? null;
}

export interface CorrelateInput {
  type: SyncLogType;
  startedAt: Date;
}

/**
 * Correlate a sync_log to its Cronicle job, if any. Accepts pre-fetched
 * events so callers can reuse a single `listTeamFlowEvents()` call when
 * correlating many rows (e.g. building the list page). If `events` is
 * omitted, fetches internally (cached 60s).
 */
export async function correlateSyncLog(
  input: CorrelateInput,
  events?: CronicleEvent[],
): Promise<CronicleCorrelation | null> {
  const urlPath = TYPE_TO_URL_PATH[input.type];
  if (!urlPath) return null;

  const scheduleEvents = events ?? (await listTeamFlowEvents());
  if (scheduleEvents.length === 0) return null;

  const event = findMatchingEvent(scheduleEvents, urlPath);
  if (!event) return null;

  const jobs = await listEventHistory(event.id, 20);
  if (jobs.length === 0) return null;

  const startedAtSec = Math.floor(input.startedAt.getTime() / 1000);
  const job = findMatchingJob(jobs, startedAtSec);
  if (!job) return null;

  return {
    eventId: event.id,
    eventTitle: event.title,
    jobId: job.id,
    cronicleStart: job.time_start ?? job.event_start,
    cronicleEnd: job.time_end ?? null,
    status: normalizeJobStatus(job),
    description: job.description,
    elapsed: job.elapsed,
    performance: job.perf?.perf as CronicleCorrelation["performance"],
    jobDetailsUrl: buildJobDetailsUrl(job.id),
  };
}
