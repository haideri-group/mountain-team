/**
 * Syncs JIRA project versions (releases) to the jira_releases table.
 *
 * Fetches versions from the JIRA REST API for each tracked board's project key,
 * upserts them to the database, and logs the sync run. Includes issue status
 * counts (done, in-progress, to-do) per version when available.
 */

import { db } from "@/lib/db";
import { jiraReleases, boards, syncLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";
import { fetchWithRetry } from "@/lib/jira/issues";
import crypto from "crypto";
import { emitSyncLogChange } from "./events";

// ─── Types ───────────────────────────────────────────────────────────────────

interface JiraVersion {
  id: string;
  name: string;
  description?: string;
  startDate?: string;
  releaseDate?: string;
  released: boolean;
  archived: boolean;
  overdue?: boolean;
  projectId: number;
  issuesStatusForFixVersion?: {
    done?: number;
    inProgress?: number;
    toDo?: number;
    unmapped?: number;
  };
}

interface VersionPageResponse {
  values: JiraVersion[];
  isLast: boolean;
  total: number;
  startAt: number;
  maxResults: number;
}

export interface ReleaseSyncResult {
  versionsUpserted: number;
  projectsScanned: number;
  errors: string[];
}

// ─── Fetch versions for a project ────────────────────────────────────────────

async function fetchProjectVersions(projectKey: string): Promise<JiraVersion[]> {
  const baseUrl = getBaseUrl();
  const allVersions: JiraVersion[] = [];
  let startAt = 0;

  for (let page = 0; page < 20; page++) {
    const url = `${baseUrl}/rest/api/3/project/${encodeURIComponent(projectKey)}/version?startAt=${startAt}&maxResults=50&orderBy=-releaseDate&expand=issuesstatus`;

    const res = await fetchWithRetry(url, {
      headers: { Authorization: getAuthHeader(), Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      if (page === 0) {
        throw new Error(`Failed to fetch versions for ${projectKey} (${res.status})`);
      }
      break;
    }

    const data: VersionPageResponse = await res.json();
    for (const v of data.values) allVersions.push(v);

    if (data.isLast || allVersions.length >= data.total) break;
    startAt = allVersions.length;
  }

  return allVersions;
}

// ─── Core sync ───────────────────────────────────────────────────────────────

export async function syncReleases(): Promise<ReleaseSyncResult> {
  const result: ReleaseSyncResult = { versionsUpserted: 0, projectsScanned: 0, errors: [] };

  // Get unique project keys from tracked boards
  const trackedBoards = await db
    .select({ jiraKey: boards.jiraKey })
    .from(boards)
    .where(eq(boards.isTracked, true));

  const projectKeys = [...new Set(trackedBoards.map((b) => b.jiraKey))];

  for (const projectKey of projectKeys) {
    result.projectsScanned++;

    try {
      const versions = await fetchProjectVersions(projectKey);

      // Filter: skip archived, only keep recent (last 50 or unreleased)
      const relevant = versions.filter((v) => !v.archived).slice(0, 50);

      for (const v of relevant) {
        const issueStatus = v.issuesStatusForFixVersion || {};
        const done = issueStatus.done || 0;
        const inProgress = issueStatus.inProgress || 0;
        const toDo = issueStatus.toDo || 0;
        const total = done + inProgress + toDo + (issueStatus.unmapped || 0);

        const now = new Date();
        await db
          .insert(jiraReleases)
          .values({
            id: crypto.randomUUID(),
            jiraVersionId: String(v.id),
            projectKey,
            name: v.name,
            description: v.description || null,
            startDate: v.startDate || null,
            releaseDate: v.releaseDate || null,
            released: v.released,
            archived: v.archived,
            overdue: v.overdue || false,
            issuesDone: done,
            issuesInProgress: inProgress,
            issuesToDo: toDo,
            issuesTotal: total,
            lastSyncedAt: now,
          })
          .onDuplicateKeyUpdate({
            set: {
              name: v.name,
              description: v.description || null,
              startDate: v.startDate || null,
              releaseDate: v.releaseDate || null,
              released: v.released,
              archived: v.archived,
              overdue: v.overdue || false,
              issuesDone: done,
              issuesInProgress: inProgress,
              issuesToDo: toDo,
              issuesTotal: total,
              lastSyncedAt: now,
            },
          });

        result.versionsUpserted++;
      }
    } catch (err) {
      result.errors.push(`${projectKey}: ${sanitizeErrorText(err instanceof Error ? err.message : String(err))}`);
    }
  }

  return result;
}

// ─── Entry point with logging ────────────────────────────────────────────────

export async function runReleaseSync(
  opts?: { triggeredBy?: "cron" | "manual" | null; triggeredByUserId?: string | null },
): Promise<{ logId: string; result: ReleaseSyncResult }> {
  const logId = crypto.randomUUID();
  const startedAt = new Date();

  await db.insert(syncLogs).values({
    id: logId,
    type: "release_sync",
    status: "running",
    startedAt,
    triggeredBy: opts?.triggeredBy ?? null,
    triggeredByUserId:
      opts?.triggeredBy === "manual" ? (opts?.triggeredByUserId ?? null) : null,
  });
  emitSyncLogChange({
    id: logId,
    type: "release_sync",
    status: "running",
    startedAt: startedAt.toISOString(),
    completedAt: null,
    transition: "started",
  });

  try {
    const result = await syncReleases();

    const completedAt = new Date();
    await db
      .update(syncLogs)
      .set({
        status: "completed",
        completedAt,
        issueCount: result.versionsUpserted,
        error: result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null,
      })
      .where(eq(syncLogs.id, logId));
    emitSyncLogChange({
      id: logId,
      type: "release_sync",
      status: "completed",
      startedAt: null,
      completedAt: completedAt.toISOString(),
      transition: "finished",
    });

    return { logId, result };
  } catch (err) {
    const completedAt = new Date();
    await db
      .update(syncLogs)
      .set({
        status: "failed",
        completedAt,
        error: sanitizeErrorText(err instanceof Error ? err.message : String(err)),
      })
      .where(eq(syncLogs.id, logId));
    emitSyncLogChange({
      id: logId,
      type: "release_sync",
      status: "failed",
      startedAt: null,
      completedAt: completedAt.toISOString(),
      transition: "finished",
    });

    throw err;
  }
}

// ─── Auto-discover unknown releases from issue fixVersions ───────────────────

/**
 * Called after an issue is synced (e.g., via webhook). Fetches the project's
 * versions from JIRA and upserts any that match the issue's fixVersions.
 *
 * This ensures:
 * - New releases are auto-discovered when a task is first assigned to them
 * - Existing release data (released status, dates, issue counts) is refreshed
 *   when any task in that release changes status (e.g., moved to Done)
 * - Release marked as "Released" by product owner is picked up automatically
 */
export async function refreshReleasesForIssue(
  fixVersionsJson: string | null,
  projectKey: string,
): Promise<void> {
  if (!fixVersionsJson) return;

  let versionNames: string[];
  try {
    versionNames = JSON.parse(fixVersionsJson);
  } catch {
    return;
  }

  if (!Array.isArray(versionNames) || versionNames.length === 0) return;

  try {
    const versions = await fetchProjectVersions(projectKey);
    const targetNames = new Set(versionNames);

    for (const v of versions) {
      // Upsert all versions matching the issue's fixVersions
      if (!targetNames.has(v.name)) continue;
      if (v.archived) continue;

      const issueStatus = v.issuesStatusForFixVersion || {};
      const done = issueStatus.done || 0;
      const inProgress = issueStatus.inProgress || 0;
      const toDo = issueStatus.toDo || 0;
      const total = done + inProgress + toDo + (issueStatus.unmapped || 0);

      const now = new Date();
      await db
        .insert(jiraReleases)
        .values({
          id: crypto.randomUUID(),
          jiraVersionId: String(v.id),
          projectKey,
          name: v.name,
          description: v.description || null,
          startDate: v.startDate || null,
          releaseDate: v.releaseDate || null,
          released: v.released,
          archived: v.archived,
          overdue: v.overdue || false,
          issuesDone: done,
          issuesInProgress: inProgress,
          issuesToDo: toDo,
          issuesTotal: total,
          lastSyncedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            name: v.name,
            description: v.description || null,
            releaseDate: v.releaseDate || null,
            released: v.released,
            overdue: v.overdue || false,
            issuesDone: done,
            issuesInProgress: inProgress,
            issuesToDo: toDo,
            issuesTotal: total,
            lastSyncedAt: now,
          },
        });
    }
  } catch {
    // Non-fatal — release will be refreshed on next sync
  }
}
