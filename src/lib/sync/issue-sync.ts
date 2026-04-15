import { db } from "@/lib/db";
import { issues, boards, team_members, syncLogs, githubRepos, githubBranchMappings } from "@/lib/db/schema";
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
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";
import { recordDeployment } from "@/lib/github/deployments";
import { extractJiraKeys } from "@/lib/github/jira-keys";

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

// --- GitHub Compare Cache (per-sync, avoids duplicate API calls) ---

const ghCompareCache = new Map<string, { status: string }>();

async function cachedCompare(
  repoFullName: string,
  base: string,
  head: string,
): Promise<{ status: string } | null> {
  const key = `${repoFullName}:${base}...${head}`;
  if (ghCompareCache.has(key)) return ghCompareCache.get(key)!;

  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/compare/${base}...${head}`,
    { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" }, cache: "no-store" },
  );
  if (!res.ok) return null;

  const data = await res.json();
  const result = { status: data.status };
  ghCompareCache.set(key, result);
  return result;
}

// --- Deploy Date Lookup Helper ---

/**
 * Find the actual date a commit arrived on a branch by walking merge commits.
 * Returns the merge commit date if found, otherwise the fallback date.
 * Checks at most 20 recent commits to limit API calls.
 */
async function findBranchDeployDate(
  repoFullName: string,
  branchPattern: string,
  commitSha: string,
  fallbackDate: Date,
): Promise<Date> {
  try {
    const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" };
    const commitsRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/commits?sha=${branchPattern}&per_page=20`,
      { headers, cache: "no-store" },
    );
    if (!commitsRes.ok) return fallbackDate;

    const branchCommits = await commitsRes.json();
    for (let ci = branchCommits.length - 1; ci >= 0; ci--) {
      const bc = branchCommits[ci];
      if (bc.parents?.length < 2) continue; // not a merge commit
      const data = await cachedCompare(repoFullName, commitSha, bc.sha);
      if (data && (data.status === "ahead" || data.status === "identical")) {
        return new Date(bc.commit?.committer?.date || fallbackDate);
      }
    }
  } catch (e) {
    console.warn("Deploy date lookup error:", sanitizeErrorText(e instanceof Error ? e.message : String(e)));
  }
  return fallbackDate;
}

// --- Commit Propagation Helper ---

/**
 * Check if a commit has propagated to other deployment branches and record
 * deployments with real deploy dates for each. Returns the count of new
 * deployments recorded.
 */
