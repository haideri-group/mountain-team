import { db } from "@/lib/db";
import { issues, boards, team_members, syncLogs } from "@/lib/db/schema";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { generateNotificationsFromSync } from "@/lib/notifications/generator";
import { recordWorkloadSnapshots } from "@/lib/workload/snapshots";
import {
  discoverCustomFieldIds,
  fetchIssuesByJql,
  fetchSingleIssue,
  fetchWithRetry,
  buildFullSyncJql,
  buildIncrementalSyncJql,
} from "@/lib/jira/issues";
import { normalizeIssue, calculateCycleTime, loadStatusMappingCache, invalidateStatusMappingCache } from "@/lib/jira/normalizer";
import { sanitizeErrorText } from "@/lib/jira/client";
import { OVERVIEW_CACHE_TAG } from "@/lib/config";
import { recordDeploymentsForIssue } from "@/lib/github/issue-deployment-sync";
import { clearCompareCache } from "@/lib/github/deployment-propagation";
import { emitSyncLogChange } from "./events";
import {
  persistProgress,
  flushProgress,
  clearProgressThrottle,
} from "./progress-persist";
import { upsertWorklogs, fetchIssueWorklogs } from "@/lib/sync/worklog-sync";
import { reconcileReleaseIssues } from "@/lib/releases/sync-release-issues";
import { refreshReleasesForIssue } from "@/lib/sync/release-sync";

// --- Types ---

export type IssueSyncType = "full" | "incremental" | "manual";

export interface IssueSyncResult {
  inserted: number;
  updated: number;
  skippedNoBoard: number;
  total: number;
  errors: string[];
}

// --- Progress Tracking (in-memory) ---

export interface SyncProgress {
  phase: "idle" | "fetching" | "processing" | "done" | "failed";
  message: string;
  issuesFetched: number;
  issuesProcessed: number;
  issuesTotal: number;
}

// Cache the singleton on globalThis so the writer (cron route segment)
// and the reader (/api/automations/cronicle/events → discovery.ts)
// share state across route-segment module instances. Without this, the
// writer sets activeLogId in its module copy and the reader sees null
// from its own copy — no progress bar, no live progress.
interface IssueSyncState {
  currentProgress: SyncProgress;
  activeLogId: string | null;
}
const globalForSync = globalThis as unknown as {
  _issueSyncState?: IssueSyncState;
};
if (!globalForSync._issueSyncState) {
  globalForSync._issueSyncState = {
    currentProgress: {
      phase: "idle",
      message: "",
      issuesFetched: 0,
      issuesProcessed: 0,
      issuesTotal: 0,
    },
    activeLogId: null,
  };
}
const state = globalForSync._issueSyncState;

export function getSyncProgress(): SyncProgress {
  return { ...state.currentProgress };
}

/** Returns the in-flight progress IFF it belongs to the sync_logs row
 *  with the given id. Used by `/api/automations/[id]` to prevent
 *  cross-run confusion. */
export function getSyncProgressForLogId(logId: string): SyncProgress | null {
  if (state.activeLogId !== logId) return null;
  return { ...state.currentProgress };
}

function resetProgress() {
  state.currentProgress = {
    phase: "idle",
    message: "",
    issuesFetched: 0,
    issuesProcessed: 0,
    issuesTotal: 0,
  };
  state.activeLogId = null;
}

function updateProgress(update: Partial<SyncProgress>) {
  state.currentProgress = { ...state.currentProgress, ...update };
}

// --- Core Sync ---

