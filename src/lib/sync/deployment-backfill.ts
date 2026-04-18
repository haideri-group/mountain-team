import { db } from "@/lib/db";
import { issues, deployments, syncLogs, githubBranchMappings } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fetchSingleIssue } from "@/lib/jira/issues";
import { recordDeploymentsForIssue } from "@/lib/github/issue-deployment-sync";
import {
  getLastKnownRateLimit,
  getRateLimit,
} from "@/lib/github/client";
import { sanitizeErrorText } from "@/lib/jira/client";
import {
  getDeploymentCompleteness,
  getExpectedSites,
} from "@/lib/deployments/brand-resolver";

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

let currentProgress: DeploymentBackfillProgress = { ...defaultProgress };

export function getDeploymentBackfillProgress(): DeploymentBackfillProgress {
  return { ...currentProgress };
}

function updateProgress(update: Partial<DeploymentBackfillProgress>) {
  currentProgress = { ...currentProgress, ...update };
}

function resetProgress() {
  currentProgress = { ...defaultProgress };
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
 * The SQL pre-filter skips done/closed issues that already have ≥1
 * production/canonical deployment row AND have been synced before — those
 * are refined in JS against `getExpectedSites(brands)` to drop rows that
 * are truly complete (all expected sites deployed).
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
             AND STR_TO_DATE(i.jiraUpdatedAt, '%Y-%m-%dT%H:%i:%s.%f%z') > i.deploymentsSyncedAt THEN 4
        ELSE 5
      END AS priority
    FROM issues i
    WHERE i.boardId IN (SELECT id FROM boards WHERE isTracked = 1)
      AND NOT (
        i.status IN ('done', 'closed')
        AND i.deploymentsSyncedAt IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM deployments d
          WHERE d.jiraKey = i.jiraKey
            AND d.environment IN ('production', 'canonical')
        )
      )
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

  // JS-side completion refinement — drop done/closed issues whose expected
  // sites (from brands) are already covered by existing deployments.
  const p5Keys = candidates.filter((c) => c.priority === 5).map((c) => c.jiraKey);
  if (p5Keys.length === 0) return candidates.slice(0, limit);

  const allProductionSites = await getAllProductionSites();
  const deployedByKey = await getDeployedSiteNamesForKeys(p5Keys);

  const filtered: QueueCandidate[] = [];
  for (const c of candidates) {
    if (c.priority !== 5) {
      filtered.push(c);
      continue;
    }
    if (c.status === "done" || c.status === "closed") {
      const deployed = [...(deployedByKey.get(c.jiraKey) ?? new Set<string>())];
      const completeness = getDeploymentCompleteness(c.brands, deployed, allProductionSites);
      // completeness === null means brands unknown — keep the row (can't tell)
      // completeness.complete === true means every expected site is deployed
      if (completeness && completeness.complete) continue;
      // Also drop if brands is set but maps to empty expected (e.g., "Wholesale")
      const expected = getExpectedSites(c.brands, allProductionSites);
      if (expected && expected.length === 0) continue;
    }
    filtered.push(c);
    if (filtered.length >= limit) break;
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

async function logRunStart(): Promise<string> {
  const id = `synclog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(syncLogs).values({
    id,
    type: "deployment_backfill",
    status: "running",
    startedAt: new Date(),
  });
  return id;
}

async function logRunEnd(
  id: string,
  result: BackfillRunResult,
  error?: string,
): Promise<void> {
  await db
    .update(syncLogs)
    .set({
      status: error ? "failed" : "completed",
      completedAt: new Date(),
      issueCount: result.processed,
      error: error ? sanitizeErrorText(error).slice(0, 1000) : null,
    })
    .where(eq(syncLogs.id, id));
}

// --- Concurrency guard ---

let runInFlight = false;

export function isBackfillRunning(): boolean {
  return runInFlight;
}

// --- Main runner ---

export async function runDeploymentBackfill(): Promise<BackfillRunResult> {
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
  };

  if (runInFlight) {
    return {
      ...result,
      deferred: true,
      durationMs: Date.now() - startedAt,
    };
  }
  runInFlight = true;

  resetProgress();
  updateProgress({
    phase: "preflight",
    message: "Checking GitHub rate limit",
    startedAt: new Date().toISOString(),
  });

  const logId = await logRunStart();

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
        });

        result.recorded += syncResult.deploymentsRecorded;
        await markSynced(candidate.id);
        result.processed += 1;
        result.checkpointAtJiraKey = candidate.jiraKey;

        updateProgress({
          issuesProcessed: result.processed,
          deploymentsRecorded: result.recorded,
        });
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
    runInFlight = false;
  }
}
