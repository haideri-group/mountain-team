import { db } from "@/lib/db";
import { githubRepos, githubBranchMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { githubFetch } from "./client";
import { extractJiraKeys } from "./jira-keys";
import { recordDeployment } from "./deployments";

interface BackfillResult {
  deploymentsCreated: number;
  issuesMapped: number;
  prsProcessed: number;
  errors: string[];
}

// --- In-memory progress tracking ---

export interface BackfillProgress {
  phase: "idle" | "fetching" | "processing" | "done" | "failed";
  message: string;
  prsScanned: number;
  prsTotal: number;
  deploymentsCreated: number;
  repoName: string;
}

const defaultProgress: BackfillProgress = {
  phase: "idle", message: "", prsScanned: 0, prsTotal: 0, deploymentsCreated: 0, repoName: "",
};

let currentProgress: BackfillProgress = { ...defaultProgress };

export function getBackfillProgress(): BackfillProgress {
  return { ...currentProgress };
}

function updateProgress(update: Partial<BackfillProgress>) {
  currentProgress = { ...currentProgress, ...update };
}

interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  user: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
  labels: Array<{ name: string }>;
}

/**
 * Backfill deployment records from recently merged PRs to deployment branches.
 * Looks at the last 30 days of merged PRs targeting tracked branches.
 */
export async function backfillDeployments(
  repoId: string,
): Promise<BackfillResult> {
  const result: BackfillResult = {
    deploymentsCreated: 0,
    issuesMapped: 0,
    prsProcessed: 0,
    errors: [],
  };

  // Fetch repo + branch mappings
  const [repo] = await db
    .select()
    .from(githubRepos)
    .where(eq(githubRepos.id, repoId))
    .limit(1);

  if (!repo) {
    result.errors.push("Repo not found");
    updateProgress({ phase: "failed", message: "Repository not found" });
    return result;
  }

  // Reset progress
  updateProgress({
    phase: "fetching",
    message: `Scanning merged PRs from ${repo.fullName}...`,
    prsScanned: 0,
    prsTotal: 0,
    deploymentsCreated: 0,
    repoName: repo.fullName,
  });

  const mappings = await db
    .select()
    .from(githubBranchMappings)
    .where(eq(githubBranchMappings.repoId, repoId));

  const deployBranches = new Set(mappings.map((m) => m.branchPattern));

  // Fetch recently merged PRs (last 90 days, paginated)
  const since = new Date();
  since.setDate(since.getDate() - 90);

  let page = 1;
  const maxPages = 10;
  const seenKeys = new Set<string>();

  while (page <= maxPages) {
    try {
      const prs = await githubFetch<GitHubPR[]>(
        `/repos/${repo.fullName}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
      );

      if (prs.length === 0) break;

      updateProgress({
        phase: "processing",
        message: `Processing page ${page}...`,
        prsTotal: currentProgress.prsTotal || prs.length * maxPages, // estimate
      });

      for (const pr of prs) {
        // Only merged PRs
        if (!pr.merged_at) continue;

        // Only PRs merged within the last 30 days
        if (new Date(pr.merged_at) < since) continue;

        // Only PRs targeting deployment branches
        if (!deployBranches.has(pr.base.ref)) continue;

        result.prsProcessed++;
        updateProgress({
          prsScanned: result.prsProcessed,
          deploymentsCreated: result.deploymentsCreated,
          message: `Processing PR #${pr.number}: ${pr.title.substring(0, 50)}...`,
        });

        // Extract JIRA keys
        const jiraKeys = extractJiraKeys([
          pr.title,
          pr.head.ref,
          pr.body,
        ]);

        if (jiraKeys.length === 0) continue;

        // Parse skip labels
        const skipSites: string[] = [];
        for (const label of pr.labels || []) {
          if (label.name?.startsWith("skip:")) {
            skipSites.push(label.name.replace("skip:", ""));
          }
        }

        for (const jiraKey of jiraKeys) {
          const deployResult = await recordDeployment({
            jiraKey,
            repoId,
            branch: pr.base.ref,
            prNumber: pr.number,
            prTitle: pr.title,
            prUrl: pr.html_url,
            commitSha: pr.merge_commit_sha ?? null,
            deployedBy: pr.user?.login ?? null,
            deployedAt: new Date(pr.merged_at),
            skipSites,
          });

          result.deploymentsCreated += deployResult.recorded;
          if (!seenKeys.has(jiraKey)) {
            seenKeys.add(jiraKey);
            result.issuesMapped++;
          }
        }
      }

      // If the oldest PR on this page is older than 30 days, stop
      const oldestPr = prs[prs.length - 1];
      if (oldestPr?.merged_at && new Date(oldestPr.merged_at) < since) break;

      page++;
    } catch (err) {
      result.errors.push(
        `Page ${page}: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      updateProgress({ phase: "failed", message: err instanceof Error ? err.message : "Unknown error" });
      break;
    }
  }

  // Update lastBackfillAt
  await db
    .update(githubRepos)
    .set({ lastBackfillAt: new Date() })
    .where(eq(githubRepos.id, repoId));

  updateProgress({
    phase: "done",
    message: `Complete: ${result.deploymentsCreated} deployments from ${result.prsProcessed} PRs`,
    prsScanned: result.prsProcessed,
    deploymentsCreated: result.deploymentsCreated,
  });

  return result;
}
