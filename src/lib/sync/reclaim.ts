import "server-only";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { and, eq, inArray, lte } from "drizzle-orm";
import type { SyncLogType } from "./logs-query";

/**
 * Generalizes `scripts/reclaim-stuck-backfill.ts` to every sync type.
 *
 * Marks stuck `running` `sync_logs` rows as `failed` so in-memory
 * concurrency guards (like `runInFlight` in `deployment-backfill.ts`)
 * are no longer blocked by their DB trace. Honors a grace window so a
 * legitimately in-progress run is never touched.
 *
 * Called from:
 *   - `POST /api/logs/[id]/fail` — single-row variant
 *   - `POST /api/logs/reclaim`  — bulk variant
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
  const cutoff = new Date(Date.now() - graceMs);

  const conditions = [
    eq(syncLogs.status, "running"),
    lte(syncLogs.startedAt, cutoff),
  ];
  if (options.type) conditions.push(eq(syncLogs.type, options.type));

  // Find first, so we can return the ids to the caller — MySQL UPDATE
  // doesn't natively give us the affected ids back.
  const stuck = await db
    .select({ id: syncLogs.id })
    .from(syncLogs)
    .where(and(...conditions));

  if (stuck.length === 0) return { reclaimed: 0, ids: [] };

  const ids = stuck.map((r) => r.id);
  await db
    .update(syncLogs)
    .set({
      status: "failed",
      completedAt: new Date(),
      error: reason,
    })
    .where(inArray(syncLogs.id, ids));

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
  const cutoff = new Date(Date.now() - graceMs);

  const [row] = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.id, options.id))
    .limit(1);

  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "running") return { ok: false, reason: "already_terminal" };
  if (row.startedAt && row.startedAt > cutoff) {
    return { ok: false, reason: "within_grace" };
  }

  await db
    .update(syncLogs)
    .set({
      status: "failed",
      completedAt: new Date(),
      error: reason,
    })
    .where(eq(syncLogs.id, options.id));

  return { ok: true };
}
