import { db } from "@/lib/db";
import { deployments, issues, githubRepos } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  resolveBranchEnvironment,
  getAllSitesForEnvironment,
  isHotfixBranch,
} from "./branch-resolver";

export interface DeploymentInput {
  jiraKey: string;
  repoId: string;
  branch: string;
  prNumber?: number | null;
  prTitle?: string | null;
  prUrl?: string | null;
  commitSha?: string | null;
  deployedBy?: string | null;
  githubDeploymentId?: string | null;
  deployedAt: Date;
  skipSites?: string[]; // Sites to skip (from skip: labels)
}

export interface DeploymentRecord {
  id: string;
  jiraKey: string;
  environment: string;
  siteName: string | null;
  siteLabel: string | null;
  branch: string;
  prNumber: number | null;
  prUrl: string | null;
  commitSha: string | null;
  deployedBy: string | null;
  isHotfix: boolean | null;
  deployedAt: Date | null;
  repoFullName?: string;
}

export interface DeploymentSummary {
  pipeline: Array<{
    stage: string;
    environment: "staging" | "production" | "canonical";
    reached: boolean;
    sites: Array<{
      siteName: string;
      siteLabel: string | null;
      deployedAt: string | null;
      branch: string | null;
      repoName: string | null;
    }>;
  }>;
  deployments: DeploymentRecord[];
  isHotfix: boolean;
}

// --- Find existing deployment for upsert ---

async function findExistingDeployment(
  jiraKey: string,
  environment: string,
  siteName: string | null,
  repoId: string,
  commitSha: string | null,
  prNumber?: number | null,
): Promise<string | null> {
  const envCast = environment as "staging" | "production" | "canonical";
  const siteCondition = siteName ? eq(deployments.siteName, siteName) : isNull(deployments.siteName);

  // Primary dedup: by commitSha (most reliable)
  if (commitSha) {
    const existing = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(and(
        eq(deployments.jiraKey, jiraKey),
        eq(deployments.environment, envCast),
        eq(deployments.repoId, repoId),
        eq(deployments.commitSha, commitSha),
        siteCondition,
      ))
      .limit(1);

    if (existing.length > 0) return existing[0].id;
  }

  // Fallback dedup: by prNumber when commitSha is missing
  if (!commitSha && prNumber) {
    const existing = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(and(
        eq(deployments.jiraKey, jiraKey),
        eq(deployments.environment, envCast),
        eq(deployments.repoId, repoId),
        eq(deployments.prNumber, prNumber),
        siteCondition,
      ))
      .limit(1);

    if (existing.length > 0) return existing[0].id;
  }

  return null;
}

// --- Record Deployment ---

export interface DeploymentResult {
  recorded: number;
  skipped: number;
  environment: string | null;
  siteName: string | null;
  siteLabel: string | null;
}

