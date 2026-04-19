import "server-only";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { SyncLogType } from "./logs-query";
import { emitSyncLogChange } from "./events";

/**
 * Generalizes `scripts/reclaim-stuck-backfill.ts` to every sync type.
 *
 * Marks stuck `running` `sync_logs` rows as `failed` so in-memory
 * concurrency guards (like `runInFlight` in `deployment-backfill.ts`)
 * are no longer blocked by their DB trace. Honors a grace window so a
 * legitimately in-progress run is never touched.
 *
 * Called from:
 *   - `POST /api/automations/[id]/fail` — single-row variant
 *   - `POST /api/automations/reclaim`  — bulk variant
 *   - `scripts/reclaim-stuck-backfill.ts` could call this in a later refactor
 */

export interface ReclaimStuckOptions {
  /** If set, only reclaim rows of this type. Otherwise every stuck type. */
  type?: SyncLogType;
  /** Minimum age before a `running` row is considered stuck. Default 2 min. */
  graceMs?: number;
  /** Error message to stamp on the reclaimed row. */
  reason?: string;
}

export interface ReclaimSingleOptions {
  id: string;
  graceMs?: number;
  reason?: string;
}

export interface ReclaimResult {
  reclaimed: number;
  ids: string[];
}

const DEFAULT_GRACE_MS = 2 * 60 * 1000;
const DEFAULT_REASON =
  "Reclaimed via admin action — client disconnected mid-run";

/** Bulk reclaim. Safe on an empty table — returns `{ reclaimed: 0, ids: [] }`. */
export async function reclaimStuckRuns(
  options: ReclaimStuckOptions = {},
): Promise<ReclaimResult> {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const reason = options.reason ?? DEFAULT_REASON;
  const graceSec = Math.max(1, Math.floor(graceMs / 1000));

  // Use MySQL-native date math for the age comparison — JS Date params
  // get mis-converted by mysql2 when the server locale ≠ the Node
  // locale (e.g. Node in Pakistan GMT+5 against a UTC-configured
  // server), producing false positives that claim fresh rows are
  // stuck. `NOW()` and `startedAt` share the same timezone context
  // inside MySQL, so the comparison is always correct.
  const conditions = [
    eq(syncLogs.status, "running"),
    sql`${syncLogs.startedAt} <= NOW() - INTERVAL ${graceSec} SECOND`,
  ];
  if (options.type) conditions.push(eq(syncLogs.type, options.type));

  // Find first, so we can return the ids to the caller — MySQL UPDATE
  // doesn't natively give us the affected ids back.
  const stuck = await db
    .select({ id: syncLogs.id, type: syncLogs.type })
    .from(syncLogs)
    .where(and(...conditions));

  if (stuck.length === 0) return { reclaimed: 0, ids: [] };

  const ids = stuck.map((r) => r.id);
  const completedAt = new Date();
  // Re-assert `status='running'` inside the UPDATE's WHERE. Between our
  // SELECT above and this UPDATE another process might have legitimately
  // completed one of these rows; without this guard we'd overwrite its
  // `completed` with `failed` and corrupt the record.
  await db
    .update(syncLogs)
    .set({
      status: "failed",
      completedAt,
      error: reason,
    })
    .where(and(inArray(syncLogs.id, ids), eq(syncLogs.status, "running")));

  // Emit one event per reclaimed row so subscribers can update their
  // row-level UI (not just invalidate a whole list). Note: some of these
  // may have already completed between the SELECT and UPDATE due to the
  // guard — a minor over-emit is harmless (client just refetches).
  for (const r of stuck) {
    emitSyncLogChange({
      id: r.id,
      type: r.type as SyncLogType,
      status: "failed",
      startedAt: null,
      completedAt: completedAt.toISOString(),
      transition: "finished",
    });
  }

  return { reclaimed: ids.length, ids };
}

/**
 * Single-row reclaim. Returns:
 *   - { ok: true }             success
 *   - { ok: false, reason }    detailed rejection:
 *       - "not_found"          no row with this id
 *       - "already_terminal"   status isn't 'running'
 *       - "within_grace"       row exists but is fresher than graceMs
 */
export async function reclaimSingleRun(
  options: ReclaimSingleOptions,
): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_terminal" | "within_grace" }
> {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const reason = options.reason ?? DEFAULT_REASON;
  const graceSec = Math.max(1, Math.floor(graceMs / 1000));

  // Fetch the row with a MySQL-native "is it inside grace?" flag — same
  // reason as reclaimStuckRuns: we can't trust mysql2 Date round-trips
  // when the server/Node locales differ. Evaluating the grace check in
  // SQL keeps the comparison in MySQL's own time context.
  const [row] = await db
    .select({
      id: syncLogs.id,
      status: syncLogs.status,
      type: syncLogs.type,
      withinGrace: sql<number>`CASE WHEN ${syncLogs.startedAt} > NOW() - INTERVAL ${graceSec} SECOND THEN 1 ELSE 0 END`,
    })
    .from(syncLogs)
    .where(eq(syncLogs.id, options.id))
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "running") return { ok: false, reason: "already_terminal" };
  if (Number(row.withinGrace) === 1) {
    return { ok: false, reason: "within_grace" };
  }

  const completedAt = new Date();
  // Guard `status='running'` inside the UPDATE: between the SELECT above
  // and now, the actual sync writer could have legitimately completed
  // this row. Without the guard we'd stamp its `completed` back to
  // `failed` and destroy valid data. If the guard fails, the row was
  // completed — treat as `already_terminal` for the caller.
  const updateResult = await db
    .update(syncLogs)
    .set({
      status: "failed",
      completedAt,
      error: reason,
    })
    .where(and(eq(syncLogs.id, options.id), eq(syncLogs.status, "running")));

  // drizzle-orm/mysql2 returns a `[ResultSetHeader]` tuple; `.affectedRows`
  // tells us whether the UPDATE actually touched the row.
  const affected =
    (Array.isArray(updateResult)
      ? (updateResult[0] as { affectedRows?: number })?.affectedRows
      : (updateResult as { affectedRows?: number })?.affectedRows) ?? 0;
  if (affected === 0) {
    // Race: the sync writer finished this row between our read and write.
    // Safest classification is `already_terminal` — it no longer exists
    // in the `running` set so the caller's retry logic should stop.
    return { ok: false, reason: "already_terminal" };
  }

  emitSyncLogChange({
    id: options.id,
    type: row.type as SyncLogType,
    status: "failed",
    startedAt: null,
    completedAt: completedAt.toISOString(),
    transition: "finished",
  });

  return { ok: true };
}
