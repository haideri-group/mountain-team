import { db } from "@/lib/db";
import { issues, deployments, syncLogs, githubBranchMappings } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fetchSingleIssue } from "@/lib/jira/issues";
import { recordDeploymentsForIssue } from "@/lib/github/issue-deployment-sync";
import { emitSyncLogChange } from "./events";
import { persistProgress, clearProgressThrottle } from "./progress-persist";
import { clearCompareCache } from "@/lib/github/deployment-propagation";
import {
  getLastKnownRateLimit,
  getRateLimit,
} from "@/lib/github/client";
import { sanitizeErrorText } from "@/lib/jira/client";
import { getDeploymentCompleteness } from "@/lib/deployments/brand-resolver";

/**
 * Phase 20 — rate-limit-aware deployment backfill.
 *
 * Walks the `issues` table (bounded input) and calls
 * `recordDeploymentsForIssue()` on each issue whose deployment data is
 * missing or stale. Stamps `issues.deploymentsSyncedAt` after each
 * successful processing so future runs skip fresh rows.
 *
 * Guardrails:
 *   - Pre-flight check on `GET /rate_limit` — refuses to start if
 *     `remaining < BACKFILL_RATE_LIMIT_START`
 *   - Circuit breaker between issues — stops cleanly if
 *     `getLastKnownRateLimit().remaining < BACKFILL_RATE_LIMIT_FLOOR`
 *   - Per-run cap (`BACKFILL_MAX_ISSUES_PER_RUN`) so one invocation can
 *     never starve other GH-dependent flows
 *   - 100ms pacing between issues
 */

// --- Configuration ---

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function getConfig() {
  return {
    maxIssuesPerRun: parseIntEnv("BACKFILL_MAX_ISSUES_PER_RUN", 200),
    rateLimitFloor: parseIntEnv("BACKFILL_RATE_LIMIT_FLOOR", 500),
    rateLimitStart: parseIntEnv("BACKFILL_RATE_LIMIT_START", 1000),
    sleepBetweenIssuesMs: parseIntEnv("BACKFILL_SLEEP_BETWEEN_ISSUES_MS", 100),
  };
}

// --- Progress tracking ---

export interface DeploymentBackfillProgress {
  phase: "idle" | "preflight" | "selecting" | "processing" | "done" | "failed" | "deferred";
  message: string;
  issuesTotal: number;
  issuesProcessed: number;
  deploymentsRecorded: number;
  rateLimitRemaining: number | null;
  startedAt: string | null;
  currentJiraKey: string | null;
}

const defaultProgress: DeploymentBackfillProgress = {
  phase: "idle",
  message: "",
  issuesTotal: 0,
  issuesProcessed: 0,
  deploymentsRecorded: 0,
  rateLimitRemaining: null,
  startedAt: null,
  currentJiraKey: null,
};

// Shared state on globalThis so writers (cron route) and readers
// (events projection in a different route segment) see the same
// currentProgress / activeLogId / runInFlight. Next.js dev can
// instantiate modules twice across route bundles; without this the
// cron route would update its copy while the panel projector reads
// a stale null from its own copy — no live progress, no bar.
interface BackfillState {
  currentProgress: DeploymentBackfillProgress;
  activeLogId: string | null;
  runInFlight: boolean;
}
const globalForBackfill = globalThis as unknown as {
  _backfillState?: BackfillState;
};
if (!globalForBackfill._backfillState) {
  globalForBackfill._backfillState = {
    currentProgress: { ...defaultProgress },
    activeLogId: null,
    runInFlight: false,
  };
}
const bstate = globalForBackfill._backfillState;

export function getDeploymentBackfillProgress(): DeploymentBackfillProgress {
  return { ...bstate.currentProgress };
}

export function getDeploymentBackfillProgressForLogId(
  logId: string,
): DeploymentBackfillProgress | null {
  if (bstate.activeLogId !== logId) return null;
  return { ...bstate.currentProgress };
}

function updateProgress(update: Partial<DeploymentBackfillProgress>) {
  bstate.currentProgress = { ...bstate.currentProgress, ...update };
}

function resetProgress() {
  bstate.currentProgress = { ...defaultProgress };
  bstate.activeLogId = null;
}

// --- Result ---

export interface BackfillRunResult {
  processed: number;
  recorded: number;
  errors: number;
  rateLimitStopped: boolean;
  deferred: boolean;
  durationMs: number;
  checkpointAtJiraKey: string | null;
  /** id of the sync_logs row this run wrote. Null when the run was
   *  deferred via the concurrency / staleness guards (no row written). */
  logId: string | null;
}

// --- Helpers ---

