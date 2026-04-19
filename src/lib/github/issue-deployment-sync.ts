import { db } from "@/lib/db";
import { githubRepos, githubBranchMappings } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { recordDeployment } from "./deployments";
import { extractJiraKeys } from "./jira-keys";
import { propagateDeploymentToOtherBranches } from "./deployment-propagation";
import { githubFetch } from "./client";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";

/** Shape of the GitHub REST `/repos/{owner}/{repo}/pulls/{number}` response
 *  fields we consume. Narrowed to the properties actually read below. */
interface GhPullResponse {
  number?: number;
  title?: string | null;
  html_url?: string | null;
  merge_commit_sha?: string | null;
  merged?: boolean;
  merged_at?: string | null;
  base?: { ref?: string };
  head?: { ref?: string };
  body?: string | null;
  user?: { login?: string | null };
}

interface GhSearchResponse {
  items?: Array<{ number: number }>;
}

/**
 * Three-strategy deployment fetcher for a single JIRA issue, extracted from
 * `syncSingleIssue` in `src/lib/sync/issue-sync.ts` during Phase 20. Shared by
 * the per-issue Sync button and the new deployment-backfill cron.
 *
 * Strategies, tried in order and short-circuit as soon as one records >0:
 *   1. JIRA dev-status ? merged PRs ? recordDeployment + propagation
 *      (requires `jiraIssueId` — the numeric JIRA issue id)
 *   2. GitHub search (?q={key} is:pr is:merged) across tracked repos
 *   3. Scan JIRA issue comments for GitHub PR URLs
 *
 * Behaviour-preserving extraction — logic matches the original inline copy.
 */

export type DeploymentSyncPath =
  | "dev-status"
  | "gh-search"
  | "jira-comments"
  | "none";

export interface DeploymentSyncResult {
  jiraKey: string;
  deploymentsRecorded: number;
  path: DeploymentSyncPath;
}

export interface RecordDeploymentsForIssueInput {
  jiraKey: string;
  /** JIRA numeric issue id. Required to query the dev-status endpoint.
   *  If omitted, strategy 1 is skipped and we fall through to gh-search. */
  jiraIssueId?: string | null;
}

/**
 * Caller is responsible for `clearCompareCache()` at the START of their
 * high-level sync (once per batch, not per issue). Keeping the compare +
 * branch-commits caches across issues is the whole point — two issues
 * that merged the same commit or target the same branch pay one GitHub
 * round-trip, not two.
 */
