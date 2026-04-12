import { getAuthHeader, getBaseUrl } from "./client";

// --- Types ---

interface TeamsApiMember {
  accountId: string;
}

interface TeamsApiPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface TeamsApiResponse {
  results: TeamsApiMember[];
  pageInfo: TeamsApiPageInfo;
}

export interface JiraUserDetails {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  avatarUrls: Record<string, string>;
  active: boolean;
  accountType: string;
}

export interface TeamInfo {
  teamId: string;
  displayName: string;
}

// --- Teams API ---

async function teamsApiFetch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `https://api.atlassian.com${path}`;

  const res = await fetch(url, {
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
    throw new Error(`Teams API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function fetchTeamInfo(
  orgId: string,
  teamId: string,
): Promise<TeamInfo> {
  const url = `https://api.atlassian.com/gateway/api/public/teams/v1/org/${orgId}/teams/${teamId}`;

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Teams API error ${res.status}: ${text}`);
  }

  const data: { teamId: string; displayName: string } = await res.json();
  return { teamId: data.teamId, displayName: data.displayName };
}

export async function fetchTeamMemberIds(
  orgId: string,
  teamId: string,
): Promise<string[]> {
  const accountIds: string[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const body: Record<string, unknown> = { first: 50 };
    if (cursor) body.after = cursor;

    const data = await teamsApiFetch<TeamsApiResponse>(
      `/gateway/api/public/teams/v1/org/${orgId}/teams/${teamId}/members`,
      body,
    );

    for (const member of data.results) {
      accountIds.push(member.accountId);
    }

    hasNext = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
  }

  return accountIds;
}

export interface MemberWithTeam {
  accountId: string;
  teamId: string;
  teamName: string;
}

export async function fetchAllTeamMembers(): Promise<MemberWithTeam[]> {
  const orgId = process.env.JIRA_ORG_ID;
  const teamIdsRaw = process.env.JIRA_TEAM_IDS;

  if (!orgId || !teamIdsRaw) {
    throw new Error(
      "JIRA_ORG_ID and JIRA_TEAM_IDS must be configured for team sync",
    );
  }

  const teamIds = teamIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const allMembers: MemberWithTeam[] = [];
  const seen = new Set<string>();

  for (const teamId of teamIds) {
    const teamInfo = await fetchTeamInfo(orgId, teamId);
    const accountIds = await fetchTeamMemberIds(orgId, teamId);

    for (const accountId of accountIds) {
      // First team wins (a member can only be in 1 team)
      if (!seen.has(accountId)) {
        seen.add(accountId);
        allMembers.push({
          accountId,
          teamId: teamInfo.teamId,
          teamName: teamInfo.displayName,
        });
      }
    }
  }

  return allMembers;
}

// --- JIRA User Details ---

export async function fetchJiraUserDetails(
  accountId: string,
): Promise<JiraUserDetails> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `JIRA user fetch error ${res.status} for ${accountId}: ${text}`,
    );
  }

  return res.json();
}

export async function fetchCurrentUserAccountId(): Promise<string> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/rest/api/3/myself`;

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch current user: ${res.status}: ${text}`);
  }

  const data: { accountId: string } = await res.json();
  return data.accountId;
}