async function getAllProductionSites(): Promise<string[]> {
  const rows = await db
    .select({ siteName: githubBranchMappings.siteName })
    .from(githubBranchMappings)
    .where(eq(githubBranchMappings.environment, "production"));
  const set = new Set<string>();
  for (const r of rows) if (r.siteName) set.add(r.siteName);
  return [...set].sort();
}

async function getDeployedSiteNamesForKeys(
  jiraKeys: string[],
): Promise<Map<string, Set<string>>> {
  if (jiraKeys.length === 0) return new Map();
  const rows = await db
    .select({ jiraKey: deployments.jiraKey, siteName: deployments.siteName })
    .from(deployments)
    .where(
      and(
        inArray(deployments.jiraKey, jiraKeys),
        inArray(deployments.environment, ["production", "canonical"]),
      ),
    );
  const byKey = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.siteName) continue;
    if (!byKey.has(r.jiraKey)) byKey.set(r.jiraKey, new Set());
    byKey.get(r.jiraKey)!.add(r.siteName);
  }
  return byKey;
}

interface QueueCandidate {
  id: string;
  jiraKey: string;
  status: string;
  brands: string | null;
  priority: number;
  deploymentsSyncedAt: Date | null;
}

/**
 * Priority-queue selector.
 *
 * Buckets (lower number = earlier in the queue):
 *   P1: never-synced AND not done/closed
 *   P2: never-synced (any status)
 *   P3: active-status AND stamp > 6h old
 *   P4: JIRA updated since last sync stamp
 *   P5: age-based rotation (oldest stamp first)
 *
 * Completeness refinement happens in JS (not SQL) because multi-site brand
 * matrices can't be expressed cleanly in a WHERE clause: a done issue with
 * `brands = "Tile Mountain, Bathroom Mountain"` and one production deployment
 * (`tilemtn`) must stay queued until the `bathmtn` site lands. An SQL-level
 * `EXISTS` check would drop it as soon as any production/canonical row
 * existed.
 *
 * The query over-fetches (`limit * 2`) and JS-side filtering against
 * `getDeploymentCompleteness(brands, …)` drops only truly complete
 * done/closed issues.
 *
 * NOTE on `jiraUpdatedAt` parsing:
 *   `issues.jiraUpdatedAt` is stored as the raw JIRA `fields.updated` string
 *   (varchar(50) — e.g. `2026-04-19T12:34:56.789+0000`). MySQL `STR_TO_DATE`
 *   has no `%z` specifier, so we truncate to the first 23 characters
 *   (`YYYY-MM-DDTHH:MM:SS.sss`) before parsing. The resulting timestamp is
 *   UTC-ish for comparison purposes — accurate within seconds, which is
 *   sufficient for the P4 "updated since last sync" bucket.
 */