async function syncIssues(type: IssueSyncType, filterBoardKey?: string): Promise<IssueSyncResult> {
  const result: IssueSyncResult = {
    inserted: 0,
    updated: 0,
    skippedNoBoard: 0,
    total: 0,
    errors: [],
  };

  // 1. Load tracked boards (optionally filtered to a single board)
  let trackedBoards = await db
    .select()
    .from(boards)
    .where(eq(boards.isTracked, true));

  if (filterBoardKey) {
    trackedBoards = trackedBoards.filter((b) => b.jiraKey === filterBoardKey);
  }

  if (trackedBoards.length === 0) {
    updateProgress({ phase: "done", message: filterBoardKey ? `Board ${filterBoardKey} not found or not tracked` : "No tracked boards" });
    return result;
  }

  const boardByKey = new Map(trackedBoards.map((b) => [b.jiraKey, b]));
  const boardKeys = trackedBoards.map((b) => b.jiraKey);

  updateProgress({
    phase: "fetching",
    message: filterBoardKey ? `Syncing ${filterBoardKey}...` : `Preparing sync for ${boardKeys.length} board(s)...`,
  });

  // 2. Load team members for assignee matching
  const allMembers = await db.select().from(team_members);
  const memberByAccountId = new Map(
    allMembers.map((m) => [m.jiraAccountId, m]),
  );

  // 3. Discover custom field IDs + load status mapping cache
  updateProgress({ message: "Discovering JIRA custom fields..." });
  const customFields = await discoverCustomFieldIds();
  await loadStatusMappingCache();

  // 4. Build JQL — sync issues assigned to team members OR with Frontend label
  const frontendLabel = process.env.JIRA_FRONTEND_LABEL || "Frontend";
  const memberAccountIds = allMembers
    .filter((m) => m.jiraAccountId && m.status === "active")
    .map((m) => m.jiraAccountId!);

  // Auto-exempt boards with zero existing rows so a newly-tracked board's
  // first sync still fetches old-terminal tickets. Subsequent runs will
  // see the board populated and re-apply the filter normally.
  const trackedBoardIds = trackedBoards.map((b) => b.id);
  const existingCounts = trackedBoardIds.length > 0
    ? await db
        .select({ boardId: issues.boardId, n: sql<number>`count(*)` })
        .from(issues)
        .where(inArray(issues.boardId, trackedBoardIds))
        .groupBy(issues.boardId)
    : [];
  const populatedBoardIds = new Set(
    existingCounts.filter((r) => Number(r.n) > 0).map((r) => r.boardId),
  );
  const exemptBoardKeys = trackedBoards
    .filter((b) => !populatedBoardIds.has(b.id))
    .map((b) => b.jiraKey);
  const filterOpts = { exemptBoardKeys };

  let jql: string;

  if (type === "incremental") {
    // Find last successful issue sync
    const [lastSync] = await db
      .select()
      .from(syncLogs)
      .where(
        inArray(syncLogs.type, ["full", "incremental", "manual"]),
      )
      .orderBy(desc(syncLogs.startedAt))
      .limit(1);

    if (lastSync?.status === "completed" && lastSync.startedAt) {
      const since = new Date(lastSync.startedAt)
        .toISOString()
        .replace("T", " ")
        .substring(0, 16); // "YYYY-MM-DD HH:mm"
      jql = buildIncrementalSyncJql(boardKeys, memberAccountIds, since, frontendLabel, filterOpts);
    } else {
      // No previous sync -- fall back to full
      jql = buildFullSyncJql(boardKeys, memberAccountIds, frontendLabel, filterOpts);
    }
  } else {
    jql = buildFullSyncJql(boardKeys, memberAccountIds, frontendLabel, filterOpts);
  }

  // 5. Fetch issues from JIRA
  updateProgress({ message: "Fetching issues from JIRA..." });
  const rawIssues = await fetchIssuesByJql(jql, customFields);

  updateProgress({
    issuesFetched: rawIssues.length,
    issuesTotal: rawIssues.length,
    phase: "processing",
    message: `Processing ${rawIssues.length} issues...`,
  });
  // Persist total immediately so cross-process readers (panel projector
  // running on a different server) can show the bar width right away.
  if (state.activeLogId) {
    persistProgress(state.activeLogId, 0, rawIssues.length);
  }

  // 6. Load existing issues for comparison (for cycle time detection)
  const existingIssues = await db.select().from(issues);
  const existingByKey = new Map(existingIssues.map((i) => [i.jiraKey, i]));

  // 7. Upsert each issue
  let processedCount = 0;
  for (const raw of rawIssues) {
    try {
      const normalized = await normalizeIssue(raw, customFields);

      // Resolve board
      const board = boardByKey.get(normalized.projectKey);
      if (!board) {
        result.skippedNoBoard++;
        continue;
      }

      // Resolve assignee
      const member = normalized.assigneeAccountId
        ? memberByAccountId.get(normalized.assigneeAccountId)
        : null;

      // Cycle time logic + upsert (shared utilities)
      const existing = existingByKey.get(normalized.jiraKey) || null;
      const { completedDate, cycleTime } = applyCycleTimeLogic(normalized, existing);
      const id = existing?.id || `iss_${Date.now()}_${result.inserted + result.updated}`;
      const fields = buildIssueUpsertFields(normalized, board.id, member?.id || null, completedDate, cycleTime);

      await db
        .insert(issues)
        .values({ id, jiraKey: normalized.jiraKey, ...fields })
        .onDuplicateKeyUpdate({
          set: fields,
        });

      // Ensure release rows exist before diffing the junction. Without this,
      // a brand-new fixVersion encountered by bulk sync before the nightly
      // release-sync cron would silently skip the junction insert, leaving
      // the diff with nothing to repair.
      try {
        await refreshReleasesForIssue(normalized.fixVersions, normalized.projectKey);
      } catch (err) {
        // Non-fatal — release-sync cron will backfill any missed versions.
        // Sanitize — refreshReleasesForIssue hits JIRA and its errors can
        // echo upstream tokens.
        console.warn(
          "refreshReleasesForIssue failed (non-fatal):",
          sanitizeErrorText(err instanceof Error ? err.message : String(err)),
        );
      }

      // Reconcile the junction against the now-persisted fixVersions.
      // Idempotent: makes the current active membership match fixVersions
      // regardless of prior state — so a retry after a partial failure
      // self-heals, unlike a diff against a potentially-stale snapshot.
      try {
        await reconcileReleaseIssues(
          normalized.jiraKey,
          normalized.fixVersions,
          normalized.projectKey,
        );
      } catch (err) {
        result.errors.push(
          `Release junction reconcile failed for ${normalized.jiraKey}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (existing) {
        result.updated++;
      } else {
        result.inserted++;
      }
    } catch (error) {
      result.errors.push(
        `Failed to sync ${raw.key}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    processedCount++;
    updateProgress({
      issuesProcessed: processedCount,
      message: `Processing issues... ${processedCount}/${rawIssues.length}`,
    });
    // Throttled (2s) DB write so cross-process readers see live counts.
    if (state.activeLogId) {
      persistProgress(state.activeLogId, processedCount, rawIssues.length);
    }
  }

  result.total = result.inserted + result.updated + result.skippedNoBoard;
  return result;
}

// --- Public Wrapper ---

export async function runIssueSync(
  type: IssueSyncType,
  boardKey?: string,
  opts?: { triggeredBy?: "cron" | "manual" | null; triggeredByUserId?: string | null },
): Promise<{
  logId: string;
  result: IssueSyncResult;
}> {
  const logId = `sync_${Date.now()}`;
  resetProgress();
  state.activeLogId = logId;
  updateProgress({ phase: "fetching", message: boardKey ? `Syncing ${boardKey}...` : "Starting sync..." });

  const startedAt = new Date();
  const insertTriggeredBy = opts?.triggeredBy ?? null;
  const insertUserId =
    opts?.triggeredBy === "manual" ? (opts?.triggeredByUserId ?? null) : null;
  // Operational log only. Never serialize the user identifier here —
  // `triggeredByUserId` is persisted in `sync_logs` and exposed through
  // the /automations UI, but raw server logs are a wider audience than
  // the admin dashboard and shouldn't broadcast who triggered each run.
  console.log(
    `[runIssueSync] logId=${logId} type=${type} triggeredBy=${insertTriggeredBy ?? "NULL"}`,
  );
  await db.insert(syncLogs).values({
    id: logId,
    type,
    status: "running",
    startedAt,
    issueCount: 0,
    memberCount: 0,
    triggeredBy: insertTriggeredBy,
    triggeredByUserId: insertUserId,
  });
  emitSyncLogChange({
    id: logId,
    type,
    status: "running",
    startedAt: startedAt.toISOString(),
    completedAt: null,
    transition: "started",
  });

  try {
    const result = await syncIssues(type, boardKey);

    updateProgress({
      phase: "done",
      message: `Complete: ${result.inserted} new, ${result.updated} updated`,
    });

    const completedAt = new Date();
    // Finalize the progress columns FIRST, using the actual loop
    // counters (attempted, not succeeded) so a run with per-issue
    // failures still shows the true denominator — e.g. 100/100
    // rather than 97/97 for a run that attempted 100 and failed 3.
    // `flushProgress` awaits any in-flight throttled UPDATEs for the
    // same logId, so the status UPDATE below can't be overwritten by
    // a stale write resolving out of order.
    await flushProgress(
      logId,
      state.currentProgress.issuesProcessed,
      state.currentProgress.issuesTotal,
    );
    await db
      .update(syncLogs)
      .set({
        status: "completed",
        completedAt,
        issueCount: result.total,
        error: result.errors.length > 0 ? result.errors.join("; ") : null,
      })
      .where(eq(syncLogs.id, logId));
    clearProgressThrottle(logId);
    emitSyncLogChange({
      id: logId,
      type,
      status: "completed",
      startedAt: null,
      completedAt: completedAt.toISOString(),
      transition: "finished",
    });

    // Generate notifications after successful sync
    // Post-sync hooks — always sanitize before logging. These handlers touch
    // release/notification code paths that can surface upstream JIRA tokens
    // via SQL driver error messages.
    const logHookFailure = (label: string, err: unknown) => {
      console.error(
        `${label} failed:`,
        sanitizeErrorText(err instanceof Error ? err.message : String(err)),
      );
    };

    try {
      await generateNotificationsFromSync();
    } catch (notifError) {
      logHookFailure("Notification generation", notifError);
    }

    // Record workload snapshots for trend tracking
    try {
      await recordWorkloadSnapshots();
    } catch (snapError) {
      logHookFailure("Workload snapshot recording", snapError);
    }

    // Record release daily snapshots for the burndown chart
    try {
      const { recordReleaseDailySnapshots } = await import("@/lib/releases/snapshots");
      await recordReleaseDailySnapshots();
    } catch (snapError) {
      logHookFailure("Release snapshot recording", snapError);
    }

    // Fire release-scoped notifications (overdue/ready/deployed/scope-changed/stale)
    try {
      const { generateReleaseNotifications } = await import("@/lib/notifications/release-generator");
      await generateReleaseNotifications();
    } catch (relNotifError) {
      logHookFailure("Release notification generation", relNotifError);
    }

    // Drop the cached /api/overview payload so the next page load reflects
    // freshly-synced issues immediately. Without this, users would see
    // up-to-30s stale data after each sync (the unstable_cache time-based
    // fallback). Wrapped in try/catch because cache invalidation is a
    // best-effort optimization — a failure here mustn't fail the sync.
    try {
      const { revalidateTag } = await import("next/cache");
      // "max" profile = stale-while-revalidate: serves stale immediately,
      // recomputes in background. Single-arg revalidateTag(tag) is
      // deprecated in Next.js 16.
      revalidateTag(OVERVIEW_CACHE_TAG, "max");
    } catch (revalErr) {
      logHookFailure("Overview cache invalidation", revalErr);
    }

    return { logId, result };
  } catch (error) {
    updateProgress({
      phase: "failed",
      message: error instanceof Error ? error.message : "Sync failed",
    });

    const completedAt = new Date();
    // Persist the final progress snapshot before the status flip so a
    // reopened drawer shows "got to X/Y before failing" instead of
    // whatever the last throttled write happened to capture (which
    // can lag the real counters by up to 2 s).
    await flushProgress(
      logId,
      state.currentProgress.issuesProcessed,
      state.currentProgress.issuesTotal,
    );
    await db
      .update(syncLogs)
      .set({
        status: "failed",
        completedAt,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(syncLogs.id, logId));
    clearProgressThrottle(logId);
    emitSyncLogChange({
      id: logId,
      type,
      status: "failed",
      startedAt: null,
      completedAt: completedAt.toISOString(),
      transition: "finished",
    });

    throw error;
  }
}

// --- Shared Utilities (used by bulk sync, webhook, and single-issue sync) ---

/**
 * Apply cycle time logic based on status transitions.
 * Handles: reopened (clear), newly done (calculate), unchanged (passthrough).
 */
export function applyCycleTimeLogic(
  normalized: { status: string; startDate: string | null; completedDate: string | null; cycleTime: number | null },
  existing: { status: string; startDate: string | null } | null,
): { completedDate: string | null; cycleTime: number | null } {
  let { completedDate, cycleTime } = normalized;

  if (existing) {
    const wasDone = existing.status === "done" || existing.status === "closed";
    const nowActive = normalized.status !== "done" && normalized.status !== "closed";
    if (wasDone && nowActive) {
      completedDate = null;
      cycleTime = null;
    }

    const wasActive = existing.status !== "done" && existing.status !== "closed";
    const nowDone = normalized.status === "done" || normalized.status === "closed";
    if (wasActive && nowDone && !completedDate) {
      completedDate = new Date().toISOString().split("T")[0];
      cycleTime = calculateCycleTime(
        normalized.startDate || existing.startDate,
        completedDate,
      );
    }
  }

  return { completedDate, cycleTime };
}

/**
 * Build the fields object for issue upsert (insert values + onDuplicateKeyUpdate set).
 * Single source of truth for which fields are persisted.
 */
export function buildIssueUpsertFields(
  normalized: import("@/lib/jira/normalizer").NormalizedIssue,
  boardId: string,
  assigneeId: string | null,
  completedDate: string | null,
  cycleTime: number | null,
  descriptionOverride?: string | null,
) {
  return {
    boardId,
    assigneeId,
    title: normalized.title,
    status: normalized.status,
    jiraStatusName: normalized.jiraStatusName,
    priority: normalized.priority,
    type: normalized.type,
    startDate: normalized.startDate,
    dueDate: normalized.dueDate,
    completedDate,
    cycleTime,
    storyPoints: normalized.storyPoints,
    labels: normalized.labels,
    description: descriptionOverride !== undefined ? descriptionOverride : normalized.description,
    requestPriority: normalized.requestPriority,
    website: normalized.website,
    brands: normalized.brands,
    fixVersions: normalized.fixVersions,
    jiraCreatedAt: normalized.jiraCreatedAt,
    jiraUpdatedAt: normalized.jiraUpdatedAt,
  };
}

// --- Single Issue Sync ---

/**
 * Sync a single issue from JIRA by key.
 * Fetches latest data, normalizes, resolves board/assignee, and upserts.
 * Uses shared utilities (applyCycleTimeLogic, buildIssueUpsertFields).
 */

export async function syncSingleIssue(
  jiraKey: string,
): Promise<{ success: boolean; message: string }> {
  const raw = await fetchSingleIssue(jiraKey);
  if (!raw) {
    return { success: false, message: `Issue ${jiraKey} not found on JIRA` };
  }

  await loadStatusMappingCache();
  const customFields = await discoverCustomFieldIds();
  const normalized = await normalizeIssue(raw, customFields);

  // Resolve board
  const [board] = await db
    .select()
    .from(boards)
    .where(eq(boards.jiraKey, normalized.projectKey))
    .limit(1);

  if (!board) {
    return { success: false, message: `Board ${normalized.projectKey} is not tracked in TeamFlow` };
  }

  // Resolve assignee
  let assigneeId: string | null = null;
  if (normalized.assigneeAccountId) {
    const [member] = await db
      .select()
      .from(team_members)
      .where(eq(team_members.jiraAccountId, normalized.assigneeAccountId))
      .limit(1);
    assigneeId = member?.id || null;
  }

  // Cycle time
  const [existing] = await db
    .select()
    .from(issues)
    .where(eq(issues.jiraKey, normalized.jiraKey))
    .limit(1);

  const { completedDate, cycleTime } = applyCycleTimeLogic(normalized, existing);

  // Upsert
  const id = existing?.id || `iss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const fields = buildIssueUpsertFields(normalized, board.id, assigneeId, completedDate, cycleTime);

  await db
    .insert(issues)
    .values({ id, jiraKey: normalized.jiraKey, ...fields })
    .onDuplicateKeyUpdate({ set: fields });

  // Ensure any new fixVersion rows exist before the junction reconcile.
  try {
    await refreshReleasesForIssue(normalized.fixVersions, normalized.projectKey);
  } catch {
    // Non-fatal — release-sync cron will backfill.
  }

  // Reconcile the junction against the now-persisted fixVersions (idempotent).
  await reconcileReleaseIssues(
    normalized.jiraKey,
    normalized.fixVersions,
    normalized.projectKey,
  );

  // Sync worklogs for this issue (reuses paginated fetcher from worklog-sync)
  let worklogsRecorded = 0;
  try {
    const rawWorklogs = await fetchIssueWorklogs(jiraKey);
    if (rawWorklogs.length > 0) {
      const allMembers = await db
        .select({ id: team_members.id, jiraAccountId: team_members.jiraAccountId })
        .from(team_members);
      const accountIdToMemberId = new Map(allMembers.map((m) => [m.jiraAccountId, m.id]));
      worklogsRecorded = await upsertWorklogs(jiraKey, rawWorklogs, accountIdToMemberId);
    }
  } catch (err) {
    console.warn("Worklog sync failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }

  // Clear the shared compare/branch-commits caches at the start of each
  // per-issue sync — this path processes exactly one issue, so fresh state
  // is the right default.
  clearCompareCache();
  const deploymentSync = await recordDeploymentsForIssue({
    jiraKey: normalized.jiraKey,
    jiraIssueId: raw.id,
  });
  const deploymentsRecorded = deploymentSync.deploymentsRecorded;

  // Stamp after the deployment fetch so the backfill queue skips this
  // issue on its next pass — matches the semantic documented on the
  // `issues.deploymentsSyncedAt` column.
  await db
    .update(issues)
    .set({ deploymentsSyncedAt: new Date() })
    .where(eq(issues.jiraKey, normalized.jiraKey));

  const deploymentMsg = deploymentsRecorded > 0 ? `, ${deploymentsRecorded} deployment(s) recorded` : "";
  const worklogMsg = worklogsRecorded > 0 ? `, ${worklogsRecorded} worklog(s) synced` : "";

  return {
    success: true,
    message: `Synced ${jiraKey} from JIRA (status: ${normalized.jiraStatusName || normalized.status})${deploymentMsg}${worklogMsg}`,
  };
}
