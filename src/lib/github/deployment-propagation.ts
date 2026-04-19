import { db } from "@/lib/db";
import { deployments, githubBranchMappings } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { recordDeployment } from "./deployments";
import { sanitizeErrorText } from "@/lib/jira/client";
import { getGitHubRequestHeaders } from "./client";
import { captureRateLimitForMode } from "./auth-mode";

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

// --- GitHub Compare + branch-commits caches ---
//
// Both caches persist across issues within the SAME high-level sync. The
// caller (runDeploymentBackfill, syncSingleIssue) is responsible for
// calling `clearCompareCache()` at the top of its batch — letting the
// cache accumulate across issues within a run is the whole point: two
// issues that merged the same commit, or that need deploy-dates for the
// same branch, only pay GitHub once.
//
// Hard-capped to keep memory bounded across very long runs.

const COMPARE_CACHE_MAX = 5000;
const BRANCH_COMMITS_CACHE_MAX = 200;

const ghCompareCache = new Map<string, { status: string }>();
const branchCommitsCache = new Map<string, unknown[]>();

/** Clear the in-memory caches. Call at the start of each high-level
 *  sync (per-issue or backfill batch). */
export function clearCompareCache(): void {
  ghCompareCache.clear();
  branchCommitsCache.clear();
}

export async function cachedCompare(
  repoFullName: string,
  base: string,
  head: string,
): Promise<{ status: string } | null> {
  const key = `${repoFullName}:${base}...${head}`;
  if (ghCompareCache.has(key)) return ghCompareCache.get(key)!;

  const { headers, mode } = await getGitHubRequestHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/compare/${base}...${head}`,
    { headers, cache: "no-store" },
  );
  captureRateLimitForMode(mode, res);
  if (!res.ok) return null;

  const data = await res.json();
  const result = { status: data.status };
  if (ghCompareCache.size >= COMPARE_CACHE_MAX) ghCompareCache.clear();
  ghCompareCache.set(key, result);
  return result;
}

interface GhCommitSummary {
  sha: string;
  parents?: Array<{ sha: string }>;
  commit?: { committer?: { date?: string } };
}

async function getBranchCommits(
  repoFullName: string,
  branchPattern: string,
): Promise<GhCommitSummary[] | null> {
  const key = `${repoFullName}:${branchPattern}`;
  const cached = branchCommitsCache.get(key);
  if (cached) return cached as GhCommitSummary[];

  const { headers, mode } = await getGitHubRequestHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/commits?sha=${encodeURIComponent(branchPattern)}&per_page=20`,
    { headers, cache: "no-store" },
  );
  captureRateLimitForMode(mode, res);
  if (!res.ok) return null;
  const commits = (await res.json()) as GhCommitSummary[];
  if (branchCommitsCache.size >= BRANCH_COMMITS_CACHE_MAX) branchCommitsCache.clear();
  branchCommitsCache.set(key, commits);
  return commits;
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
    const branchCommits = await getBranchCommits(repoFullName, branchPattern);
    if (!branchCommits) return fallbackDate;

    for (let ci = branchCommits.length - 1; ci >= 0; ci--) {
      const bc = branchCommits[ci];
      if (!bc.parents || bc.parents.length < 2) continue; // not a merge commit
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
  /** When true, skip `findBranchDeployDate` (up to 21 GitHub calls per
   *  branch) and stamp every propagated branch with `baseDeployedAt`
   *  instead of the branch-specific merge date. Used by the bulk
   *  deployment-backfill cron where throughput > per-branch accuracy.
   *  Per-issue Sync button leaves this false. */
  approximateDates?: boolean;
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

  if (otherBranches.length === 0) return 0;

  // Pre-check: if the deployments table already has rows for this
  // (repoId, jiraKey, commitSha) across every target branch, skip
  // propagation entirely. Without this, a second backfill run re-checks
  // the same commit against 7+ branches — each branch doing 1 commits
  // fetch + up to 20 compare calls. That's ~170 GitHub API calls to
  // confirm rows we already have.
  //
  // Scope the lookup to params.repoId because otherBranches is also
  // repo-scoped (loaded from githubBranchMappings WHERE repoId = X). If a
  // different tracked repo happened to have rows for the same jiraKey +
  // commitSha (unlikely but possible with shared branch names or a
  // commit backported across repos), dropping the repoId filter would
  // falsely mark this repo's branches as covered and skip real work.
  const existing = await db
    .select({ branch: deployments.branch })
    .from(deployments)
    .where(
      and(
        eq(deployments.repoId, params.repoId),
        eq(deployments.jiraKey, params.jiraKey),
        eq(deployments.commitSha, params.commitSha),
      ),
    );
  const existingBranches = new Set(existing.map((r) => r.branch));
  const uncoveredBranches = otherBranches.filter(
    (m) => !existingBranches.has(m.branchPattern),
  );
  if (uncoveredBranches.length === 0) return 0;

  for (const mapping of uncoveredBranches) {
    try {
      const cmp = await cachedCompare(
        params.repoFullName,
        mapping.branchPattern,
        params.commitSha,
      );
      if (!cmp || (cmp.status !== "behind" && cmp.status !== "identical")) continue;

      const branchDeployedAt = params.approximateDates
        ? params.baseDeployedAt
        : await findBranchDeployDate(
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