async function selectQueue(limit: number): Promise<QueueCandidate[]> {
  const rows = await db.execute(sql`
    SELECT
      i.id,
      i.jiraKey,
      i.status,
      i.brands,
      i.deploymentsSyncedAt,
      CASE
        WHEN i.deploymentsSyncedAt IS NULL AND i.status NOT IN ('done', 'closed') THEN 1
        WHEN i.deploymentsSyncedAt IS NULL THEN 2
        WHEN i.status NOT IN ('done', 'closed')
             AND i.deploymentsSyncedAt < DATE_SUB(NOW(), INTERVAL 6 HOUR) THEN 3
        WHEN i.jiraUpdatedAt IS NOT NULL
             AND STR_TO_DATE(LEFT(i.jiraUpdatedAt, 23), '%Y-%m-%dT%H:%i:%s.%f') > i.deploymentsSyncedAt THEN 4
        ELSE 5
      END AS priority
    FROM issues i
    WHERE i.boardId IN (SELECT id FROM boards WHERE isTracked = 1)
    ORDER BY
      priority ASC,
      (i.deploymentsSyncedAt IS NOT NULL) ASC,
      i.deploymentsSyncedAt ASC,
      i.jiraCreatedAt DESC
    LIMIT ${limit * 2}
  `);

  // drizzle's mysql execute returns [rows, fields] at runtime — the type
  // signature reflects the DML-style ResultSetHeader rather than the
  // SELECT row array, so cast via unknown.
  const raw = (Array.isArray(rows) ? rows[0] : rows) as unknown as Array<{
    id: string;
    jiraKey: string;
    status: string;
    brands: string | null;
    deploymentsSyncedAt: Date | null;
    priority: number | bigint;
  }>;

  const candidates: QueueCandidate[] = raw.map((r) => ({
    id: r.id,
    jiraKey: r.jiraKey,
    status: r.status,
    brands: r.brands,
    priority: Number(r.priority),
    deploymentsSyncedAt: r.deploymentsSyncedAt,
  }));

  // JS-side completion refinement — drop ANY issue whose expected sites
  // (from brands) are already fully covered by existing deployments.
  // Applies to every priority bucket and every status: if the table shows
  // full coverage, re-running the fetch just burns GitHub quota confirming
  // rows we already have.
  //
  // For each skipped issue we also stamp `deploymentsSyncedAt = now()` so
  // the priority queue deprioritizes it on the next run — done/closed
  // fully-covered issues then get excluded by the SQL pre-filter, active
  // ones resurface at the 6h mark via P3 and get re-checked cheaply.
  const allKeys = candidates.map((c) => c.jiraKey);
  if (allKeys.length === 0) return [];
  const allProductionSites = await getAllProductionSites();
  const deployedByKey = await getDeployedSiteNamesForKeys(allKeys);

  const filtered: QueueCandidate[] = [];
  const alreadyCoveredIds: string[] = [];

  for (const c of candidates) {
    const deployed = [...(deployedByKey.get(c.jiraKey) ?? new Set<string>())];
    const completeness = getDeploymentCompleteness(c.brands, deployed, allProductionSites);
    // completeness === null  → brands unknown/empty → keep (can't tell).
    // completeness.complete  → every resolved brand's expected sites are recorded.
    // completeness.allResolved → every parsed brand resolved via BRAND_SITE_MAP.
    //
    // We only short-circuit when BOTH are true. If `allResolved` is false
    // (typo, newly-added brand) then `expected` only reflects the brands
    // that did resolve, so `complete` can be true even though we haven't
    // checked sites for the unresolved brands. Suppressing backfill in
    // that case would hide missing deployments until the 6h P3 mark (or
    // forever, for done/closed issues). Safer to let the backfill run
    // and pay the GitHub cost on a rare typo than silently skip.
    if (completeness && completeness.complete && completeness.allResolved) {
      alreadyCoveredIds.push(c.id);
      continue;
    }
    // `getExpectedSites` returns `null` (not `[]`) when brands map to no
    // sites — Wholesale is the only such brand today. Skip those too.
    if (c.brands) {
      const brands = c.brands
        .split(",")
        .map((b) => b.trim().toLowerCase())
        .filter(Boolean);
      if (brands.length > 0 && brands.every((b) => b === "wholesale")) {
        alreadyCoveredIds.push(c.id);
        continue;
      }
    }
    filtered.push(c);
    if (filtered.length >= limit) break;
  }

  // Bulk-stamp the already-covered issues so the priority queue stops
  // surfacing them on every run.
  if (alreadyCoveredIds.length > 0) {
    await db
      .update(issues)
      .set({ deploymentsSyncedAt: new Date() })
      .where(inArray(issues.id, alreadyCoveredIds));
  }

  return filtered.slice(0, limit);
}

