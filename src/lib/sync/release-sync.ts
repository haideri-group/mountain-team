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

export async function runReleaseSync(): Promise<{ logId: string; result: ReleaseSyncResult }> {
  const logId = crypto.randomUUID();

  await db.insert(syncLogs).values({
    id: logId,
    type: "release_sync",
    status: "running",
  });

  try {
    const result = await syncReleases();

    await db
      .update(syncLogs)
      .set({
        status: "completed",
        completedAt: new Date(),
        issueCount: result.versionsUpserted,
        error: result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null,
      })
      .where(eq(syncLogs.id, logId));

    return { logId, result };
  } catch (err) {
    await db
      .update(syncLogs)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: sanitizeErrorText(err instanceof Error ? err.message : String(err)),
      })
      .where(eq(syncLogs.id, logId));

    throw err;
  }
}
