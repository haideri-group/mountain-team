import { db } from "@/lib/db";
import { githubRepos, githubBranchMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordDeployment } from "./deployments";
import { extractJiraKeys } from "./jira-keys";
import {
  clearCompareCache,
  propagateDeploymentToOtherBranches,
} from "./deployment-propagation";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";

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

export async function recordDeploymentsForIssue(
  input: RecordDeploymentsForIssueInput,
): Promise<DeploymentSyncResult> {
  const { jiraKey, jiraIssueId } = input;
  let deploymentsRecorded = 0;
  let path: DeploymentSyncPath = "none";

  clearCompareCache();

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
          const allRepos = await db.select().from(githubRepos);
          const repoMap = new Map(allRepos.map((r) => [r.fullName, r.id]));
          const mappingsByRepo = new Map<
            string,
            typeof githubBranchMappings.$inferSelect[]
          >();
          for (const repo of allRepos) {
            const mappings = await db
              .select()
              .from(githubBranchMappings)
              .where(eq(githubBranchMappings.repoId, repo.id));
            mappingsByRepo.set(repo.id, mappings);
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
                const ghRes = await fetch(
                  `https://api.github.com/repos/${repoFullName}/pulls/${prNum}`,
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                      Accept: "application/vnd.github+json",
                    },
                    cache: "no-store",
                  },
                );
                if (ghRes.ok) {
                  const ghPr = await ghRes.json();
                  commitSha = ghPr.merge_commit_sha || "";
                  if (ghPr.merged_at) deployedAt = new Date(ghPr.merged_at);
                }
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
              prNumber: parseInt(pr.id?.replace("#", "") || "0", 10) || null,
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
      const allRepos = await db.select().from(githubRepos);
      for (const repo of allRepos) {
        const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(jiraKey)}+repo:${repo.fullName}+is:pr+is:merged&per_page=10`;
        const searchRes = await fetch(searchUrl, {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          },
          cache: "no-store",
        });

        if (!searchRes.ok) continue;
        const searchData = await searchRes.json();

        for (const item of searchData.items || []) {
          const prRes = await fetch(
            `https://api.github.com/repos/${repo.fullName}/pulls/${item.number}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                Accept: "application/vnd.github+json",
              },
              cache: "no-store",
            },
          );
          if (!prRes.ok) continue;
          const ghPr = await prRes.json();

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
            prNumber: ghPr.number,
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
              prNumber: ghPr.number,
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
        const allRepos = await db.select().from(githubRepos);
        const repoMap = new Map(allRepos.map((r) => [r.fullName, r.id]));

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
              const prRes = await fetch(
                `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                    Accept: "application/vnd.github+json",
                  },
                  cache: "no-store",
                },
              );
              if (!prRes.ok) continue;
              const ghPr = await prRes.json();
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