async function markSynced(issueId: string): Promise<void> {
  await db
    .update(issues)
    .set({ deploymentsSyncedAt: new Date() })
    .where(eq(issues.id, issueId));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Sync log persistence ---

async function logRunStart(
  triggeredBy: "cron" | "manual" | null,
  triggeredByUserId: string | null,
): Promise<string> {
  const id = `synclog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = new Date();
  await db.insert(syncLogs).values({
    id,
    type: "deployment_backfill",
    status: "running",
    startedAt,
    triggeredBy,
    triggeredByUserId: triggeredBy === "manual" ? triggeredByUserId : null,
  });
  emitSyncLogChange({
    id,
    type: "deployment_backfill",
    status: "running",
    startedAt: startedAt.toISOString(),
    completedAt: null,
    transition: "started",
  });
  return id;
}

async function logRunEnd(
  id: string,
  result: BackfillRunResult,
  error?: string,
): Promise<void> {
  const completedAt = new Date();
  const status = error ? "failed" : "completed";
  await db
    .update(syncLogs)
    .set({
      status,
      completedAt,
      issueCount: result.processed,
      progressProcessed: result.processed,
      // progressTotal left unchanged on purpose — the queue size set at
      // processing start is still the correct denominator on completion.
      error: error ? sanitizeErrorText(error).slice(0, 1000) : null,
    })
    .where(eq(syncLogs.id, id));
  clearProgressThrottle(id);
  emitSyncLogChange({
    id,
    type: "deployment_backfill",
    status,
    startedAt: null,
    completedAt: completedAt.toISOString(),
    transition: "finished",
  });
}

// --- Concurrency guard ---

export function isBackfillRunning(): boolean {
  return bstate.runInFlight;
}

// --- Main runner ---

export async function runDeploymentBackfill(
  opts?: { triggeredBy?: "cron" | "manual" | null; triggeredByUserId?: string | null },
): Promise<BackfillRunResult> {
  const startedAt = Date.now();
  const cfg = getConfig();

  const result: BackfillRunResult = {
    processed: 0,
    recorded: 0,
    errors: 0,
    rateLimitStopped: false,
    deferred: false,
    durationMs: 0,
    checkpointAtJiraKey: null,
    logId: null,
  };

  if (bstate.runInFlight) {
    return {
      ...result,
      deferred: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // Cross-instance guard: if another process has a running sync_logs row
  // for deployment_backfill, defer. Railway hobby is single-instance today,
  // but this keeps the guarantee intact if we scale horizontally.
  //
  // Staleness recovery: if the running row is older than STALE_CUTOFF_MS
  // (6h — well over any real backfill duration), treat it as a crashed run,
  // mark it failed, and proceed with this run. Without this, a process kill
  // between `logRunStart()` and `logRunEnd()` would leave a permanent
  // "running" row and block every future cron/admin invocation.
  // MySQL-native age check so the comparison isn't skewed by mysql2
  // driver timezone round-trips (see notes in logs-query.summarize24h).
  const STALE_CUTOFF_SEC = 6 * 60 * 60;
  const [alreadyRunningLog] = await db
    .select({
      id: syncLogs.id,
      isStale: sql<number>`CASE WHEN ${syncLogs.startedAt} IS NULL OR ${syncLogs.startedAt} <= NOW() - INTERVAL ${STALE_CUTOFF_SEC} SECOND THEN 1 ELSE 0 END`,
    })
    .from(syncLogs)
    .where(
      and(
        eq(syncLogs.type, "deployment_backfill"),
        eq(syncLogs.status, "running"),
      ),
    )
    .limit(1);

  if (alreadyRunningLog) {
    const isStale = Number(alreadyRunningLog.isStale) === 1;

    if (!isStale) {
      return {
        ...result,
        deferred: true,
        durationMs: Date.now() - startedAt,
      };
    }

    // Reclaim the crashed row before proceeding. Re-assert
    // `status='running'` inside the UPDATE so a race where the legitimate
    // writer completed this row between our SELECT and this UPDATE
    // doesn't stamp a completed row back to `failed`. Same guard pattern
    // used in `src/lib/sync/reclaim.ts` for the admin-triggered reclaim
    // paths; we only emit the failure SSE when the update actually
    // affected a row.
    const recoveredAt = new Date();
    const updateResult = await db
      .update(syncLogs)
      .set({
        status: "failed",
        completedAt: recoveredAt,
        error: "Recovered stale deployment_backfill run lock",
      })
      .where(
        and(
          eq(syncLogs.id, alreadyRunningLog.id),
          eq(syncLogs.status, "running"),
        ),
      );

    // drizzle-orm/mysql2 returns a `[ResultSetHeader]` tuple; use
    // `.affectedRows` to confirm the guarded UPDATE actually flipped
    // the row (not a no-op because the legitimate writer finished
    // first). Only then broadcast the failure transition.
    const affected =
      (Array.isArray(updateResult)
        ? (updateResult[0] as { affectedRows?: number })?.affectedRows
        : (updateResult as { affectedRows?: number })?.affectedRows) ?? 0;

    if (affected > 0) {
      // Emit SSE so the /automations summary + table refresh the stale
      // stuck-count; without this the "Reclaim all stuck" banner can
      // linger on the client even though the row is already `failed`.
      emitSyncLogChange({
        id: alreadyRunningLog.id,
        type: "deployment_backfill",
        status: "failed",
        startedAt: null,
        completedAt: recoveredAt.toISOString(),
        transition: "finished",
      });
    }
  }

  bstate.runInFlight = true;

  // Fresh compare + branch-commits caches for this run. Within the run
  // they persist across issues so two issues that share a commit or
  // branch pay one GitHub round-trip total.
  clearCompareCache();

  resetProgress();
  updateProgress({
    phase: "preflight",
    message: "Checking GitHub rate limit",
    startedAt: new Date().toISOString(),
  });

  const logId = await logRunStart(
    opts?.triggeredBy ?? null,
    opts?.triggeredByUserId ?? null,
  );
  bstate.activeLogId = logId;
  result.logId = logId;

  try {
    // Pre-flight: poll /rate_limit. This endpoint does NOT count against
    // the limit, so it's free.
    try {
      const rate = await getRateLimit();
      updateProgress({ rateLimitRemaining: rate.remaining });
      if (rate.remaining < cfg.rateLimitStart) {
        updateProgress({
          phase: "deferred",
          message: `Deferred — GitHub rate limit remaining ${rate.remaining} < start floor ${cfg.rateLimitStart}`,
        });
        result.deferred = true;
        result.durationMs = Date.now() - startedAt;
        await logRunEnd(logId, result);
        return result;
      }
    } catch (e) {
      // If we can't read rate limit we press on cautiously — this matches
      // how other flows tolerate transient GH failures.
      console.warn(
        "Deployment backfill: pre-flight rate-limit check failed (proceeding):",
        sanitizeErrorText(e instanceof Error ? e.message : String(e)),
      );
    }

    updateProgress({ phase: "selecting", message: "Selecting issue queue" });
    const queue = await selectQueue(cfg.maxIssuesPerRun);
    updateProgress({
      issuesTotal: queue.length,
      phase: "processing",
      message: `Processing ${queue.length} issue${queue.length === 1 ? "" : "s"}`,
    });
    // Persist total + 0 processed up front so cross-process readers
    // (admin on dev viewing a prod-running backfill) see the bar width
    // immediately — no more "In progress" marquee for 35+ minutes.
    persistProgress(logId, 0, queue.length);

    if (queue.length === 0) {
      updateProgress({ phase: "done", message: "Queue empty — nothing to backfill" });
      result.durationMs = Date.now() - startedAt;
      await logRunEnd(logId, result);
      return result;
    }

    for (const candidate of queue) {
      // Circuit breaker between issues
      const rl = getLastKnownRateLimit();
      if (rl) {
        updateProgress({ rateLimitRemaining: rl.remaining });
        if (rl.remaining < cfg.rateLimitFloor) {
          updateProgress({
            phase: "done",
            message: `Stopped early — GitHub rate limit remaining ${rl.remaining} < floor ${cfg.rateLimitFloor}`,
          });
          result.rateLimitStopped = true;
          result.checkpointAtJiraKey = candidate.jiraKey;
          break;
        }
      }

      updateProgress({ currentJiraKey: candidate.jiraKey });

      try {
        // Fetch the JIRA numeric id so strategy 1 (dev-status) is available
        let jiraIssueId: string | null = null;
        try {
          const raw = await fetchSingleIssue(candidate.jiraKey);
          if (raw) jiraIssueId = raw.id;
        } catch (e) {
          console.warn(
            `Deployment backfill: fetchSingleIssue(${candidate.jiraKey}) failed (falling through):`,
            sanitizeErrorText(e instanceof Error ? e.message : String(e)),
          );
        }

        const syncResult = await recordDeploymentsForIssue({
          jiraKey: candidate.jiraKey,
          jiraIssueId,
          // Backfill uses the PR merge date as the approximate per-branch
          // deploy date — skips `findBranchDeployDate` (~21 GH calls per
          // branch) in favor of throughput. Per-issue Sync button keeps
          // the accurate path for user-triggered single-issue refreshes.
          approximateDates: true,
        });

        result.recorded += syncResult.deploymentsRecorded;
        await markSynced(candidate.id);
        result.processed += 1;
        result.checkpointAtJiraKey = candidate.jiraKey;

        updateProgress({
          issuesProcessed: result.processed,
          deploymentsRecorded: result.recorded,
        });
        // Throttled (2s) persist — max one UPDATE per 2s regardless of
        // how fast the loop iterates, so cross-process readers see
        // live counts without pounding MySQL.
        persistProgress(logId, result.processed, queue.length);
      } catch (e) {
        result.errors += 1;
        console.warn(
          `Deployment backfill: issue ${candidate.jiraKey} failed:`,
          sanitizeErrorText(e instanceof Error ? e.message : String(e)),
        );
      }

      if (cfg.sleepBetweenIssuesMs > 0) {
        await sleep(cfg.sleepBetweenIssuesMs);
      }
    }

    if (!result.rateLimitStopped) {
      updateProgress({
        phase: "done",
        message: `Done — processed ${result.processed} issue${result.processed === 1 ? "" : "s"}, ${result.recorded} deployment${result.recorded === 1 ? "" : "s"} recorded`,
        currentJiraKey: null,
      });
    }

    result.durationMs = Date.now() - startedAt;
    await logRunEnd(logId, result);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateProgress({
      phase: "failed",
      message: `Backfill failed: ${sanitizeErrorText(msg)}`,
    });
    result.durationMs = Date.now() - startedAt;
    await logRunEnd(logId, result, msg);
    throw e;
  } finally {
    bstate.runInFlight = false;
  }
}
