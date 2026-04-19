import "server-only";
import type { SyncLogType } from "./logs-query";

/**
 * Shared, family-aware concurrency guard for all TeamFlow cron jobs.
 *
 * Why family-aware? The issue-sync cron writes `full` OR `incremental`
 * OR `manual` into `sync_logs.type` depending on context — but they all
 * hit the same JIRA endpoint and touch the same DB rows. We don't want
 * a scheduled `incremental` to race with a manually-triggered `manual`
 * just because their enum values differ. One lock per FAMILY, not per
 * enum value.
 *
 * Scope is this Node process. Railway hobby = single instance so the
 * Map is authoritative. On a multi-instance deploy, swap for a Redis
 * SETNX-style lock; the `tryAcquire` / `release` / `isRunning` API
 * stays the same.
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

interface LockInfo {
  type: SyncLogType;
  startedAt: Date;
}

const locks = new Map<SyncFamily, LockInfo>();

/** True if the lock for this type's family is free. Doesn't acquire.
 *  Useful for UI pre-checks (e.g. the Run Now button) that want to warn
 *  the admin before firing a cron that would just be deferred anyway. */
export function isSyncRunning(type: SyncLogType): boolean {
  return locks.has(SYNC_FAMILY[type]);
}

/** Return the currently-held lock for this type's family, if any. */
export function getActiveLock(type: SyncLogType): LockInfo | null {
  return locks.get(SYNC_FAMILY[type]) ?? null;
}

/** Atomic test-and-set. Returns true if the caller now owns the lock. */
export function tryAcquireSyncLock(type: SyncLogType): boolean {
  const family = SYNC_FAMILY[type];
  if (locks.has(family)) return false;
  locks.set(family, { type, startedAt: new Date() });
  return true;
}

/** Release the lock held for this type's family. Safe to call even
 *  if the lock isn't held (idempotent). */
export function releaseSyncLock(type: SyncLogType): void {
  locks.delete(SYNC_FAMILY[type]);
}
