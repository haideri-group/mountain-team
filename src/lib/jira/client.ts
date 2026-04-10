function getConfig() {
  return {
    baseUrl: process.env.JIRA_BASE_URL || "",
    email: process.env.JIRA_USER_EMAIL || "",
    token: process.env.JIRA_API_TOKEN || "",
  };
}

function getAuthHeader(): string {
  const { email, token } = getConfig();
  if (!email || !token) {
    throw new Error("JIRA credentials not configured");
  }
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function getBaseUrl(): string {
  const { baseUrl } = getConfig();
  if (!baseUrl) {
    throw new Error("JIRA_BASE_URL not configured");
  }
  return baseUrl.replace(/\/$/, "");
}

export function isJiraConfigured(): boolean {
  const { baseUrl, email, token } = getConfig();
  return !!(baseUrl && email && token) && !baseUrl.includes("your-domain") && !token.includes("your-jira");
}

async function jiraFetch<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}/rest/api/3${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
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
export async function verifyJiraUser(query: string): Promise<boolean> {
  try {
    const results = await jiraFetch<Array<{ accountId: string }>>(
      `/user/search?query=${encodeURIComponent(query)}&maxResults=1`,
    );
    return Array.isArray(results) && results.length > 0;
  } catch {
    return false;
  }
}
