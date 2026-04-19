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

/** Cron types that are normally fired by the scheduler. `manual` is the
 *  only type explicitly tagged as user-triggered. Others might come from
 *  either path — we fall back to "unknown" when it's genuinely ambiguous.
 *  Proper `triggeredBy` column is deferred to a later phase. */
function inferSource(type: SyncLogType): LogSource {
  if (type === "manual") return "manual";
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
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : new Date(0).toISOString(),
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
    // Everything except 'manual' (best available heuristic until we add
    // a proper triggeredBy column).
    conditions.push(
      inArray(syncLogs.type, [
        "full",
        "incremental",
        "team_sync",
        "worklog_sync",
        "timedoctor_sync",
        "release_sync",
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
  const [row] = await db
    .select({ id: syncLogs.id })
    .from(syncLogs)
    .where(
      and(
        inArray(syncLogs.type, types),
        gte(syncLogs.startedAt, from),
        lte(syncLogs.startedAt, to),
      ),
    )
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);
  return row?.id ?? null;
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
