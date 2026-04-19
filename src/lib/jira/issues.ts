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
  renderedFields?: {
    description?: string | null;
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

// --- Shared JIRA field list (single source of truth) ---

const BASE_ISSUE_FIELDS = [
  "summary", "status", "priority", "issuetype", "assignee", "project",
  "labels", "description", "duedate", "created", "updated", "resolutiondate",
  "statuscategorychangedate", "fixVersions",
];

// --- Retry-aware fetch ---

export async function fetchWithRetry(
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
  const fields = [...BASE_ISSUE_FIELDS];
  if (customFields.storyPoints) fields.push(customFields.storyPoints);
  if (customFields.startDate) fields.push(customFields.startDate);
  fields.push("customfield_10795"); // Request Priority (P1-P4)
  fields.push("customfield_10734"); // Website
  fields.push("customfield_10805"); // Brands

  const allIssues: JiraIssueRaw[] = [];
  const seenKeys = new Set<string>();
  let nextPageToken: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 50;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields,
      expand: "renderedFields",
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

/**
 * Optional filter that excludes old terminal (done/closed/cancelled/…)
 * tickets from bulk sync. Tickets that are already frozen cost API
 * calls + DB upserts on every sync for no benefit.
 *
 *   archiveAgeDays     age threshold in days (env var override; default 365)
 *   exemptBoardKeys    boards we've never synced — their old-terminal
 *                      tickets MUST still be fetched on the first run,
 *                      otherwise the initial sync for a newly-tracked
 *                      board would silently miss them.
 */
export interface ArchiveFilterOpts {
  archiveAgeDays?: number;
  exemptBoardKeys?: string[];
}

function archiveAgeDaysFromEnv(): number {
  // Default is 0 (filter OFF) when the env var is unset — opt-in so a
  // fresh install doesn't silently skip any tickets. Set the var
  // explicitly (e.g. 365) to enable the filter.
  const raw = Number(process.env.JIRA_SYNC_ARCHIVE_AGE_DAYS ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/**
 * Build the "skip old-terminal" JQL fragment, or return null when the
 * filter is disabled. `statusCategory = "Done"` catches every workflow
 * variant — "Closed", "Resolved", "Cancelled", "Won't Fix" all roll up
 * to the Done category in JIRA, so one clause covers them all.
 *
 * When `exemptBoardKeys` is non-empty, the OR lets those boards pull
 * their full ticket set through while still filtering everywhere else.
 */
function archiveClause(opts: ArchiveFilterOpts = {}): string | null {
  const days = opts.archiveAgeDays ?? archiveAgeDaysFromEnv();
  if (days <= 0) return null;
  const exempt = (opts.exemptBoardKeys ?? []).filter(Boolean);
  const base = `NOT (statusCategory = "Done" AND updated < -${days}d)`;
  if (exempt.length === 0) return base;
  const exemptList = exempt.map((k) => `"${k}"`).join(", ");
  return `(${base} OR project IN (${exemptList}))`;
}

export function buildFullSyncJql(
  boardKeys: string[],
  memberAccountIds: string[],
  frontendLabel?: string,
  filterOpts?: ArchiveFilterOpts,
): string {
  const projects = boardKeys.join(", ");
  const conditions: string[] = [`project IN (${projects})`];

  // Build OR condition: assigned to team members OR has Frontend label
  const orParts: string[] = [];
  if (memberAccountIds.length > 0) {
    const accounts = memberAccountIds.map((id) => `"${id}"`).join(", ");
    orParts.push(`assignee IN (${accounts})`);
  }
  if (frontendLabel) {
    orParts.push(`labels = "${frontendLabel}"`);
  }

  if (orParts.length > 0) {
    conditions.push(`(${orParts.join(" OR ")})`);
  }

  const archive = archiveClause(filterOpts);
  if (archive) conditions.push(archive);

  return `${conditions.join(" AND ")} ORDER BY updated DESC`;
}

export function buildIncrementalSyncJql(
  boardKeys: string[],
  memberAccountIds: string[],
  since: string,
  frontendLabel?: string,
  filterOpts?: ArchiveFilterOpts,
): string {
  const projects = boardKeys.join(", ");
  const conditions: string[] = [`project IN (${projects})`];

  const orParts: string[] = [];
  if (memberAccountIds.length > 0) {
    const accounts = memberAccountIds.map((id) => `"${id}"`).join(", ");
    orParts.push(`assignee IN (${accounts})`);
  }
  if (frontendLabel) {
    orParts.push(`labels = "${frontendLabel}"`);
  }

  if (orParts.length > 0) {
    conditions.push(`(${orParts.join(" OR ")})`);
  }

  conditions.push(`updated >= "${since}"`);

  const archive = archiveClause(filterOpts);
  if (archive) conditions.push(archive);

  return `${conditions.join(" AND ")} ORDER BY updated DESC`;
}

// --- Single Issue Fetch ---

/**
 * Fetch a single issue from JIRA REST API by key.
 * Includes renderedFields for HTML description.
 */
export async function fetchSingleIssue(
  jiraKey: string,
): Promise<JiraIssueRaw | null> {
  try {
    const baseUrl = getBaseUrl();
    const authHeader = getAuthHeader();

    // Build fields list including known custom fields
    const customFields = await discoverCustomFieldIds();
    const extraFields = [
      customFields.storyPoints,
      customFields.startDate,
      "customfield_10795", // requestPriority
      "customfield_10734", // website
      "customfield_10805", // brands
    ].filter(Boolean);

    const fields = [...BASE_ISSUE_FIELDS, ...extraFields].join(",");

    const res = await fetchWithRetry(
      `${baseUrl}/rest/api/3/issue/${jiraKey}?expand=renderedFields&fields=${fields}`,
      {
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      if (res.status === 404) return null;
      const text = await res.text();
      throw new Error(`JIRA API error ${res.status}: ${sanitizeErrorText(text)}`);
    }

    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch issue ${jiraKey} from JIRA:`, err);
    throw err;
  }
}
