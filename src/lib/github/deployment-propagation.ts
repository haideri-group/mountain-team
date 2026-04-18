import { db } from "@/lib/db";
import { githubBranchMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordDeployment } from "./deployments";
import { sanitizeErrorText } from "@/lib/jira/client";

/**
 * GitHub `compare` and branch-deploy-date helpers, plus the
 * `propagateDeploymentToOtherBranches` function that walks a merge commit
 * across configured deployment branches.
 *
 * Extracted from `src/lib/sync/issue-sync.ts` during Phase 20 so both the
 * per-issue Sync button and the new deployment-backfill cron can share a
 * single implementation. Behaviour-preserving — no logic changes from the
 * original.
 */

// --- GitHub Compare Cache (per-invocation, avoids duplicate API calls) ---

const ghCompareCache = new Map<string, { status: string }>();

/** Clear the in-memory compare cache. Call this at the start of each
 *  high-level sync (per-issue or backfill batch) so a long-running
 *  Node process doesn't carry stale comparisons across unrelated runs. */
export function clearCompareCache(): void {
  ghCompareCache.clear();
}

export async function cachedCompare(
  repoFullName: string,
  base: string,
  head: string,
): Promise<{ status: string } | null> {
  const key = `${repoFullName}:${base}...${head}`;
  if (ghCompareCache.has(key)) return ghCompareCache.get(key)!;

  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/compare/${base}...${head}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;

  const data = await res.json();
  const result = { status: data.status };
  ghCompareCache.set(key, result);
  return result;
}

// --- Deploy Date Lookup Helper ---

/**
 * Find the actual date a commit arrived on a branch by walking merge commits.
 * Returns the merge commit date if found, otherwise the fallback date.
 * Checks at most 20 recent commits to limit API calls.
 */
export async function findBranchDeployDate(
  repoFullName: string,
  branchPattern: string,
  commitSha: string,
  fallbackDate: Date,
): Promise<Date> {
  try {
    const headers = {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    };
    const commitsRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/commits?sha=${branchPattern}&per_page=20`,
      { headers, cache: "no-store" },
    );
    if (!commitsRes.ok) return fallbackDate;

    const branchCommits = await commitsRes.json();
    for (let ci = branchCommits.length - 1; ci >= 0; ci--) {
      const bc = branchCommits[ci];
      if (bc.parents?.length < 2) continue; // not a merge commit
      const data = await cachedCompare(repoFullName, commitSha, bc.sha);
      if (data && (data.status === "ahead" || data.status === "identical")) {
        return new Date(bc.commit?.committer?.date || fallbackDate);
      }
    }
  } catch (e) {
    console.warn(
      "Deploy date lookup error:",
      sanitizeErrorText(e instanceof Error ? e.message : String(e)),
    );
  }
  return fallbackDate;
}

// --- Commit Propagation ---

/**
 * Check if a commit has propagated to other deployment branches and record
 * deployments with real deploy dates for each. Returns the count of new
 * deployments recorded.
 */
export async function propagateDeploymentToOtherBranches(params: {
  jiraKey: string;
  repoId: string;
  repoFullName: string;
  commitSha: string;
  sourceBranch: string;
  prNumber: number | null;
  prTitle: string | null;
  prUrl: string | null;
  deployedBy: string | null;
  baseDeployedAt: Date;
  branchMappings?: typeof githubBranchMappings.$inferSelect[];
}): Promise<number> {
  // Skip synthetic placeholder SHAs (e.g., "pr-6483") — not real commits
  if (params.commitSha.startsWith("pr-")) return 0;

  let recorded = 0;
  const mappings =
    params.branchMappings ||
    (await db
      .select()
      .from(githubBranchMappings)
      .where(eq(githubBranchMappings.repoId, params.repoId)));
  const otherBranches = mappings.filter(
    (m) => m.branchPattern !== params.sourceBranch && !m.isAllSites,
  );

  for (const mapping of otherBranches) {
    try {
      const cmp = await cachedCompare(
        params.repoFullName,
        mapping.branchPattern,
        params.commitSha,
      );
      if (!cmp || (cmp.status !== "behind" && cmp.status !== "identical")) continue;

      const branchDeployedAt = await findBranchDeployDate(
        params.repoFullName,
        mapping.branchPattern,
        params.commitSha,
        params.baseDeployedAt,
      );

      const result = await recordDeployment({
        jiraKey: params.jiraKey,
        repoId: params.repoId,
        branch: mapping.branchPattern,
        prNumber: params.prNumber,
        prTitle: params.prTitle,
        prUrl: params.prUrl,
        commitSha: params.commitSha,
        deployedBy: params.deployedBy,
        deployedAt: branchDeployedAt,
      });
      recorded += result.recorded;
    } catch (e) {
      console.warn(
        "Deployment propagation error:",
        sanitizeErrorText(e instanceof Error ? e.message : String(e)),
      );
    }
  }
  return recorded;
}
