import { db } from "@/lib/db";
import { issues, boards, team_members, syncLogs, githubRepos } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { generateNotificationsFromSync } from "@/lib/notifications/generator";
import { recordWorkloadSnapshots } from "@/lib/workload/snapshots";
import {
  discoverCustomFieldIds,
  fetchIssuesByJql,
  fetchSingleIssue,
  buildFullSyncJql,
  buildIncrementalSyncJql,
} from "@/lib/jira/issues";
import { normalizeIssue, calculateCycleTime, loadStatusMappingCache, invalidateStatusMappingCache } from "@/lib/jira/normalizer";

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

let currentProgress: SyncProgress = {
  phase: "idle",
  message: "",
  issuesFetched: 0,
  issuesProcessed: 0,
  issuesTotal: 0,
};

export function getSyncProgress(): SyncProgress {
  return { ...currentProgress };
}

function resetProgress() {
  currentProgress = {
    phase: "idle",
    message: "",
    issuesFetched: 0,
    issuesProcessed: 0,
    issuesTotal: 0,
  };
}

function updateProgress(update: Partial<SyncProgress>) {
  currentProgress = { ...currentProgress, ...update };
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
      jql = buildIncrementalSyncJql(boardKeys, memberAccountIds, since, frontendLabel);
    } else {
      // No previous sync -- fall back to full
      jql = buildFullSyncJql(boardKeys, memberAccountIds, frontendLabel);
    }
  } else {
    jql = buildFullSyncJql(boardKeys, memberAccountIds, frontendLabel);
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
  }

  result.total = result.inserted + result.updated + result.skippedNoBoard;
  return result;
}

// --- Public Wrapper ---

export async function runIssueSync(type: IssueSyncType, boardKey?: string): Promise<{
  logId: string;
  result: IssueSyncResult;
}> {
  const logId = `sync_${Date.now()}`;
  resetProgress();
  updateProgress({ phase: "fetching", message: boardKey ? `Syncing ${boardKey}...` : "Starting sync..." });

  await db.insert(syncLogs).values({
    id: logId,
    type,
    status: "running",
    issueCount: 0,
    memberCount: 0,
  });

  try {
    const result = await syncIssues(type, boardKey);

    updateProgress({
      phase: "done",
      message: `Complete: ${result.inserted} new, ${result.updated} updated`,
    });

    await db
      .update(syncLogs)
      .set({
        status: "completed",
        completedAt: new Date(),
        issueCount: result.total,
        error: result.errors.length > 0 ? result.errors.join("; ") : null,
      })
      .where(eq(syncLogs.id, logId));

    // Generate notifications after successful sync
    try {
      await generateNotificationsFromSync();
    } catch (notifError) {
      console.error("Notification generation failed:", notifError);
    }

    // Record workload snapshots for trend tracking
    try {
      await recordWorkloadSnapshots();
    } catch (snapError) {
      console.error("Workload snapshot recording failed:", snapError);
    }

    return { logId, result };
  } catch (error) {
    updateProgress({
      phase: "failed",
      message: error instanceof Error ? error.message : "Sync failed",
    });

    await db
      .update(syncLogs)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(syncLogs.id, logId));

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

  // Sync deployments from JIRA dev-status (merged PRs → deployment branches)
  let deploymentsRecorded = 0;
  try {
    const { getAuthHeader, getBaseUrl } = await import("@/lib/jira/client");
    const { recordDeployment } = await import("@/lib/github/deployments");

    const devStatusUrl = `${getBaseUrl()}/rest/dev-status/latest/issue/detail?issueId=${raw.id}&applicationType=GitHub&dataType=pullrequest`;
    const devRes = await fetch(devStatusUrl, {
      headers: { Authorization: getAuthHeader(), Accept: "application/json" },
      cache: "no-store",
    });

    if (devRes.ok) {
      const devData = await devRes.json();
      const allRepos = await db.select().from(githubRepos);
      const repoMap = new Map(allRepos.map((r) => [r.fullName, r.id]));

      for (const detail of devData.detail || []) {
        for (const pr of detail.pullRequests || []) {
          if (pr.status !== "MERGED") continue;
          const destBranch = pr.destination?.branch;
          const repoFullName = detail._instance?.name === "GitHub"
            ? (pr.source?.repository?.name || detail.repositories?.[0]?.name || "")
            : "";
          if (!destBranch || !repoFullName) continue;

          const repoId = repoMap.get(repoFullName);
          if (!repoId) continue;

          const result = await recordDeployment({
            jiraKey: normalized.jiraKey,
            repoId,
            branch: destBranch,
            prNumber: parseInt(pr.id) || null,
            prTitle: pr.name || null,
            prUrl: pr.url || null,
            commitSha: pr.lastCommit?.id || null,
            deployedBy: pr.author?.name || null,
            deployedAt: new Date(pr.lastUpdate || Date.now()),
          });
          deploymentsRecorded += result.recorded;
        }
      }
    }
  } catch {
    // Non-fatal — deployment sync is best-effort
  }

  const deploymentMsg = deploymentsRecorded > 0 ? `, ${deploymentsRecorded} deployment(s) recorded` : "";

  return {
    success: true,
    message: `Synced ${jiraKey} from JIRA (status: ${normalized.jiraStatusName || normalized.status})${deploymentMsg}`,
  };
}
