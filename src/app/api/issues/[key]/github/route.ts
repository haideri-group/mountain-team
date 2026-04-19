import { NextResponse } from "next/server";
import { requirePublicOrSession } from "@/lib/ip/gate";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";

interface JiraBranch {
  name: string;
  url: string;
  repository: { name: string; url: string };
  lastCommit: {
    displayId: string;
    message: string;
    url: string;
    authorTimestamp: string;
    author: { name: string; avatar: string };
  };
}

interface JiraPR {
  id: string;
  name: string;
  status: string;
  url: string;
  commentCount: number;
  lastUpdate: string;
  repositoryName: string;
  author: { name: string; avatar: string };
  reviewers: { name: string; avatar: string; approved: boolean }[];
  source: { branch: string; url: string };
  destination: { branch: string; url: string };
}

interface DevStatusResponse {
  errors: unknown[];
  detail: {
    branches?: JiraBranch[];
    pullRequests?: JiraPR[];
  }[];
}

async function fetchJiraIssueId(jiraKey: string): Promise<string | null> {
  const baseUrl = getBaseUrl();
  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(jiraKey)}?fields=id`,
    {
      headers: {
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!res.ok) return null;
  const data: { id: string } = await res.json();
  return data.id;
}

async function fetchDevStatus(
  issueId: string,
  dataType: "branch" | "pullrequest",
): Promise<DevStatusResponse> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=${dataType}`;

  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dev-status API error ${res.status}: ${sanitizeErrorText(text)}`);
  }

  return res.json();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const gate = await requirePublicOrSession(request);
    if (!gate.allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await params;

    // Get JIRA numeric issue ID (dev-status API requires it)
    const jiraIssueId = await fetchJiraIssueId(key.toUpperCase());
    if (!jiraIssueId) {
      return NextResponse.json({
        branches: [],
        pullRequests: [],
        commits: [],
      });
    }

    // Fetch branches and PRs in parallel
    const [branchData, prData] = await Promise.all([
      fetchDevStatus(jiraIssueId, "branch"),
      fetchDevStatus(jiraIssueId, "pullrequest"),
    ]);

    // Extract branches
    const rawBranches: JiraBranch[] = branchData.detail?.[0]?.branches || [];
    const branches = rawBranches.map((b) => ({
      name: b.name,
      url: b.url,
      repoName: b.repository.name,
      repoUrl: b.repository.url,
      lastCommit: b.lastCommit
        ? {
            sha: b.lastCommit.displayId,
            message: b.lastCommit.message,
            url: b.lastCommit.url,
            date: b.lastCommit.authorTimestamp?.split("T")[0] || "",
            author: b.lastCommit.author?.name || "",
            authorAvatar: b.lastCommit.author?.avatar || null,
          }
        : null,
    }));

    // Extract PRs
    const rawPRs: JiraPR[] = prData.detail?.[0]?.pullRequests || [];
    const pullRequests = rawPRs.map((pr) => ({
      id: pr.id,
      title: pr.name,
      status: pr.status,
      url: pr.url,
      commentCount: pr.commentCount,
      lastUpdate: pr.lastUpdate?.split("T")[0] || "",
      repoName: pr.repositoryName,
      author: pr.author?.name || "",
      authorAvatar: pr.author?.avatar || null,
      reviewers: (pr.reviewers || []).map((r) => ({
        name: r.name,
        avatar: r.avatar,
        approved: r.approved,
      })),
      sourceBranch: pr.source?.branch || "",
      destBranch: pr.destination?.branch || "",
    }));

    // Extract unique commits from branches' lastCommit
    const commitMap = new Map<string, (typeof branches)[0]["lastCommit"]>();
    for (const branch of branches) {
      if (branch.lastCommit && !commitMap.has(branch.lastCommit.sha)) {
        commitMap.set(branch.lastCommit.sha, branch.lastCommit);
      }
    }
    const commits = [...commitMap.values()]
      .filter(Boolean)
      .sort((a, b) => (b!.date > a!.date ? 1 : -1));

    return NextResponse.json({
      branches,
      pullRequests,
      commits,
    });
  } catch (error) {
    console.error("Failed to fetch GitHub data:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch GitHub data" },
      { status: 500 },
    );
  }
}
