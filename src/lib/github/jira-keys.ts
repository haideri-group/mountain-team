import { githubFetch } from "./client";

const JIRA_KEY_REGEX = /[A-Z]{2,}-\d+/gi;

/**
 * Extract JIRA issue keys from one or more text strings.
 * Deduplicates and normalizes to uppercase.
 */
export function extractJiraKeys(texts: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();

  for (const text of texts) {
    if (!text) continue;
    const matches = text.match(JIRA_KEY_REGEX);
    if (matches) {
      for (const m of matches) {
        keys.add(m.toUpperCase());
      }
    }
  }

  return Array.from(keys);
}

/**
 * Extract JIRA keys from a GitHub PR — title, source branch, and commit messages.
 * Falls back to fetching commit messages from GitHub API if no keys found in title/branch.
 */
export async function extractKeysFromPR(pr: {
  title: string;
  head: { ref: string };
  body?: string | null;
  number: number;
  base: { repo: { full_name: string } };
}): Promise<string[]> {
  // First: check title + branch + body
  const quickKeys = extractJiraKeys([pr.title, pr.head.ref, pr.body]);
  if (quickKeys.length > 0) return quickKeys;

  // Fallback: fetch commit messages from the PR
  try {
    const commits = await githubFetch<
      Array<{ commit: { message: string } }>
    >(`/repos/${pr.base.repo.full_name}/pulls/${pr.number}/commits?per_page=50`);

    const commitMessages = commits.map((c) => c.commit.message);
    return extractJiraKeys(commitMessages);
  } catch {
    return [];
  }
}

/**
 * Extract JIRA keys from commit messages for a given SHA range.
 */
export async function extractKeysFromCommits(
  repoFullName: string,
  commitSha: string,
): Promise<string[]> {
  try {
    const commit = await githubFetch<{
      commit: { message: string };
      parents: Array<{ sha: string }>;
    }>(`/repos/${repoFullName}/commits/${commitSha}`);

    return extractJiraKeys([commit.commit.message]);
  } catch {
    return [];
  }
}
