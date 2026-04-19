import "server-only";
import { db } from "@/lib/db";
import { syncLogs, users, team_members } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";

/**
 * Server-only query layer for the admin `/logs` page. Every function here
 * sanitizes the `error` field before returning — no raw token material
 * leaves the DB boundary. Callers should treat `LogRow[]` as safe to
 * serialize directly to the client.
 */

export type SyncLogType =
  | "full"
  | "incremental"
  | "manual"
  | "team_sync"
  | "worklog_sync"
  | "timedoctor_sync"
  | "release_sync"
  | "deployment_backfill";

export type SyncLogStatus = "running" | "completed" | "failed";

export type LogSource = "cron" | "manual" | "unknown";

/** Single source of truth for sync log types — imported by API routes for
 *  query-param validation. */
export const VALID_SYNC_LOG_TYPES: ReadonlyArray<SyncLogType> = [
  "full",
  "incremental",
  "manual",
  "team_sync",
  "worklog_sync",
  "timedoctor_sync",
  "release_sync",
  "deployment_backfill",
];

export const VALID_SYNC_LOG_STATUSES: ReadonlyArray<SyncLogStatus> = [
  "running",
  "completed",
  "failed",
];

export const VALID_LOG_SOURCES: ReadonlyArray<LogSource> = [
  "cron",
  "manual",
  "unknown",
];

/** Triggering admin user for manual runs. Null for cron rows and for
 *  pre-migration rows where `triggeredByUserId` is null. `memberId` is
 *  the team_member row id when the admin is also a team member, so the
 *  UI can link to `/members/[id]`. */
export interface LogTriggeredBy {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  memberId: string | null;
}

export interface LogRow {
  id: string;
  type: SyncLogType;
  status: SyncLogStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  issueCount: number;
  memberCount: number;
  source: LogSource;
  triggeredByUser: LogTriggeredBy | null;
  errorPreview: string | null;
}

export interface LogDetailRow extends LogRow {
  error: string | null;
}

/** Resolves the row's source. Prefer the stamped `triggeredBy` column;
 *  fall back to a type-based heuristic only for legacy rows written
 *  before that column existed.
 *
 *  For the type-based fallback only:
 *   - `manual` type → "manual"
 *   - `full` / `incremental` / `deployment_backfill` can fire from
 *     either path, so we honestly return "unknown".
 *   - The other scheduled-only types default to "cron". */
function inferSource(
  type: SyncLogType,
  stamped: "cron" | "manual" | null,
): LogSource {
  if (stamped === "manual") return "manual";
  if (stamped === "cron") return "cron";
  // Legacy row — no `triggeredBy` column value.
  if (type === "manual") return "manual";
  if (
    type === "full" ||
    type === "incremental" ||
    type === "deployment_backfill"
  ) {
    return "unknown";
  }
  return "cron";
}

function rowToDurationMs(
  startedAt: Date | null,
  completedAt: Date | null,
): number | null {
  if (!startedAt || !completedAt) return null;
  return completedAt.getTime() - startedAt.getTime();
}

function truncate(s: string | null, max = 120): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

interface JoinedSyncLogRow {
  log: typeof syncLogs.$inferSelect;
  userName: string | null;
  userEmail: string | null;
  userAvatar: string | null;
  memberId: string | null;
}

function toLogRow(row: JoinedSyncLogRow): LogRow {
  const { log } = row;
  const sanitizedError = log.error ? sanitizeErrorText(log.error) : null;
  const triggeredByUser: LogTriggeredBy | null =
    log.triggeredByUserId && (row.userName || row.userEmail)
      ? {
          userId: log.triggeredByUserId,
          name: row.userName,
          email: row.userEmail,
          avatarUrl: row.userAvatar,
          memberId: row.memberId,
        }
      : null;
  return {
    id: log.id,
    type: log.type as SyncLogType,
    status: log.status as SyncLogStatus,
    startedAt: log.startedAt
      ? new Date(log.startedAt).toISOString()
      // Schema has defaultNow() so this branch is effectively unreachable,
      // but we stamp the insert row's creation time if we ever hit it —
      // epoch-zero (1970) would paint a misleading "57-year-old run" in UI.
      : new Date().toISOString(),
    completedAt: log.completedAt ? new Date(log.completedAt).toISOString() : null,
    durationMs: rowToDurationMs(log.startedAt, log.completedAt),
    issueCount: log.issueCount ?? 0,
    memberCount: log.memberCount ?? 0,
    source: inferSource(
      log.type as SyncLogType,
      (log.triggeredBy as "cron" | "manual" | null) ?? null,
    ),
    triggeredByUser,
    errorPreview: truncate(sanitizedError, 120),
  };
}

