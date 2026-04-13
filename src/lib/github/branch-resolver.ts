import { db } from "@/lib/db";
import { githubBranchMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface BranchEnvironment {
  environment: "staging" | "production" | "canonical";
  siteName: string | null;
  siteLabel: string | null;
  isAllSites: boolean;
}

/**
 * Resolve a branch name to its environment and site using the configured mappings.
 * First tries exact match, then pattern match.
 */
export async function resolveBranchEnvironment(
  repoId: string,
  branchName: string,
): Promise<BranchEnvironment | null> {
  const mappings = await db
    .select()
    .from(githubBranchMappings)
    .where(eq(githubBranchMappings.repoId, repoId));

  if (mappings.length === 0) return null;

  // 1. Exact match
  const exact = mappings.find((m) => m.branchPattern === branchName);
  if (exact) {
    return {
      environment: exact.environment,
      siteName: exact.siteName,
      siteLabel: exact.siteLabel,
      isAllSites: exact.isAllSites ?? false,
    };
  }

  // 2. No match — this branch isn't a deployment branch
  return null;
}

/**
 * Get all site mappings for a repo's environment type (e.g., all staging sites).
 * Used when `isAllSites` is true to expand one deployment into per-site records.
 */
export async function getAllSitesForEnvironment(
  repoId: string,
  environment: "staging" | "production" | "canonical",
): Promise<Array<{ siteName: string; siteLabel: string | null }>> {
  const mappings = await db
    .select()
    .from(githubBranchMappings)
    .where(eq(githubBranchMappings.repoId, repoId));

  return mappings
    .filter(
      (m) =>
        m.environment === environment &&
        !m.isAllSites &&
        m.siteName,
    )
    .map((m) => ({
      siteName: m.siteName!,
      siteLabel: m.siteLabel,
    }));
}

/**
 * Check if a branch name indicates a hotfix (bypasses staging).
 */
export function isHotfixBranch(branchName: string): boolean {
  return branchName.startsWith("hotfix/") || branchName.startsWith("hotfix_");
}

/**
 * Get the full pipeline definition for a repo.
 * Returns ordered stages: staging → production → canonical.
 */
export async function getPipelineForRepo(
  repoId: string,
): Promise<
  Array<{
    environment: "staging" | "production" | "canonical";
    sites: Array<{ siteName: string; siteLabel: string | null }>;
  }>
> {
  const mappings = await db
    .select()
    .from(githubBranchMappings)
    .where(eq(githubBranchMappings.repoId, repoId));

  const envOrder: ("staging" | "production" | "canonical")[] = [
    "staging",
    "production",
    "canonical",
  ];

  return envOrder.map((env) => ({
    environment: env,
    sites: mappings
      .filter((m) => m.environment === env && !m.isAllSites && m.siteName)
      .map((m) => ({ siteName: m.siteName!, siteLabel: m.siteLabel })),
  }));
}
