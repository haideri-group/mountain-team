const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_USER_EMAIL = process.env.JIRA_USER_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

function getAuthHeader(): string {
  if (!JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
    throw new Error("JIRA credentials not configured");
  }
  return `Basic ${Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;
}

function getBaseUrl(): string {
  if (!JIRA_BASE_URL) {
    throw new Error("JIRA_BASE_URL not configured");
  }
  return JIRA_BASE_URL.replace(/\/$/, "");
}

export function isJiraConfigured(): boolean {
  return !!(JIRA_BASE_URL && JIRA_USER_EMAIL && JIRA_API_TOKEN) &&
    !JIRA_BASE_URL.includes("your-domain");
}

async function jiraFetch<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}/rest/api/3${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    next: { revalidate: 60 }, // cache for 1 minute
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JIRA API error ${res.status}: ${text}`);
  }

  return res.json();
}

// Types for JIRA API responses
interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  style: string;
  avatarUrls: Record<string, string>;
  isPrivate: boolean;
}

interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectId: number;
    projectName: string;
    projectKey: string;
  };
}

export interface JiraProjectInfo {
  key: string;
  name: string;
  type: string;
  avatarUrl: string | null;
}

// Fetch all projects from JIRA
export async function fetchJiraProjects(): Promise<JiraProjectInfo[]> {
  const projects = await jiraFetch<JiraProject[]>("/project?expand=description");

  return projects.map((p) => ({
    key: p.key,
    name: p.name,
    type: p.projectTypeKey,
    avatarUrl: p.avatarUrls?.["48x48"] || null,
  }));
}

// Verify a JIRA user exists
export async function verifyJiraUser(accountId: string): Promise<boolean> {
  try {
    const results = await jiraFetch<{ users: Array<{ accountId: string }> }>(
      `/user/search?query=${encodeURIComponent(accountId)}&maxResults=1`,
    );
    return Array.isArray(results) && results.length > 0;
  } catch {
    return false;
  }
}
