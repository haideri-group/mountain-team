import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "./client";

// --- Types ---

export interface JiraIssueRaw {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: string } };
    priority?: { name: string } | null;
    issuetype?: { name: string } | null;
    assignee?: { accountId: string; displayName: string } | null;
    project: { key: string };
    labels: string[];
    duedate?: string | null;
    created: string;
    updated: string;
    resolutiondate?: string | null;
    [key: string]: unknown;
  };
}

interface JiraSearchResponse {
  issues: JiraIssueRaw[];
  nextPageToken?: string | null;
  total: number;
  isLast?: boolean;
}

interface JiraFieldMeta {
  id: string;
  name: string;
  custom: boolean;
  clauseNames: string[];
}

export interface CustomFieldIds {
  storyPoints: string | null;
  startDate: string | null;
}

// --- Cached custom field IDs ---

let cachedFieldIds: CustomFieldIds | null = null;
let cachedAt = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// --- Retry-aware fetch ---

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let delay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
      const jitter = 0.7 + Math.random() * 0.6;
      await new Promise((r) => setTimeout(r, waitMs * jitter));
      delay = Math.min(delay * 2, 60000);
      continue;
    }

    if (res.status >= 500 && attempt < maxRetries) {
      const jitter = 0.7 + Math.random() * 0.6;
      await new Promise((r) => setTimeout(r, delay * jitter));
      delay = Math.min(delay * 2, 30000);
      continue;
    }

    return res;
  }

  throw new Error("Max retries exceeded for JIRA API");
}

// --- JIRA Search ---

async function jiraSearchPost(
  body: Record<string, unknown>,
): Promise<JiraSearchResponse> {
  const url = `${getBaseUrl()}/rest/api/3/search/jql`;

  const res = await fetchWithRetry(url, {
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
    throw new Error(`JIRA search error ${res.status}: ${sanitizeErrorText(text)}`);
  }

  return res.json();
}

// --- Custom Field Discovery ---

export async function discoverCustomFieldIds(): Promise<CustomFieldIds> {
  // Return cached if fresh
  if (cachedFieldIds && Date.now() - cachedAt < CACHE_TTL) {
    return cachedFieldIds;
  }

  try {
    const url = `${getBaseUrl()}/rest/api/3/field`;
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`Field discovery failed: ${res.status}`);

    const fields: JiraFieldMeta[] = await res.json();

    let storyPoints: string | null = null;
    let startDate: string | null = null;

    for (const field of fields) {
      const nameLower = field.name.toLowerCase();

      if (
        !storyPoints &&
        (nameLower === "story points" ||
          nameLower === "story point estimate" ||
          field.clauseNames.some((c) => c.toLowerCase() === "story points"))
      ) {
        storyPoints = field.id;
      }

      if (
        !startDate &&
        (nameLower === "start date" ||
          field.clauseNames.some((c) => c.toLowerCase() === "start date"))
      ) {
        startDate = field.id;
      }

      if (storyPoints && startDate) break;
    }

    cachedFieldIds = {
      storyPoints: storyPoints || "customfield_10016",
      startDate: startDate || "customfield_10015",
    };
    cachedAt = Date.now();

    return cachedFieldIds;
  } catch {
    // Fallback to known defaults
    cachedFieldIds = {
      storyPoints: "customfield_10016",
      startDate: "customfield_10015",
    };
    cachedAt = Date.now();
    return cachedFieldIds;
  }
}

// --- Paginated Issue Fetcher ---

export async function fetchIssuesByJql(
  jql: string,
  customFields: CustomFieldIds,
): Promise<JiraIssueRaw[]> {
  const fields = [
    "summary",
    "status",
    "priority",
    "issuetype",
    "assignee",
    "project",
    "labels",
    "duedate",
    "created",
    "updated",
    "resolutiondate",
  ];

  if (customFields.storyPoints) fields.push(customFields.storyPoints);
  if (customFields.startDate) fields.push(customFields.startDate);

  const allIssues: JiraIssueRaw[] = [];
  const seenKeys = new Set<string>();
  let nextPageToken: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 50;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields,
      maxResults: 50,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const data = await jiraSearchPost(body);

    for (const issue of data.issues) {
      if (!seenKeys.has(issue.key)) {
        seenKeys.add(issue.key);
        allIssues.push(issue);
      }
    }

    nextPageToken = data.nextPageToken ?? null;
    pageCount++;

    // Safety: stop if we have all issues or hit max pages
    if (data.total && allIssues.length >= data.total) break;
    if (data.isLast) break;
  } while (nextPageToken && pageCount < MAX_PAGES);

  return allIssues;
}

// --- JQL Builders ---

export function buildFullSyncJql(
  boardKeys: string[],
  frontendLabel: string,
): string {
  const projects = boardKeys.join(", ");
  return `project IN (${projects}) AND labels = "${frontendLabel}" ORDER BY updated DESC`;
}

export function buildIncrementalSyncJql(
  boardKeys: string[],
  frontendLabel: string,
  since: string,
): string {
  const projects = boardKeys.join(", ");
  return `project IN (${projects}) AND labels = "${frontendLabel}" AND updated >= "${since}" ORDER BY updated DESC`;
}
