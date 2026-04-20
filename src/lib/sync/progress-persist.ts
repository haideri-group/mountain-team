import "server-only";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Persist live progress counts to `sync_logs.progressProcessed` /
 * `progressTotal` so any server process can read them back — not just
 * the one that owns the in-memory singleton.
 *
 * Throttled per-logId so a tight loop (issue-sync does ~200 updates/min
 * during processing) doesn't pound the DB. Each logId gets one UPDATE
 * at most every `MIN_WRITE_INTERVAL_MS`; the final value for the run
 * is always flushed by the runner's completion path via
 * `flushProgress`, which bypasses the throttle.
 *
 * **Serialization.** Writes for the same `logId` are chained through a
 * per-logId Promise tail so a stale throttled UPDATE issued mid-loop
 * can't resolve *after* the runner's final `flushProgress` write and
 * leave the row reporting the wrong numbers. Different logIds run
 * independently. This matters because mysql2's pool can dispatch
 * concurrent UPDATEs down different connections with no ordering
 * guarantee at the DB, so "fire-and-forget" writes really can land out
 * of submission order.
 *
 * Fire-and-forget for the throttled path: callers must NOT await
 * `persistProgress`. Failures are swallowed so a progress-column
 * hiccup can never break a running sync.
 */

const MIN_WRITE_INTERVAL_MS = 2_000;

// globalThis-cached so the throttle map + write chain are shared across
// Next.js route-segment module instances (same pattern as the event
// emitter, progress singletons, and concurrency lock).
const globalForProgress = globalThis as unknown as {
  _progressPersistLast?: Map<string, number>;
  _progressPersistTail?: Map<string, Promise<void>>;
};
if (!globalForProgress._progressPersistLast) {
  globalForProgress._progressPersistLast = new Map();
}
if (!globalForProgress._progressPersistTail) {
  globalForProgress._progressPersistTail = new Map();
}
const lastWriteAt = globalForProgress._progressPersistLast;
const writeTail = globalForProgress._progressPersistTail;

/** Queue an UPDATE behind any writes already in flight for this logId.
 *  Returns the new tail so a caller (flushProgress) can await it and
 *  know every earlier queued write for the same logId has resolved. */
function enqueueWrite(
  logId: string,
  processed: number | null,
  total: number | null,
): Promise<void> {
  const prev = writeTail.get(logId) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() =>
      db
        .update(syncLogs)
        .set({ progressProcessed: processed, progressTotal: total })
        .where(eq(syncLogs.id, logId)),
    )
    .catch((err) => {
      console.warn(
        "[progress-persist] UPDATE failed for",
        logId,
        err instanceof Error ? err.message : String(err),
      );
    })
    .then(() => undefined);
  writeTail.set(logId, next);
  return next;
}

export function persistProgress(
  logId: string,
  processed: number | null,
  total: number | null,
): void {
  const now = Date.now();
  const lastAt = lastWriteAt.get(logId) ?? 0;
  if (now - lastAt < MIN_WRITE_INTERVAL_MS) return;
  lastWriteAt.set(logId, now);
  // Fire-and-forget: enqueue, don't await. The chain keeps ordering;
  // errors are logged inside `enqueueWrite` and never propagate.
  void enqueueWrite(logId, processed, total);
}

/** Force an immediate write, bypassing the throttle — used at the end
 *  of a run so the final counts are always in the DB before the row
 *  flips to completed/failed. Awaits all queued writes for the same
 *  logId (including any throttled writes still in flight), so when
 *  this resolves the row's progress columns reflect exactly
 *  `(processed, total)`. */
export async function flushProgress(
  logId: string,
  processed: number | null,
  total: number | null,
): Promise<void> {
  lastWriteAt.delete(logId);
  await enqueueWrite(logId, processed, total);
}

/** Clear a logId's throttle + write-chain entries. Call after the run
 *  has fully ended (post-flushProgress) so the maps don't grow
 *  unbounded as logIds come and go. */
export function clearProgressThrottle(logId: string): void {
  lastWriteAt.delete(logId);
  writeTail.delete(logId);
}
