import { db } from "@/lib/db";
import { issues, boards, team_members, syncLogs } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { generateNotificationsFromSync } from "@/lib/notifications/generator";
import { recordWorkloadSnapshots } from "@/lib/workload/snapshots";
import {
  discoverCustomFieldIds,
  fetchIssuesByJql,
  buildFullSyncJql,
  buildIncrementalSyncJql,
} from "@/lib/jira/issues";
import { normalizeIssue, calculateCycleTime } from "@/lib/jira/normalizer";

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

  // 3. Discover custom field IDs
  updateProgress({ message: "Discovering JIRA custom fields..." });
  const customFields = await discoverCustomFieldIds();

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
      const normalized = normalizeIssue(raw, customFields);

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

      // Check existing for cycle time logic
      const existing = existingByKey.get(normalized.jiraKey);
      let { completedDate, cycleTime } = normalized;

      if (existing) {
        // Issue reopened: was done/closed, now active
        const wasDone =
          existing.status === "done" || existing.status === "closed";
        const nowActive =
          normalized.status !== "done" && normalized.status !== "closed";

        if (wasDone && nowActive) {
          completedDate = null;
          cycleTime = null;
        }

        // Newly done: wasn't done, now is
        const wasActive =
          existing.status !== "done" && existing.status !== "closed";
        const nowDone =
          normalized.status === "done" || normalized.status === "closed";

        if (wasActive && nowDone && !completedDate) {
          completedDate = new Date().toISOString().split("T")[0];
          cycleTime = calculateCycleTime(
            normalized.startDate || existing.startDate,
            completedDate,
          );
        }
      }

      const id = existing?.id || `iss_${Date.now()}_${result.inserted + result.updated}`;

      await db
        .insert(issues)
        .values({
          id,
          jiraKey: normalized.jiraKey,
          boardId: board.id,
          assigneeId: member?.id || null,
          title: normalized.title,
          status: normalized.status,
          priority: normalized.priority,
          type: normalized.type,
          startDate: normalized.startDate,
          dueDate: normalized.dueDate,
          completedDate,
          cycleTime,
          storyPoints: normalized.storyPoints,
          labels: normalized.labels,
          requestPriority: normalized.requestPriority,
          jiraCreatedAt: normalized.jiraCreatedAt,
          jiraUpdatedAt: normalized.jiraUpdatedAt,
        })
        .onDuplicateKeyUpdate({
          set: {
            boardId: board.id,
            assigneeId: member?.id || null,
            title: normalized.title,
            status: normalized.status,
            priority: normalized.priority,
            type: normalized.type,
            startDate: normalized.startDate,
            dueDate: normalized.dueDate,
            completedDate,
            cycleTime,
            storyPoints: normalized.storyPoints,
            labels: normalized.labels,
            requestPriority: normalized.requestPriority,
            jiraCreatedAt: normalized.jiraCreatedAt,
            jiraUpdatedAt: normalized.jiraUpdatedAt,
          },
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