export async function recordDeploymentsForIssue(
  input: RecordDeploymentsForIssueInput,
): Promise<DeploymentSyncResult> {
  const { jiraKey, jiraIssueId } = input;
  let deploymentsRecorded = 0;
  let path: DeploymentSyncPath = "none";

  // Hoisted once and reused across all three strategies — the repo list is
  // stable within a single sync, so re-querying in each fallback was wasteful.
  const allRepos = await db.select().from(githubRepos);
  const repoMap = new Map(allRepos.map((r) => [r.fullName, r.id]));

  // --- Strategy 1: JIRA dev-status (merged PRs ? deployment branches) ---
  if (jiraIssueId) {
    try {
      const issueId = encodeURIComponent(jiraIssueId);
      const devStatusUrl = `${getBaseUrl()}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=GitHub&dataType=pullrequest`;
      const devRes = await fetch(devStatusUrl, {
        headers: { Authorization: getAuthHeader(), Accept: "application/json" },
        cache: "no-store",
      });

      if (devRes.ok) {
        const devData = await devRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mergedPRs: Array<{ detail: any; pr: any }> = [];

        for (const detail of devData.detail || []) {
          for (const pr of detail.pullRequests || []) {
            if (pr.status === "MERGED") mergedPRs.push({ detail, pr });
          }
        }

        if (mergedPRs.length > 0) {
          const mappingsByRepo = new Map<
            string,
            typeof githubBranchMappings.$inferSelect[]
          >();
          // Single query + in-memory group — avoids an N+1 as repo count grows.
          if (allRepos.length > 0) {
            const allMappings = await db
              .select()
              .from(githubBranchMappings)
              .where(
                inArray(
                  githubBranchMappings.repoId,
                  allRepos.map((r) => r.id),
                ),
              );
            for (const m of allMappings) {
              const list = mappingsByRepo.get(m.repoId);
              if (list) list.push(m);
              else mappingsByRepo.set(m.repoId, [m]);
            }
          }
          for (const { detail, pr } of mergedPRs) {
            const destBranch = pr.destination?.branch;
            let repoFullName = "";
            if (pr.url) {
              const match = pr.url.match(/github\.com\/([^/]+\/[^/]+)\//);
              if (match) repoFullName = match[1];
            }
            if (!repoFullName) {
              repoFullName =
                pr.source?.repository?.name ||
                detail.repositories?.[0]?.name ||
                "";
            }
            if (!destBranch || !repoFullName) continue;

            const repoId = repoMap.get(repoFullName);
            if (!repoId) continue;

            let commitSha = pr.lastCommit?.id || "";
            let deployedAt = new Date(pr.mergedAt || pr.lastUpdate || Date.now());
            const prNum = parseInt(pr.id?.replace("#", "") || "0", 10);

            if (!commitSha && prNum && process.env.GITHUB_TOKEN) {
              try {
                // githubFetch captures X-RateLimit-* headers into the shared
                // counter read by the deployment-backfill circuit breaker.
                const ghPr = await githubFetch<GhPullResponse>(
                  `/repos/${repoFullName}/pulls/${prNum}`,
                );
                commitSha = ghPr.merge_commit_sha || "";
                if (ghPr.merged_at) deployedAt = new Date(ghPr.merged_at);
              } catch (e) {
                console.warn(
                  "Deployment propagation error:",
                  sanitizeErrorText(e instanceof Error ? e.message : String(e)),
                );
              }
            }
            if (!commitSha) commitSha = `pr-${prNum}`;

            const result = await recordDeployment({
              jiraKey,
              repoId,
              branch: destBranch,
              prNumber: prNum || null,
              prTitle: pr.name || null,
              prUrl: pr.url || null,
              commitSha,
              deployedBy: pr.author?.name || null,
              deployedAt,
            });
            deploymentsRecorded += result.recorded;

            if (commitSha) {
              deploymentsRecorded += await propagateDeploymentToOtherBranches({
                jiraKey,
                repoId,
                repoFullName,
                commitSha,
                sourceBranch: destBranch,
                prNumber: prNum || null,
                prTitle: pr.name || null,
                prUrl: pr.url || null,
                deployedBy: pr.author?.name || null,
                baseDeployedAt: deployedAt,
                branchMappings: mappingsByRepo.get(repoId),
              });
            }
          }
          if (deploymentsRecorded > 0) path = "dev-status";
        }
      }
    } catch (err) {
      console.warn(
        "JIRA deployment sync failed (non-fatal):",
        sanitizeErrorText(err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // --- Strategy 2: GitHub search fallback ---
  if (deploymentsRecorded === 0 && process.env.GITHUB_TOKEN) {
    try {
      for (const repo of allRepos) {
        let searchData: GhSearchResponse;
        try {
          searchData = await githubFetch<GhSearchResponse>(
            `/search/issues?q=${encodeURIComponent(jiraKey)}+repo:${repo.fullName}+is:pr+is:merged&per_page=10`,
          );
        } catch {
          // Preserve prior behaviour: skip this repo on any search failure.
          continue;
        }

        for (const item of searchData.items || []) {
          let ghPr: GhPullResponse;
          try {
            ghPr = await githubFetch<GhPullResponse>(
              `/repos/${repo.fullName}/pulls/${item.number}`,
            );
          } catch {
            continue;
          }

          if (!ghPr.merged || !ghPr.base?.ref) continue;

          const prKeys = extractJiraKeys([ghPr.title, ghPr.head?.ref, ghPr.body]);
          if (!prKeys.includes(jiraKey)) continue;

          const commitSha = ghPr.merge_commit_sha || "";
          const deployedAt = new Date(ghPr.merged_at || Date.now());
          const destBranch = ghPr.base.ref;
          const repoId = repo.id;

          const result = await recordDeployment({
            jiraKey,
            repoId,
            branch: destBranch,
            prNumber: ghPr.number ?? null,
            prTitle: ghPr.title || null,
            prUrl: ghPr.html_url || null,
            commitSha,
            deployedBy: ghPr.user?.login || null,
            deployedAt,
          });
          deploymentsRecorded += result.recorded;

          if (commitSha) {
            deploymentsRecorded += await propagateDeploymentToOtherBranches({
              jiraKey,
              repoId,
              repoFullName: repo.fullName,
              commitSha,
              sourceBranch: destBranch,
              prNumber: ghPr.number ?? null,
              prTitle: ghPr.title || null,
              prUrl: ghPr.html_url || null,
              deployedBy: ghPr.user?.login || null,
              baseDeployedAt: deployedAt,
            });
          }
        }
      }
      if (deploymentsRecorded > 0 && path === "none") path = "gh-search";
    } catch (err) {
      console.warn(
        "GitHub deployment fallback failed (non-fatal):",
        sanitizeErrorText(err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // --- Strategy 3: JIRA comments fallback ---
  if (deploymentsRecorded === 0 && process.env.GITHUB_TOKEN) {
    try {
      const commentsUrl = `${getBaseUrl()}/rest/api/3/issue/${jiraKey}/comment?maxResults=20`;
      const commentsRes = await fetch(commentsUrl, {
        headers: { Authorization: getAuthHeader(), Accept: "application/json" },
        cache: "no-store",
      });

      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        const prUrlRegex = /https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/g;
        const seenPrUrls = new Set<string>();

        for (const comment of commentsData.comments || []) {
          const bodyStr = JSON.stringify(comment.body || "");
          prUrlRegex.lastIndex = 0;
          let match;
          while ((match = prUrlRegex.exec(bodyStr)) !== null) {
            const repoFullName = match[1];
            const prNumber = parseInt(match[2], 10);
            const prUrl = match[0];
            if (seenPrUrls.has(prUrl)) continue;
            seenPrUrls.add(prUrl);

            const repoId = repoMap.get(repoFullName);
            if (!repoId) continue;

            try {
              const ghPr = await githubFetch<GhPullResponse>(
                `/repos/${repoFullName}/pulls/${prNumber}`,
              );
              if (!ghPr.merged || !ghPr.base?.ref) continue;

              const commitSha = ghPr.merge_commit_sha || "";
              const deployedAt = new Date(ghPr.merged_at || Date.now());

              const result = await recordDeployment({
                jiraKey,
                repoId,
                branch: ghPr.base.ref,
                prNumber,
                prTitle: ghPr.title || null,
                prUrl,
                commitSha,
                deployedBy: ghPr.user?.login || null,
                deployedAt,
              });
              deploymentsRecorded += result.recorded;

              if (commitSha) {
                deploymentsRecorded += await propagateDeploymentToOtherBranches({
                  jiraKey,
                  repoId,
                  repoFullName,
                  commitSha,
                  sourceBranch: ghPr.base.ref,
                  prNumber,
                  prTitle: ghPr.title || null,
                  prUrl,
                  deployedBy: ghPr.user?.login || null,
                  baseDeployedAt: deployedAt,
                });
              }
            } catch (e) {
              console.warn(
                "PR fetch from comment failed:",
                sanitizeErrorText(e instanceof Error ? e.message : String(e)),
              );
            }
          }
        }
        if (deploymentsRecorded > 0 && path === "none") path = "jira-comments";
      }
    } catch (err) {
      console.warn(
        "JIRA comments fallback failed (non-fatal):",
        sanitizeErrorText(err instanceof Error ? err.message : String(err)),
      );
    }
  }

  return { jiraKey, deploymentsRecorded, path };
}
