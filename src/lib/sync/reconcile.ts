import "server-only";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { correlateSyncLog } from "@/lib/cronicle/correlate";
import { listTeamFlowEvents } from "@/lib/cronicle/discovery";
import { emitSyncLogChange } from "./events";
import type { SyncLogType } from "./logs-query";

/**
 * App-to-Cronicle state reconciliation.
 *
 * Problem: when Cronicle's HTTP timeout fires while a TeamFlow handler
 * is still running (or has crashed after writing `logRunStart()`),
 * Cronicle records the job as `timeout` / `error` but our `sync_logs`
 * row stays `running` forever. The admin sees a contradiction in the
 * /automations UI.
 *
 * Heuristic: a `running` sync_log whose correlated Cronicle job has
 * been terminal for more than `terminalGraceSec` seconds almost
 * certainly has a dead handler — mark it `failed`. Honors the Cronicle
 * status as the source of truth for "did the HTTP request finish."
 *
 * Runs in two modes:
 *   - `reconcileRunningSyncLogs()`                 — batch, scan all running rows
 *   - `reconcileSingleRunningSyncLog(id)`          — single row, for the drawer
 *
 * Never throws; returns `{ reconciled, ids }`. Cronicle failures skip
 * silently and return 0.
 */

export interface ReconcileResult {
  reconciled: number;
  ids: string[];
}

const DEFAULT_TERMINAL_GRACE_SEC = 120; // 2 min after Cronicle marked job terminal

/** Cronicle-terminal states we treat as "handler should have stopped." */
const TERMINAL_STATUSES = new Set(["success", "error", "timeout"]);

export async function reconcileRunningSyncLogs(
  terminalGraceSec = DEFAULT_TERMINAL_GRACE_SEC,
): Promise<ReconcileResult> {
  // Only act on rows older than the grace — very fresh rows are almost
  // certainly still genuinely running and their Cronicle record hasn't
  // updated yet. Upper bound: no limit; in practice there's a handful.
  const runningRows = await db
    .select({
      id: syncLogs.id,
      type: syncLogs.type,
      startedAt: syncLogs.startedAt,
    })
    .from(syncLogs)
    .where(
      and(
        eq(syncLogs.status, "running"),
        sql`${syncLogs.startedAt} <= NOW() - INTERVAL ${terminalGraceSec} SECOND`,
      ),
    )
    .orderBy(desc(syncLogs.startedAt));

  if (runningRows.length === 0) return { reconciled: 0, ids: [] };

  // Cache the event list — every row's correlation reuses it, avoiding
  // N round-trips to Cronicle when there are multiple stuck rows.
  let events: Awaited<ReturnType<typeof listTeamFlowEvents>> = [];
  try {
    events = await listTeamFlowEvents();
  } catch {
    return { reconciled: 0, ids: [] };
  }
  if (events.length === 0) return { reconciled: 0, ids: [] };

  const reconciled: string[] = [];
  for (const row of runningRows) {
    if (!row.startedAt) continue;
    const corr = await correlateSyncLog(
      {
        type: row.type as SyncLogType,
        startedAt: row.startedAt,
      },
      events,
    ).catch(() => null);
    if (!corr) continue;
    if (!TERMINAL_STATUSES.has(corr.status)) continue;
    // Terminal, but has it been terminal long enough for a real handler
    // to have finished? Require Cronicle's `time_end` + graceSec < now.
    if (!corr.cronicleEnd) continue;
    const terminalAgeSec = Math.floor(Date.now() / 1000) - corr.cronicleEnd;
    if (terminalAgeSec < terminalGraceSec) continue;

    const ok = await markRowFailed(
      row.id,
      `Reconciled: Cronicle reported "${corr.status}" ${Math.round(terminalAgeSec / 60)} min ago`,
      row.type as SyncLogType,
    );
    if (ok) reconciled.push(row.id);
  }

  return { reconciled: reconciled.length, ids: reconciled };
}

/** Single-row variant — cheap, used by the detail endpoint on open. */
export async function reconcileSingleRunningSyncLog(
  id: string,
  terminalGraceSec = DEFAULT_TERMINAL_GRACE_SEC,
): Promise<boolean> {
  const [row] = await db
    .select({
      id: syncLogs.id,
      type: syncLogs.type,
      startedAt: syncLogs.startedAt,
      status: syncLogs.status,
    })
    .from(syncLogs)
    .where(eq(syncLogs.id, id))
    .limit(1);
  if (!row || row.status !== "running" || !row.startedAt) return false;

  const corr = await correlateSyncLog({
    type: row.type as SyncLogType,
    startedAt: row.startedAt,
  }).catch(() => null);
  if (!corr) return false;
  if (!TERMINAL_STATUSES.has(corr.status)) return false;
  if (!corr.cronicleEnd) return false;
  const terminalAgeSec = Math.floor(Date.now() / 1000) - corr.cronicleEnd;
  if (terminalAgeSec < terminalGraceSec) return false;

  return markRowFailed(
    row.id,
    `Reconciled: Cronicle reported "${corr.status}" ${Math.round(terminalAgeSec / 60)} min ago`,
    row.type as SyncLogType,
  );
}

async function markRowFailed(
  id: string,
  reason: string,
  type: SyncLogType,
): Promise<boolean> {
  const completedAt = new Date();
  // Guarded UPDATE — only flip if still `running`. Between the SELECT
  // above and here the real handler could have completed legitimately;
  // the guard prevents overwriting a valid `completed` row with `failed`.
  const res = await db
    .update(syncLogs)
    .set({ status: "failed", completedAt, error: reason })
    .where(and(eq(syncLogs.id, id), eq(syncLogs.status, "running")));
  const affected =
    (Array.isArray(res)
      ? (res[0] as { affectedRows?: number })?.affectedRows
      : (res as { affectedRows?: number })?.affectedRows) ?? 0;
  if (affected === 0) return false;

  emitSyncLogChange({
    id,
    type,
    status: "failed",
    startedAt: null,
    completedAt: completedAt.toISOString(),
    transition: "finished",
  });
  return true;
}
