import crypto from "crypto";
import { db } from "@/lib/db";
import { jiraReleases, releaseIssues } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

function parseVersionNames(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Diff an issue's old and new fixVersions, then write corresponding rows
 * to release_issues. Versions added get a new row; versions removed get
 * their active row stamped with removedAt = now (soft-remove, preserves
 * the audit trail).
 *
 * Non-fatal: if a release row doesn't yet exist in jira_releases (e.g.,
 * race with cron release sync), the version is silently skipped. The next
 * release sync will create it; the next issue update will pick up the
 * link via this same function.
 */
export async function syncReleaseIssuesForIssue(
  jiraKey: string,
  oldFixVersionsJson: string | null,
  newFixVersionsJson: string | null,
  projectKey: string,
): Promise<void> {
  try {
    const oldSet = new Set(parseVersionNames(oldFixVersionsJson));
    const newSet = new Set(parseVersionNames(newFixVersionsJson));

    const added: string[] = [];
    const removed: string[] = [];
    for (const name of newSet) if (!oldSet.has(name)) added.push(name);
    for (const name of oldSet) if (!newSet.has(name)) removed.push(name);

    if (added.length === 0 && removed.length === 0) return;

    for (const name of added) {
      const [release] = await db
        .select({ id: jiraReleases.id })
        .from(jiraReleases)
        .where(and(eq(jiraReleases.projectKey, projectKey), eq(jiraReleases.name, name)))
        .limit(1);
      if (!release) continue;

      const [existing] = await db
        .select({ id: releaseIssues.id })
        .from(releaseIssues)
        .where(
          and(
            eq(releaseIssues.releaseId, release.id),
            eq(releaseIssues.jiraKey, jiraKey),
            isNull(releaseIssues.removedAt),
          ),
        )
        .limit(1);
      if (existing) continue;

      await db.insert(releaseIssues).values({
        id: `ri_${crypto.randomBytes(8).toString("hex")}`,
        releaseId: release.id,
        jiraKey,
      });
    }

    for (const name of removed) {
      const [release] = await db
        .select({ id: jiraReleases.id })
        .from(jiraReleases)
        .where(and(eq(jiraReleases.projectKey, projectKey), eq(jiraReleases.name, name)))
        .limit(1);
      if (!release) continue;

      await db
        .update(releaseIssues)
        .set({ removedAt: new Date() })
        .where(
          and(
            eq(releaseIssues.releaseId, release.id),
            eq(releaseIssues.jiraKey, jiraKey),
            isNull(releaseIssues.removedAt),
          ),
        );
    }
  } catch (err) {
    console.warn(
      "syncReleaseIssuesForIssue failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
