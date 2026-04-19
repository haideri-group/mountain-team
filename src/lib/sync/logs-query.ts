import "server-only";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
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
  errorPreview: string | null;
}

export interface LogDetailRow extends LogRow {
  error: string | null;
}

/** Heuristic mapping sync type → source while a proper `triggeredBy`
 *  column doesn't exist yet.
 *
 *  - `manual` is only ever written by admin-triggered `/api/sync/issues`
 *    so we can confidently label it "manual".
 *  - `full`, `incremental`, and `deployment_backfill` can ALL be fired
 *    from either the scheduled cron OR admin buttons — returning "cron"
 *    would be a false claim, so we honestly return "unknown".
 *  - `team_sync`, `release_sync`, `worklog_sync`, `timedoctor_sync` ARE
 *    also triggerable manually (from /api/sync/*), but the proportion
 *    is small; a proper column is the right fix. Kept as "cron" so the
 *    filter still works for the 95%-case. Will be removed when the
 *    `triggeredBy` column lands. */
function inferSource(type: SyncLogType): LogSource {
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

function toLogRow(row: typeof syncLogs.$inferSelect): LogRow {
  const sanitizedError = row.error ? sanitizeErrorText(row.error) : null;
  return {
    id: row.id,
    type: row.type as SyncLogType,
    status: row.status as SyncLogStatus,
    startedAt: row.startedAt
      ? new Date(row.startedAt).toISOString()
      // Schema has defaultNow() so this branch is effectively unreachable,
      // but we stamp the insert row's creation time if we ever hit it —
      // epoch-zero (1970) would paint a misleading "57-year-old run" in UI.
      : new Date().toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    durationMs: rowToDurationMs(row.startedAt, row.completedAt),
    issueCount: row.issueCount ?? 0,
    memberCount: row.memberCount ?? 0,
    source: inferSource(row.type as SyncLogType),
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
    conditions.push(eq(syncLogs.type, "manual"));
  } else if (params.source === "cron") {
    // Types whose writer is (in practice) the scheduled cron. The
    // ambiguous `full` / `incremental` / `deployment_backfill` rows are
    // labelled `"unknown"` by inferSource and are intentionally excluded
    // here so a "cron-triggered" filter isn't silently polluted by
    // admin-fired bursts.
    conditions.push(
      inArray(syncLogs.type, [
        "team_sync",
        "worklog_sync",
        "timedoctor_sync",
        "release_sync",
      ]),
    );
  } else if (params.source === "unknown") {
    // Mirror inferSource(): these three types can fire from either a
    // cron or an admin button, so "unknown" filters to exactly the
    // rows the table labels as such.
    conditions.push(
      inArray(syncLogs.type, [
        "full",
        "incremental",
        "deployment_backfill",
      ]),
    );
  }
  if (params.from) conditions.push(gte(syncLogs.startedAt, params.from));
  if (params.to) conditions.push(lte(syncLogs.startedAt, params.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ n: totalCount }]] = await Promise.all([
    db
      .select()
      .from(syncLogs)
      .where(where)
      .orderBy(desc(syncLogs.startedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)` })
      .from(syncLogs)
      .where(where),
  ]);

  return {
    rows: rows.map(toLogRow),
    totalCount: Number(totalCount ?? 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(Number(totalCount ?? 0) / pageSize)),
  };
}

export async function getSyncLogById(id: string): Promise<LogDetailRow | null> {
  const [row] = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.id, id))
    .limit(1);
  if (!row) return null;
  const base = toLogRow(row);
  return {
    ...base,
    error: row.error ? sanitizeErrorText(row.error) : null,
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

/** Summary strip data. Single query returns all five counts. */
export async function summarize24h(): Promise<Summary24h> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [row] = await db
    .select({
      total: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= ${since} THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= ${since} AND ${syncLogs.status} = 'completed' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= ${since} AND ${syncLogs.status} = 'failed' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN ${syncLogs.startedAt} >= ${since} AND ${syncLogs.status} = 'running' THEN 1 ELSE 0 END)`,
      activeNow: sql<number>`SUM(CASE WHEN ${syncLogs.status} = 'running' THEN 1 ELSE 0 END)`,
      stuckOver1h: sql<number>`SUM(CASE WHEN ${syncLogs.status} = 'running' AND ${syncLogs.startedAt} < ${oneHourAgo} THEN 1 ELSE 0 END)`,
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

/** Returns every row currently `status='running'` older than `graceMs`. */
export async function findStuckRunning(graceMs: number): Promise<LogRow[]> {
  const cutoff = new Date(Date.now() - graceMs);
  const rows = await db
    .select()
    .from(syncLogs)
    .where(
      and(eq(syncLogs.status, "running"), lte(syncLogs.startedAt, cutoff)),
    )
    .orderBy(desc(syncLogs.startedAt));
  return rows.map(toLogRow);
}