export async function recordDeployment(
  input: DeploymentInput,
): Promise<DeploymentResult> {
  const resolved = await resolveBranchEnvironment(input.repoId, input.branch);
  if (!resolved) return { recorded: 0, skipped: 0, environment: null, siteName: null, siteLabel: null };

  const hotfix = isHotfixBranch(input.branch);

  // Resolve issueId from jiraKey (may be null if issue not yet synced)
  const [issue] = await db
    .select({ id: issues.id })
    .from(issues)
    .where(eq(issues.jiraKey, input.jiraKey))
    .limit(1);

  const issueId = issue?.id ?? null;
  let recorded = 0;
  let skipped = 0;

  // If isAllSites, expand into per-site deployments
  if (resolved.isAllSites) {
    const sites = await getAllSitesForEnvironment(
      input.repoId,
      resolved.environment,
    );

    for (const site of sites) {
      // Check skip list
      if (input.skipSites?.includes(site.siteName)) {
        skipped++;
        continue;
      }

      const existingId = await findExistingDeployment(
        input.jiraKey,
        resolved.environment,
        site.siteName,
        input.repoId,
        input.commitSha ?? null,
        input.prNumber,
      );

      if (existingId) {
        // Update existing record (fixes wrong dates on re-sync)
        await db.update(deployments).set({
          deployedAt: input.deployedAt,
          deployedBy: input.deployedBy ?? null,
          branch: input.branch,
        }).where(eq(deployments.id, existingId));
        recorded++;
      } else {
        const id = `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.insert(deployments).values({
          id,
          issueId,
          jiraKey: input.jiraKey,
          repoId: input.repoId,
          environment: resolved.environment,
          siteName: site.siteName,
          siteLabel: site.siteLabel,
          branch: input.branch,
          prNumber: input.prNumber ?? null,
          prTitle: input.prTitle ?? null,
          prUrl: input.prUrl ?? null,
          commitSha: input.commitSha ?? null,
          deployedBy: input.deployedBy ?? null,
          githubDeploymentId: input.githubDeploymentId ?? null,
          isHotfix: hotfix,
          deployedAt: input.deployedAt,
        });
        recorded++;
      }
    }
  } else {
    // Single site deployment
    const existingId = await findExistingDeployment(
      input.jiraKey,
      resolved.environment,
      resolved.siteName,
      input.repoId,
      input.commitSha ?? null,
      input.prNumber,
    );

    if (existingId) {
      await db.update(deployments).set({
        deployedAt: input.deployedAt,
        deployedBy: input.deployedBy ?? null,
        branch: input.branch,
      }).where(eq(deployments.id, existingId));
      recorded = 1;
    } else {
      const id = `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(deployments).values({
        id,
        issueId,
        jiraKey: input.jiraKey,
        repoId: input.repoId,
        environment: resolved.environment,
        siteName: resolved.siteName,
        siteLabel: resolved.siteLabel,
        branch: input.branch,
        prNumber: input.prNumber ?? null,
        prTitle: input.prTitle ?? null,
        prUrl: input.prUrl ?? null,
        commitSha: input.commitSha ?? null,
        deployedBy: input.deployedBy ?? null,
        githubDeploymentId: input.githubDeploymentId ?? null,
        isHotfix: hotfix,
        deployedAt: input.deployedAt,
      });
      recorded = 1;
    }
  }

  return { recorded, skipped, environment: resolved.environment, siteName: resolved.siteName, siteLabel: resolved.siteLabel };
}

// --- Get Deployments for Issue ---

export async function getDeploymentsForIssue(
  jiraKey: string,
): Promise<DeploymentSummary> {
  // Fetch all deployment records for this issue
  const records = await db
    .select({
      id: deployments.id,
      jiraKey: deployments.jiraKey,
      environment: deployments.environment,
      siteName: deployments.siteName,
      siteLabel: deployments.siteLabel,
      branch: deployments.branch,
      prNumber: deployments.prNumber,
      prUrl: deployments.prUrl,
      commitSha: deployments.commitSha,
      deployedBy: deployments.deployedBy,
      isHotfix: deployments.isHotfix,
      deployedAt: deployments.deployedAt,
      repoId: deployments.repoId,
    })
    .from(deployments)
    .where(eq(deployments.jiraKey, jiraKey))
    .orderBy(desc(deployments.deployedAt));

  // Fetch repo names for display
  const repoIds = [...new Set(records.map((r) => r.repoId))];
  const repos = repoIds.length > 0
    ? await Promise.all(
        repoIds.map(async (id) => {
          const [repo] = await db
            .select({ id: githubRepos.id, fullName: githubRepos.fullName })
            .from(githubRepos)
            .where(eq(githubRepos.id, id))
            .limit(1);
          return repo;
        }),
      )
    : [];
  const repoMap = new Map(repos.filter(Boolean).map((r) => [r!.id, r!.fullName]));

  const hasHotfix = records.some((r) => r.isHotfix);

  // Build pipeline stages
  const envOrder = ["staging", "production", "canonical"] as const;
  const pipeline = envOrder.map((env) => {
    const envRecords = records.filter((r) => r.environment === env);
    const sites = new Map<string, {
      siteName: string;
      siteLabel: string | null;
      deployedAt: string | null;
      branch: string | null;
      repoName: string | null;
      commitSha: string | null;
      prUrl: string | null;
    }>();

    for (const r of envRecords) {
      const key = r.siteName || "__canonical__";
      if (!sites.has(key)) {
        sites.set(key, {
          siteName: r.siteName || "",
          siteLabel: r.siteLabel,
          deployedAt: r.deployedAt?.toISOString() ?? null,
          branch: r.branch,
          repoName: repoMap.get(r.repoId) ?? null,
          commitSha: r.commitSha,
          prUrl: r.prUrl,
        });
      }
    }

    return {
      stage: env === "staging" ? "Staging" : env === "production" ? "Production" : "Main",
      environment: env,
      reached: envRecords.length > 0,
      sites: Array.from(sites.values()),
    };
  });

  return {
    pipeline,
    deployments: records.map((r) => ({
      ...r,
      repoFullName: repoMap.get(r.repoId),
    })),
    isHotfix: hasHotfix,
  };
}

// --- Get Pending Releases (staging but not production) ---

export async function getPendingReleases(): Promise<
  Array<{
    jiraKey: string;
    issueId: string | null;
    title: string | null;
    stagedAt: Date | null;
    siteName: string | null;
    siteLabel: string | null;
    daysPending: number;
  }>
> {
  // Get all staging deployments
  const staged = await db
    .select()
    .from(deployments)
    .where(eq(deployments.environment, "staging"));

  // Get all production deployments
  const live = await db
    .select()
    .from(deployments)
    .where(eq(deployments.environment, "production"));

  const liveKeys = new Set(
    live.map((d) => `${d.jiraKey}:${d.siteName || ""}`),
  );

  const now = Date.now();
  const pending = staged
    .filter((d) => !liveKeys.has(`${d.jiraKey}:${d.siteName || ""}`))
    .map((d) => ({
      jiraKey: d.jiraKey,
      issueId: d.issueId,
      title: d.prTitle,
      stagedAt: d.deployedAt,
      siteName: d.siteName,
      siteLabel: d.siteLabel,
      daysPending: d.deployedAt
        ? Math.floor((now - d.deployedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    }));

  // Deduplicate by jiraKey + siteName (keep earliest staged)
  const seen = new Map<string, (typeof pending)[0]>();
  for (const p of pending) {
    const key = `${p.jiraKey}:${p.siteName || ""}`;
    if (!seen.has(key)) seen.set(key, p);
  }

  return Array.from(seen.values()).sort((a, b) => b.daysPending - a.daysPending);
}