export interface ListSyncLogsParams {
  page?: number;
  pageSize?: number;
  type?: SyncLogType | "all";
  status?: SyncLogStatus | "all";
  source?: LogSource | "all";
  from?: Date;
  to?: Date;
}

export async function listSyncLogs(params: ListSyncLogsParams = {}): Promise<{
  rows: LogRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));

  const conditions = [];
  if (params.type && params.type !== "all") {
    conditions.push(eq(syncLogs.type, params.type));
  }
  if (params.status && params.status !== "all") {
    conditions.push(eq(syncLogs.status, params.status));
  }
  if (params.source === "manual") {
    // True manual: either the `manual` type OR any row stamped
    // `triggeredBy='manual'` (Run Now / /api/sync/*).
    conditions.push(
      sql`(${syncLogs.type} = 'manual' OR ${syncLogs.triggeredBy} = 'manual')`,
    );
  } else if (params.source === "cron") {
    // Stamped as `cron`, OR legacy row with one of the scheduled-only
    // types AND no stamp at all. Excludes ambiguous types with no stamp.
    conditions.push(
      sql`(${syncLogs.triggeredBy} = 'cron' OR (${syncLogs.triggeredBy} IS NULL AND ${syncLogs.type} IN ('team_sync', 'worklog_sync', 'timedoctor_sync', 'release_sync')))`,
    );
  } else if (params.source === "unknown") {
    // Legacy rows with no stamp AND one of the ambiguous types.
    conditions.push(
      sql`(${syncLogs.triggeredBy} IS NULL AND ${syncLogs.type} IN ('full', 'incremental', 'deployment_backfill'))`,
    );
  }
  if (params.from) conditions.push(gte(syncLogs.startedAt, params.from));
  if (params.to) conditions.push(lte(syncLogs.startedAt, params.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [joined, [{ n: totalCount }]] = await Promise.all([
    db
      .select({
        log: syncLogs,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatarUrl,
        memberId: team_members.id,
      })
      .from(syncLogs)
      .leftJoin(users, eq(users.id, syncLogs.triggeredByUserId))
      .leftJoin(team_members, eq(team_members.email, users.email))
      .where(where)
      .orderBy(desc(syncLogs.startedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)` })
      .from(syncLogs)
      .where(where),
  ]);
  const rows = joined;

  return {
    rows: rows.map(toLogRow),
    totalCount: Number(totalCount ?? 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(totalCount ?? 0) / pageSize)),
  };
}

/** Cheap lookup — just the status + type, for callers that only need to
 *  know whether a given sync_log is still `running`. Avoids hydrating
 *  the full LogDetailRow (sanitizeErrorText + ISO conversions). */
export async function getSyncLogStatusById(
  id: string,
): Promise<{ status: SyncLogStatus; type: SyncLogType } | null> {
  const [row] = await db
    .select({ status: syncLogs.status, type: syncLogs.type })
    .from(syncLogs)
    .where(eq(syncLogs.id, id))
    .limit(1);
  if (!row) return null;
  return { status: row.status as SyncLogStatus, type: row.type as SyncLogType };
}

export async function getSyncLogById(id: string): Promise<LogDetailRow | null> {
  const [row] = await db
    .select({
      log: syncLogs,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatarUrl,
      memberId: team_members.id,
    })
    .from(syncLogs)
    .leftJoin(users, eq(users.id, syncLogs.triggeredByUserId))
    .leftJoin(team_members, eq(team_members.email, users.email))
    .where(eq(syncLogs.id, id))
    .limit(1);
  if (!row) return null;
  const base = toLogRow(row);
  return {
    ...base,
    error: row.log.error ? sanitizeErrorText(row.log.error) : null,
  };
}

export interface Summary24h {
  total: number;
  completed: number;
  failed: number;
  running: number;
  activeNow: number;
  stuckOver1h: number;
}

/** Summary strip data. Single query returns all five counts.
 *
 *  Uses MySQL-native `NOW() - INTERVAL` math instead of JS Date params.
 *  Rationale: when the Node process's local timezone differs from the
 *  mysql2 driver's assumed server timezone (e.g. Node in Pakistan GMT+5,
 *  server datetimes mis-interpreted as local by the driver), JS Date
 *  values serialize with a 5h offset and comparisons report rows as
 *  "stuck" that aren't. Keeping the arithmetic entirely within MySQL
 *  eliminates the driver's timezone round-trip — `startedAt` and
 *  `NOW()` live in the same timezone context, so the comparison is
 *  always consistent regardless of driver / OS locale. */
export async function summarize24h(): Promise<Summary24h> {
  const [row] = await db
    .select({
      total: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= NOW() - INTERVAL 24 HOUR THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= NOW() - INTERVAL 24 HOUR AND ${syncLogs.status} = 'completed' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= NOW() - INTERVAL 24 HOUR AND ${syncLogs.status} = 'failed' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= NOW() - INTERVAL 24 HOUR AND ${syncLogs.status} = 'running' THEN 1 ELSE 0 END)`,
      activeNow: sql<number>`SUM(CASE WHEN ${syncLogs.status} = 'running' THEN 1 ELSE 0 END)`,
      stuckOver1h: sql<number>`SUM(CASE WHEN ${syncLogs.status} = 'running' AND ${syncLogs.startedAt} < NOW() - INTERVAL 1 HOUR THEN 1 ELSE 0 END)`,
    })
    .from(syncLogs);

  return {
    total: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
    failed: Number(row?.failed ?? 0),
    running: Number(row?.running ?? 0),
    activeNow: Number(row?.activeNow ?? 0),
    stuckOver1h: Number(row?.stuckOver1h ?? 0),
  };
}

/** ID of the sync_log of the given type(s) whose `startedAt` is closest
 *  to the provided anchor time, within `windowSec` seconds. Returns null
 *  if no row falls inside the window — better than misleadingly surfacing
 *  a different run.
 *
 *  Used by the Scheduled Crons panel to jump from a Cronicle event's
 *  last-run icon to the drawer for the EXACT matching sync_log (not
 *  just "the latest of this type"). */
export async function findSyncLogIdNearTime(input: {
  types: SyncLogType[];
  anchorEpochSec: number;
  windowSec?: number;
}): Promise<string | null> {
  const { types, anchorEpochSec } = input;
  const windowSec = input.windowSec ?? 60;
  if (types.length === 0 || !Number.isFinite(anchorEpochSec)) return null;
  const from = new Date((anchorEpochSec - windowSec) * 1000);
  const to = new Date((anchorEpochSec + windowSec) * 1000);
  // Fetch all rows in window, then pick the one whose `startedAt` is
  // nearest to the anchor. Previously the query used `ORDER BY ... DESC
  // LIMIT 1` which is "latest" not "closest" — e.g. two manual retries
  // 30s apart would both land inside the window, and we'd always open
  // the later one's drawer even when the earlier one is what the user
  // clicked on. The window is narrow (default ±60s) so row count is
  // trivially small — JS sort is cheaper than a more complex SQL form.
  const rows = await db
    .select({ id: syncLogs.id, startedAt: syncLogs.startedAt })
    .from(syncLogs)
    .where(
      and(
        inArray(syncLogs.type, types),
        gte(syncLogs.startedAt, from),
        lte(syncLogs.startedAt, to),
      ),
    );
  if (rows.length === 0) return null;
  let best: { id: string; delta: number } | null = null;
  for (const r of rows) {
    if (!r.startedAt) continue;
    const deltaSec = Math.abs(r.startedAt.getTime() / 1000 - anchorEpochSec);
    if (!best || deltaSec < best.delta) best = { id: r.id, delta: deltaSec };
  }
  return best?.id ?? null;
}

/** Returns every row currently `status='running'` older than `graceMs`.
 *  Uses MySQL-native `NOW() - INTERVAL` so the age comparison isn't
 *  skewed by mysql2 driver timezone round-trips (see notes on
 *  `summarize24h`). */
/** Median duration (ms) of the last N completed runs for the given
 *  types. Used by the schedule panel to estimate an ETA for sync
 *  families that don't publish live progress counts (team_sync,
 *  release_sync, worklog_sync, timedoctor_sync). Returns null when
 *  fewer than 2 historical runs are available — one sample is too
 *  noisy to extrapolate from. */
export async function medianRecentDurationMs(
  types: SyncLogType[],
  sampleSize = 5,
): Promise<number | null> {
  if (types.length === 0) return null;
  const rows = await db
    .select({
      startedAt: syncLogs.startedAt,
      completedAt: syncLogs.completedAt,
    })
    .from(syncLogs)
    .where(
      and(
        inArray(syncLogs.type, types),
        eq(syncLogs.status, "completed"),
      ),
    )
    .orderBy(desc(syncLogs.startedAt))
    .limit(sampleSize);
  const durations: number[] = [];
  for (const r of rows) {
    if (!r.startedAt || !r.completedAt) continue;
    const d = r.completedAt.getTime() - r.startedAt.getTime();
    if (d > 0) durations.push(d);
  }
  if (durations.length < 2) return null;
  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  return durations.length % 2 === 0
    ? Math.round((durations[mid - 1] + durations[mid]) / 2)
    : durations[mid];
}

/** Return the currently-running sync_logs row of any of the given
 *  types, if one exists — regardless of whether Cronicle has a
 *  corresponding job entry. Used by the schedule panel's progress
 *  projection so that a Run-Now-invoked sync (which doesn't go through
 *  Cronicle) still shows its live progress bar under the event title.
 *
 *  Ignores rows older than 1 hour — those are almost certainly stuck
 *  (process crashed, dev server killed, etc.) and would keep the
 *  panel's 1s progress poll running indefinitely. The Reclaim banner
 *  handles stuck rows through a separate path. */
export async function findRunningSyncLog(
  types: SyncLogType[],
  maxAgeSec = 3600,
): Promise<{ id: string; type: SyncLogType; startedAt: Date } | null> {
  if (types.length === 0) return null;
  const [row] = await db
    .select({
      id: syncLogs.id,
      type: syncLogs.type,
      startedAt: syncLogs.startedAt,
    })
    .from(syncLogs)
    .where(
      and(
        eq(syncLogs.status, "running"),
        inArray(syncLogs.type, types),
        sql`${syncLogs.startedAt} > NOW() - INTERVAL ${maxAgeSec} SECOND`,
      ),
    )
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);
  if (!row || !row.startedAt) return null;
  return {
    id: row.id,
    type: row.type as SyncLogType,
    startedAt: row.startedAt,
  };
}

export async function findStuckRunning(graceMs: number): Promise<LogRow[]> {
  const graceSec = Math.max(1, Math.floor(graceMs / 1000));
  const rows = await db
    .select({
      log: syncLogs,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatarUrl,
      memberId: team_members.id,
    })
    .from(syncLogs)
    .leftJoin(users, eq(users.id, syncLogs.triggeredByUserId))
    .leftJoin(team_members, eq(team_members.email, users.email))
    .where(
      and(
        eq(syncLogs.status, "running"),
        sql`${syncLogs.startedAt} <= NOW() - INTERVAL ${graceSec} SECOND`,
      ),
    )
    .orderBy(desc(syncLogs.startedAt));
  return rows.map(toLogRow);
}
