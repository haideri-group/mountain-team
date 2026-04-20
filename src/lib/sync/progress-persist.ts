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
 * is always flushed by the runner's completion path
 * (`logRunEnd` / `issueCount` update).
 *
 * Pure fire-and-forget — callers must NOT await this. Failures are
 * swallowed so a progress-column hiccup can never break a running sync.
 */

const MIN_WRITE_INTERVAL_MS = 2_000;

// globalThis-cached so the throttle map is shared across Next.js
// route-segment module instances (same pattern as the event emitter,
// progress singletons, and concurrency lock).
const globalForProgress = globalThis as unknown as {
  _progressPersistLast?: Map<string, number>;
};
if (!globalForProgress._progressPersistLast) {
  globalForProgress._progressPersistLast = new Map();
}
const lastWriteAt = globalForProgress._progressPersistLast;

export function persistProgress(
  logId: string,
  processed: number | null,
  total: number | null,
): void {
  const now = Date.now();
  const lastAt = lastWriteAt.get(logId) ?? 0;
  if (now - lastAt < MIN_WRITE_INTERVAL_MS) return;
  lastWriteAt.set(logId, now);
  // Fire-and-forget; no await. Swallow failures — progress counts are
  // a UI nicety, not critical state.
  db.update(syncLogs)
    .set({ progressProcessed: processed, progressTotal: total })
    .where(eq(syncLogs.id, logId))
    .catch((err) => {
      console.warn(
        "[progress-persist] UPDATE failed for",
        logId,
        err instanceof Error ? err.message : String(err),
      );
    });
}

/** Force an immediate write, bypassing the throttle — used at the end
 *  of a run so the final counts are always in the DB before the row
 *  flips to completed/failed. */
export async function flushProgress(
  logId: string,
  processed: number | null,
  total: number | null,
): Promise<void> {
  lastWriteAt.delete(logId);
  try {
    await db
      .update(syncLogs)
      .set({ progressProcessed: processed, progressTotal: total })
      .where(eq(syncLogs.id, logId));
  } catch (err) {
    console.warn(
      "[progress-persist] flush failed for",
      logId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Clear a logId's throttle entry. Call when a run ends to avoid the
 *  throttle map growing unbounded. */
export function clearProgressThrottle(logId: string): void {
  lastWriteAt.delete(logId);
}
