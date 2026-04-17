import { db } from "@/lib/db";
import { worklogs, team_members, syncLogs } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";
import { fetchWithRetry } from "@/lib/jira/issues";
import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

interface JiraWorklog {
  id: string;
  author?: { accountId?: string; displayName?: string };
  timeSpentSeconds?: number;
  started?: string;
  comment?: string | { content?: unknown[] };
  created?: string;
  updated?: string;
}

interface JiraWorklogResponse {
  worklogs?: JiraWorklog[];
  total?: number;
}

export interface WorklogSyncResult {
  issuesScanned: number;
  worklogsUpserted: number;
  errors: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateForJql(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseComment(comment: JiraWorklog["comment"]): string | null {
  if (!comment) return null;
  if (typeof comment === "string") return comment;
  // ADF format — extract plain text from content nodes
  try {
    const extract = (nodes: unknown[]): string => {
      return nodes
        .map((node: any) => {
          if (node.type === "text") return node.text || "";
          if (node.content) return extract(node.content);
          return "";
        })
        .join("");
    };
    return extract(comment.content || []) || null;
  } catch {
    return null;
  }
}

// ─── Fetch worklogs for a single issue ───────────────────────────────────────

async function fetchIssueWorklogs(jiraKey: string): Promise<JiraWorklog[]> {
  const baseUrl = `${getBaseUrl()}/rest/api/3/issue/${encodeURIComponent(jiraKey)}/worklog`;
  const allWorklogs: JiraWorklog[] = [];
  let startAt = 0;

  for (let page = 0; page < 10; page++) {
    const url = `${baseUrl}?startAt=${startAt}&maxResults=1000`;
    const res = await fetchWithRetry(url, {
      headers: { Authorization: getAuthHeader(), Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      // First page failure = total loss — surface error to caller
      if (page === 0) {
        throw new Error(`Worklog fetch failed for ${jiraKey} (${res.status})`);
      }
      // Subsequent page failure — return partial data with warning
      console.warn(`Worklog pagination incomplete for ${jiraKey} at page ${page} (${res.status})`);
      break;
    }
    const data: JiraWorklogResponse = await res.json();
    const worklogs = data.worklogs || [];
    for (const wl of worklogs) allWorklogs.push(wl);

    if (!data.total || allWorklogs.length >= data.total) break;
    startAt = allWorklogs.length;
  }

  return allWorklogs;
}

// ─── Upsert worklogs to DB ──────────────────────────────────────────────────

export async function upsertWorklogs(
  jiraKey: string,
  rawWorklogs: JiraWorklog[],
  accountIdToMemberId: Map<string, string>,
  sinceDate?: Date,
): Promise<number> {
  // Pre-filter and build upsert payloads
  const rows = rawWorklogs
    .map((wl) => {
      const accountId = wl.author?.accountId;
      const seconds = wl.timeSpentSeconds || 0;
      const started = wl.started ? new Date(wl.started) : null;
      if (!accountId || !started || isNaN(started.getTime()) || seconds <= 0) return null;
      if (sinceDate && started < sinceDate) return null;
      const memberId = accountIdToMemberId.get(accountId);
      if (!memberId) return null;

      return {
        id: crypto.randomUUID(),
        jiraWorklogId: String(wl.id),
        jiraKey,
        authorAccountId: accountId,
        memberId,
        authorName: wl.author?.displayName || "Unknown",
        started,
        timeSpentSeconds: seconds,
        comment: parseComment(wl.comment),
        jiraCreatedAt: wl.created ? new Date(wl.created) : null,
        jiraUpdatedAt: wl.updated ? new Date(wl.updated) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Batch upserts in chunks of 50
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map((row) =>
        db
          .insert(worklogs)
          .values(row)
          .onDuplicateKeyUpdate({
            set: {
              timeSpentSeconds: row.timeSpentSeconds,
              authorName: row.authorName,
              comment: row.comment,
              started: row.started,
              jiraUpdatedAt: row.jiraUpdatedAt,
            },
          }),
      ),
    );
  }

  return rows.length;
}

// ─── Core sync: bulk worklog fetch via JQL ───────────────────────────────────

export async function syncWorklogs(sinceDays = 7): Promise<WorklogSyncResult> {
  const result: WorklogSyncResult = { issuesScanned: 0, worklogsUpserted: 0, errors: [] };

  // Load active team members
  const members = await db
    .select({ id: team_members.id, jiraAccountId: team_members.jiraAccountId })
    .from(team_members)
    .where(inArray(team_members.status, ["active", "on_leave"]));

  if (members.length === 0) return result;

  const accountIdToMemberId = new Map(
    members.map((m) => [m.jiraAccountId, m.id]),
  );
  const accountIds = members.map((m) => m.jiraAccountId);

  // Build date range
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);
  sinceDate.setHours(0, 0, 0, 0);

  const sinceDateStr = formatDateForJql(sinceDate);

  // JQL: find issues where team members logged work in the date range
  const authorList = accountIds.map((id) => `"${id}"`).join(", ");
  const jql = `worklogDate >= "${sinceDateStr}" AND worklogAuthor in (${authorList})`;

  // Search for matching issues
  const baseUrl = getBaseUrl();
  const searchUrl = `${baseUrl}/rest/api/3/search/jql`;

  let issueKeys: string[] = [];

  try {
    let nextPageToken: string | undefined;
    const seen = new Set<string>();

    for (let page = 0; page < 50; page++) {
      const body: Record<string, unknown> = {
        jql,
        fields: ["key"],
        maxResults: 100,
      };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const res = await fetchWithRetry(searchUrl, {
        method: "POST",
        headers: {
          Authorization: getAuthHeader(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        result.errors.push(`JQL search failed: ${sanitizeErrorText(text)}`);
        break;
      }

      const data = await res.json();
      for (const issue of data.issues || []) {
        if (issue.key && !seen.has(issue.key)) {
          seen.add(issue.key);
          issueKeys.push(issue.key);
        }
      }

      if (data.isLast || !data.nextPageToken) break;
      nextPageToken = data.nextPageToken;
    }
  } catch (err) {
    result.errors.push(`JQL search error: ${sanitizeErrorText(err instanceof Error ? err.message : String(err))}`);
    return result;
  }

  result.issuesScanned = issueKeys.length;

  // Fetch worklogs per issue in batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < issueKeys.length; i += BATCH_SIZE) {
    const batch = issueKeys.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (key) => {
        try {
          const rawWorklogs = await fetchIssueWorklogs(key);
          return await upsertWorklogs(key, rawWorklogs, accountIdToMemberId, sinceDate);
        } catch (err) {
          result.errors.push(`${key}: ${sanitizeErrorText(err instanceof Error ? err.message : String(err))}`);
          return 0;
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        result.worklogsUpserted += r.value;
      }
    }
  }

  return result;
}

// ─── Entry point with logging ────────────────────────────────────────────────

export async function runWorklogSync(sinceDays = 7): Promise<{ logId: string; result: WorklogSyncResult }> {
  const logId = crypto.randomUUID();

  await db.insert(syncLogs).values({
    id: logId,
    type: "worklog_sync",
    status: "running",
  });

  try {
    const result = await syncWorklogs(sinceDays);

    await db
      .update(syncLogs)
      .set({
        status: "completed",
        completedAt: new Date(),
        issueCount: result.issuesScanned,
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
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(syncLogs.id, logId));

    throw err;
  }
}
