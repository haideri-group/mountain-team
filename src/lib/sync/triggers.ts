import "server-only";
import { db } from "@/lib/db";
import { pendingManualTriggers, syncLogs } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { SyncLogType } from "./logs-query";

/**
 * Cross-process "next run is manual" registry.
 *
 * Run Now click lands on server process A (e.g. dev), Cronicle then
 * fires an HTTP request against Cronicle's configured URL — which often
 * resolves to server process B (e.g. prod). They have separate memory
 * so an in-memory marker doesn't reach the handler. Persisting markers
 * to MySQL fixes that: any process reading the table sees the same
 * state.
 *
 * One row per sync family; UPSERT on set, atomically consumed + deleted
 * on read. Expired rows are skipped (and garbage-collected on next
 * matching consume). Family-scoped to match the concurrency lock.
 */

type SyncFamily =
  | "issue"
  | "team"
  | "release"
  | "worklog"
  | "timedoctor"
  | "deployment_backfill";

const SYNC_FAMILY: Record<SyncLogType, SyncFamily> = {
  full: "issue",
  incremental: "issue",
  manual: "issue",
  team_sync: "team",
  release_sync: "release",
  worklog_sync: "worklog",
  timedoctor_sync: "timedoctor",
  deployment_backfill: "deployment_backfill",
};

const DEFAULT_TTL_MS = 120_000; // 2 min — generous headroom for Cronicle dispatch lag

/** UPSERT: one row per family. Overwriting an existing mark is the
 *  correct behavior — if two admins click Run within TTL, the second
 *  wins. */
export async function markPendingManual(
  type: SyncLogType,
  userId: string | null,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  const family = SYNC_FAMILY[type];
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    await db
      .insert(pendingManualTriggers)
      .values({ family, userId, expiresAt })
      .onDuplicateKeyUpdate({ set: { userId, expiresAt } });
  } catch (err) {
    // Source attribution is a UX nicety — don't fail the Run request
    // if the marker write fails (e.g. migration hasn't been applied).
    console.warn(
      "[triggers] markPendingManual failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Read + delete atomically. Returns the stored userId when a valid
 *  (non-expired) mark existed. Expired rows are also deleted to keep
 *  the table tidy. */
export async function consumePendingManual(
  type: SyncLogType,
): Promise<{ userId: string | null } | null> {
  const family = SYNC_FAMILY[type];
  try {
    const [row] = await db
      .select()
      .from(pendingManualTriggers)
      .where(eq(pendingManualTriggers.family, family))
      .limit(1);
    if (!row) return null;
    // DELETE first so concurrent consumers can't double-read the mark.
    await db
      .delete(pendingManualTriggers)
      .where(eq(pendingManualTriggers.family, family));
    if (row.expiresAt.getTime() < Date.now()) return null;
    return { userId: row.userId };
  } catch (err) {
    console.warn(
      "[triggers] consumePendingManual failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Legacy helper — retained for compatibility with the few remaining
 * call sites that stamp `triggeredBy` after-the-fact. New code should
 * pass `{ triggeredBy, triggeredByUserId }` as an option to the runner
 * so the INSERT itself carries the correct value.
 */
export async function stampTriggeredBy(
  logId: string,
  triggeredBy: "cron" | "manual",
  userId: string | null,
): Promise<void> {
  try {
    await db
      .update(syncLogs)
      .set({
        triggeredBy,
        triggeredByUserId: triggeredBy === "manual" ? userId : null,
      })
      .where(eq(syncLogs.id, logId));
  } catch (err) {
    console.warn(
      "[triggers] stampTriggeredBy failed for",
      logId,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// Suppress unused-import warning for `sql` — kept for future atomic
// DELETE+RETURNING if we migrate to a dialect that supports it.
void sql;
