---
name: sync_log_concurrency_guard_pattern
description: Crash-recovery pattern for DB-backed "running" locks on sync_logs rows. Prevents permanent lockout after a SIGKILL or crash between logRunStart() and logRunEnd().
type: reference
---

Any sync flow that uses `sync_logs` with a `status = "running"` row as a
cross-instance mutex (see `runDeploymentBackfill` in
`src/lib/sync/deployment-backfill.ts`) MUST include staleness recovery:

```ts
const STALE_CUTOFF_MS = 6 * 60 * 60 * 1000;  // 6h — well over any real run
const [row] = await db.select({ id: syncLogs.id, startedAt: syncLogs.startedAt })
  .from(syncLogs)
  .where(and(eq(syncLogs.type, "<type>"), eq(syncLogs.status, "running")))
  .limit(1);
if (row) {
  const ms = row.startedAt ? new Date(row.startedAt).getTime() : 0;
  const isStale = ms <= 0 || Date.now() - ms > STALE_CUTOFF_MS;
  if (!isStale) return { deferred: true, ... };
  // reclaim
  await db.update(syncLogs)
    .set({ status: "failed", completedAt: new Date(), error: "Recovered stale <type> run lock" })
    .where(eq(syncLogs.id, row.id));
}
```

**Why:** A SIGKILL or unhandled crash between the `logRunStart()` insert and
the `logRunEnd()` update leaves the `running` row in place forever. Without
staleness recovery, every subsequent cron and admin trigger reads that row,
defers, and silently halts the flow — no alert fires because the status
endpoint sees a healthy "running" state. This was caught on PR #53 in the
deployment backfill and should be audited on any future `sync_logs`-based
lock (team-member sync, issue sync, etc. — check whether the in-memory
`runInFlight` flag is backed by a DB guard without a reclaim path).

**Cutoff sizing:** pick a value that exceeds the realistic upper bound of
one run by a wide margin. For deployment_backfill: `maxIssuesPerRun=200` ×
100ms pacing + GH work typically finishes in minutes; 6h gives margin for
slow GH responses and avoids reclaiming a still-active lock on a busy day.
For shorter flows (e.g. team sync — minutes), 1h is fine. Never go lower
than 2× the observed P99 run duration.
