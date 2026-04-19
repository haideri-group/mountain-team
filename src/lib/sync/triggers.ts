import "server-only";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SyncLogType } from "./logs-query";

/**
 * "Next run is manual" registry + write-back helper.
 *
 * The Run Now button in the Scheduled Crons panel fires Cronicle's
 * `run_event` API. Cronicle then sends an HTTP GET to `/api/cron/...`,
 * which is the same endpoint the scheduled fire hits — the cron
 * handler has no way, from the request itself, to know whether it was
 * scheduled or admin-initiated.
 *
 * This registry lets the Run Now endpoint mark a short-lived flag with
 * the triggering admin's user id. The cron handler consumes the flag
 * atomically when its own HTTP request arrives; if present, the
 * sync_log row is stamped `triggeredBy='manual'` + the user id, so the
 * /automations UI can render "manual (Admin Name)" instead of the
 * misleading "cron" (or pre-migration "unknown").
 *
 * Family-scoped to match the existing concurrency lock — one pending
 * mark per sync family (issue / team / release / worklog / timedoctor /
 * deployment_backfill) is sufficient because the lock guarantees only
 * one run of each family at a time.
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

interface PendingMark {
  /** User id of the admin who clicked Run Now. */
  userId: string | null;
  expiresAt: number;
}

// Cache on globalThis so the marker set in the Run Now route bundle is
// readable from the cron route bundle (same story as events.ts /
// concurrency.ts — Next.js dev can instantiate library modules once
// per route segment).
const globalForTriggers = globalThis as unknown as {
  _manualTriggers?: Map<SyncFamily, PendingMark>;
};
if (!globalForTriggers._manualTriggers) {
  globalForTriggers._manualTriggers = new Map();
}
const markers = globalForTriggers._manualTriggers;

const DEFAULT_TTL_MS = 60_000;

/** Called by `/api/automations/cronicle/events/[id]/run` right before
 *  firing Cronicle's run_event. `userId` is the admin who clicked.
 *  When Cronicle subsequently invokes our cron handler,
 *  `consumePendingManual` returns this mark. */
export function markPendingManual(
  type: SyncLogType,
  userId: string | null,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const family = SYNC_FAMILY[type];
  markers.set(family, { userId, expiresAt: Date.now() + ttlMs });
}

/** Called by cron-route handlers (`/api/cron/*`) at the top of the
 *  handler. Returns the stored mark exactly once per `markPendingManual`
 *  call; subsequent calls return null until the next mark. Expired
 *  markers are cleaned up on read. */
export function consumePendingManual(type: SyncLogType): { userId: string | null } | null {
  const family = SYNC_FAMILY[type];
  const mark = markers.get(family);
  if (!mark) return null;
  if (mark.expiresAt < Date.now()) {
    markers.delete(family);
    return null;
  }
  markers.delete(family);
  return { userId: mark.userId };
}

/** Stamp `triggeredBy` + `triggeredByUserId` onto a sync_log row that
 *  already exists. Used by cron + sync routes after the runner returns,
 *  so we don't have to thread two extra params through every runner
 *  signature. Safe to call on a completed or failed row — just writes
 *  the source attribution fields. */
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
    // Source attribution is a UX nicety — don't fail the whole request
    // if the UPDATE fails.
    console.warn(
      "[triggers] stampTriggeredBy failed for",
      logId,
      err instanceof Error ? err.message : String(err),
    );
  }
}
