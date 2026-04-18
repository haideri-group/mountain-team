/**
 * Classifies a deployment into one of four categories. Pure function
 * (no DB access) — callers pass in the fields they have, which makes
 * this easy to unit-test and reuse across API routes and backfill jobs.
 *
 *   in_release  — issue has a fixVersion that matches a live release
 *   hotfix      — deployment branch is hotfix/* or hotfix_*
 *   untagged    — issue exists but has no fixVersions at all
 *   orphan      — deployment references a jiraKey that isn't synced into issues
 */

export type DeploymentCategory = "in_release" | "hotfix" | "untagged" | "orphan";

export interface ClassifyInput {
  /** `deployments.isHotfix` */
  isHotfix: boolean;
  /** Whether an `issues` row exists for this deployment's `jiraKey` */
  issueExists: boolean;
  /** Raw JSON string from `issues.fixVersions` — `null`/empty if no row or no tags */
  fixVersionsJson: string | null | undefined;
  /**
   * Whether any fixVersion on the issue currently resolves to a known
   * `jira_releases` row. Passed in by the caller — typically computed
   * once in bulk via a `release_issues` lookup, not per-deployment.
   */
  hasKnownRelease: boolean;
}

export function classifyDeployment(input: ClassifyInput): DeploymentCategory {
  // Hotfix wins — branch-pattern signal overrides fixVersion because
  // a hotfix may be retroactively tagged to a release for reporting.
  if (input.isHotfix) return "hotfix";

  if (!input.issueExists) return "orphan";

  if (input.hasKnownRelease) return "in_release";

  // Issue exists but is not linked to any release we know about.
  // Could be: (a) genuinely untagged, (b) tagged but that release is
  // archived/not yet synced. We treat both as `untagged` — fixing the
  // gap is the policy signal we want to surface on the Releases page.
  return "untagged";
}

/**
 * Parse the raw JSON column to a string[] — unused at the moment but
 * exported so callers don't re-implement the JSON.parse dance.
 */
export function parseFixVersionsJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