async function propagateDeploymentToOtherBranches(params: {
  jiraKey: string;
  repoId: string;
  repoFullName: string;
  commitSha: string;
  sourceBranch: string;
  prNumber: number | null;
  prTitle: string | null;
  prUrl: string | null;
  deployedBy: string | null;
  baseDeployedAt: Date;
  branchMappings?: typeof githubBranchMappings.$inferSelect[];
}): Promise<number> {
  // Skip synthetic placeholder SHAs (e.g., "pr-6483") — not real commits
  if (params.commitSha.startsWith("pr-")) return 0;

  let recorded = 0;
  const mappings = params.branchMappings
    || await db.select().from(githubBranchMappings).where(eq(githubBranchMappings.repoId, params.repoId));
  const otherBranches = mappings.filter((m) => m.branchPattern !== params.sourceBranch && !m.isAllSites);

  for (const mapping of otherBranches) {
    try {
      const cmp = await cachedCompare(params.repoFullName, mapping.branchPattern, params.commitSha);
      if (!cmp || (cmp.status !== "behind" && cmp.status !== "identical")) continue;

      const branchDeployedAt = await findBranchDeployDate(
        params.repoFullName, mapping.branchPattern, params.commitSha, params.baseDeployedAt,
      );

      const result = await recordDeployment({
        jiraKey: params.jiraKey,
        repoId: params.repoId,
        branch: mapping.branchPattern,
        prNumber: params.prNumber,
        prTitle: params.prTitle,
        prUrl: params.prUrl,
        commitSha: params.commitSha,
        deployedBy: params.deployedBy,
        deployedAt: branchDeployedAt,
      });
      recorded += result.recorded;
    } catch (e) {
      console.warn("Deployment propagation error:", sanitizeErrorText(e instanceof Error ? e.message : String(e)));
    }
  }
  return recorded;
}

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
  ghCompareCache.clear();
  try {
    const issueId = encodeURIComponent(raw.id);
    const devStatusUrl = `${getBaseUrl()}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=pullrequest`;
    const devRes = await fetch(devStatusUrl, {
      headers: { Authorization: getAuthHeader(), Accept: "application/json" },
      cache: "no-store",
    });

    if (devRes.ok) {
      const devData = await devRes.json();
      const mergedPRs: Array<{ detail: any; pr: any }> = [];

      for (const detail of devData.detail || []) {
        for (const pr of detail.pullRequests || []) {
          if (pr.status === "MERGED") mergedPRs.push({ detail, pr });
        }
      }

      if (mergedPRs.length > 0) {
        const allRepos = await db.select().from(githubRepos);
        const repoMap = new Map(allRepos.map((r) => [r.fullName, r.id]));
        // Pre-load all branch mappings per repo (avoid repeated queries inside loop)
        const mappingsByRepo = new Map<string, typeof githubBranchMappings.$inferSelect[]>();
        for (const repo of allRepos) {
          const mappings = await db.select().from(githubBranchMappings).where(eq(githubBranchMappings.repoId, repo.id));
          mappingsByRepo.set(repo.id, mappings);
        }
        for (const { detail, pr } of mergedPRs) {
          const destBranch = pr.destination?.branch;
          // Extract repo full name from PR URL (e.g., https://github.com/owner/repo/pull/123)
          let repoFullName = "";
          if (pr.url) {
            const match = pr.url.match(/github\.com\/([^/]+\/[^/]+)\//);
            if (match) repoFullName = match[1];
          }
          if (!repoFullName) {
            repoFullName = pr.source?.repository?.name || detail.repositories?.[0]?.name || "";
          }
          if (!destBranch || !repoFullName) continue;

          const repoId = repoMap.get(repoFullName);
          if (!repoId) continue;

          // Get merge commit SHA — try JIRA first, then fetch from GitHub API
          let commitSha = pr.lastCommit?.id || "";
          let deployedAt = new Date(pr.mergedAt || pr.lastUpdate || Date.now());
          const prNum = parseInt(pr.id?.replace("#", "") || "0", 10);

          if (!commitSha && prNum && process.env.GITHUB_TOKEN) {
            try {
              const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNum}`, {
                headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
                cache: "no-store",
              });
              if (ghRes.ok) {
                const ghPr = await ghRes.json();
                commitSha = ghPr.merge_commit_sha || "";
                if (ghPr.merged_at) deployedAt = new Date(ghPr.merged_at);
              }
            } catch (e) { console.warn("Deployment propagation error:", sanitizeErrorText(e instanceof Error ? e.message : String(e))); }
          }
          if (!commitSha) commitSha = `pr-${prNum}`;

          const result = await recordDeployment({
            jiraKey: normalized.jiraKey,
            repoId,
            branch: destBranch,
            prNumber: parseInt(pr.id?.replace("#", "") || "0", 10) || null,
            prTitle: pr.name || null,
            prUrl: pr.url || null,
            commitSha,
            deployedBy: pr.author?.name || null,
            deployedAt,
          });
          deploymentsRecorded += result.recorded;

          // Check if this commit has propagated to other deployment branches
          if (commitSha) {
            deploymentsRecorded += await propagateDeploymentToOtherBranches({
              jiraKey: normalized.jiraKey, repoId, repoFullName, commitSha,
              sourceBranch: destBranch, prNumber: prNum || null, prTitle: pr.name || null,
              prUrl: pr.url || null, deployedBy: pr.author?.name || null,
              baseDeployedAt: deployedAt, branchMappings: mappingsByRepo.get(repoId),
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("JIRA deployment sync failed (non-fatal):", sanitizeErrorText(err instanceof Error ? err.message : String(err)));
  }

  // GitHub fallback: if JIRA found no deployments, search GitHub directly for PRs matching the JIRA key
  if (deploymentsRecorded === 0 && process.env.GITHUB_TOKEN) {
    try {
      const allRepos = await db.select().from(githubRepos);
      for (const repo of allRepos) {
        // Search for merged PRs with the JIRA key in title or branch name
        const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(jiraKey)}+repo:${repo.fullName}+is:pr+is:merged&per_page=10`;
        const searchRes = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
          cache: "no-store",
        });

        if (!searchRes.ok) continue;
        const searchData = await searchRes.json();

        for (const item of searchData.items || []) {
          // Fetch full PR data to get merge details
          const prRes = await fetch(`https://api.github.com/repos/${repo.fullName}/pulls/${item.number}`, {
            headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
            cache: "no-store",
          });
          if (!prRes.ok) continue;
          const ghPr = await prRes.json();

          if (!ghPr.merged || !ghPr.base?.ref) continue;

          // Validate the JIRA key actually appears in this PR (GitHub search is full-text, returns false positives)
          const prKeys = extractJiraKeys([ghPr.title, ghPr.head?.ref, ghPr.body]);
          if (!prKeys.includes(jiraKey)) continue;

          const commitSha = ghPr.merge_commit_sha || "";
          const deployedAt = new Date(ghPr.merged_at || Date.now());
          const destBranch = ghPr.base.ref;
          const repoId = repo.id;

          const result = await recordDeployment({
            jiraKey,
            repoId,
            branch: destBranch,
            prNumber: ghPr.number,
            prTitle: ghPr.title || null,
            prUrl: ghPr.html_url || null,
            commitSha,
            deployedBy: ghPr.user?.login || null,
            deployedAt,
          });
          deploymentsRecorded += result.recorded;

          // Check commit propagation to other branches
          if (commitSha) {
            deploymentsRecorded += await propagateDeploymentToOtherBranches({
              jiraKey, repoId, repoFullName: repo.fullName, commitSha,
              sourceBranch: destBranch, prNumber: ghPr.number, prTitle: ghPr.title || null,
              prUrl: ghPr.html_url || null, deployedBy: ghPr.user?.login || null,
              baseDeployedAt: deployedAt,
            });
          }
        }
      }
    } catch (err) {
      console.warn("GitHub deployment fallback failed (non-fatal):", sanitizeErrorText(err instanceof Error ? err.message : String(err)));
    }
  }

  // JIRA comments fallback: scan comments for GitHub PR URLs when no deployments found
  if (deploymentsRecorded === 0 && process.env.GITHUB_TOKEN) {
    try {
      const commentsUrl = `${getBaseUrl()}/rest/api/3/issue/${jiraKey}/comment?maxResults=20`;
      const commentsRes = await fetch(commentsUrl, {
        headers: { Authorization: getAuthHeader(), Accept: "application/json" },
        cache: "no-store",
      });

      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        const allRepos = await db.select().from(githubRepos);
        const repoMap = new Map(allRepos.map((r) => [r.fullName, r.id]));

        // Extract GitHub PR URLs from comment bodies (ADF JSON)
        const prUrlRegex = /https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/g;
        const seenPrUrls = new Set<string>();

        for (const comment of commentsData.comments || []) {
          const bodyStr = JSON.stringify(comment.body || "");
          prUrlRegex.lastIndex = 0;
          let match;
          while ((match = prUrlRegex.exec(bodyStr)) !== null) {
            const repoFullName = match[1];
            const prNumber = parseInt(match[2], 10);
            const prUrl = match[0];
            if (seenPrUrls.has(prUrl)) continue;
            seenPrUrls.add(prUrl);

            const repoId = repoMap.get(repoFullName);
            if (!repoId) continue;

            // Fetch PR details from GitHub
            try {
              const prRes = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`, {
                headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
                cache: "no-store",
              });
              if (!prRes.ok) continue;
              const ghPr = await prRes.json();
              if (!ghPr.merged || !ghPr.base?.ref) continue;

              const commitSha = ghPr.merge_commit_sha || "";
              const deployedAt = new Date(ghPr.merged_at || Date.now());

              const result = await recordDeployment({
                jiraKey,
                repoId,
                branch: ghPr.base.ref,
                prNumber,
                prTitle: ghPr.title || null,
                prUrl,
                commitSha,
                deployedBy: ghPr.user?.login || null,
                deployedAt,
              });
              deploymentsRecorded += result.recorded;

              // Check commit propagation
              if (commitSha) {
                deploymentsRecorded += await propagateDeploymentToOtherBranches({
                  jiraKey, repoId, repoFullName, commitSha,
                  sourceBranch: ghPr.base.ref, prNumber, prTitle: ghPr.title || null,
                  prUrl, deployedBy: ghPr.user?.login || null, baseDeployedAt: deployedAt,
                });
              }
            } catch (e) { console.warn("PR fetch from comment failed:", sanitizeErrorText(e instanceof Error ? e.message : String(e))); }
          }
        }
      }
    } catch (err) {
      console.warn("JIRA comments fallback failed (non-fatal):", sanitizeErrorText(err instanceof Error ? err.message : String(err)));
    }
  }

  const deploymentMsg = deploymentsRecorded > 0 ? `, ${deploymentsRecorded} deployment(s) recorded` : "";

  return {
    success: true,
    message: `Synced ${jiraKey} from JIRA (status: ${normalized.jiraStatusName || normalized.status})${deploymentMsg}`,
  };
}
