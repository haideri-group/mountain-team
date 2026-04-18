/**
 * Records a daily snapshot row per non-archived release. Piggybacks on the
 * existing issue-sync cron — no dedicated scheduler.
 *
 * Idempotent: if today's row exists (same release + date), it's updated in
 * place via `onDuplicateKeyUpdate`. Running the sync twice the same day is
 * safe and stable.
 *
 * Reads live `jira_releases` status counts (refreshed by release-sync) plus
 * the `release_issues` junction (kept current by the JIRA webhook) joined
 * with `deployments` for staging/production coverage. Zero JIRA API calls —
 * pure DB rollup.
 */
import { db } from "@/lib/db";
import { jiraReleases, releaseIssues, deployments } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { APP_TIMEZONE } from "@/lib/config";

function getTodayPkt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

export async function recordReleaseDailySnapshots(): Promise<{ rowsUpserted: number }> {
  const { releaseDailySnapshots } = await import("@/lib/db/schema");

  const today = getTodayPkt();
  let rowsUpserted = 0;

  // Only snapshot non-archived releases; released ones are still interesting
  // for the burndown curve (the flat tail after shipping).
  const releases = await db
    .select({
      id: jiraReleases.id,
      issuesDone: jiraReleases.issuesDone,
      issuesInProgress: jiraReleases.issuesInProgress,
      issuesToDo: jiraReleases.issuesToDo,
    })
    .from(jiraReleases)
    .where(eq(jiraReleases.archived, false));

  if (releases.length === 0) return { rowsUpserted };

  for (const r of releases) {
    // Per-release deployment coverage — count distinct jiraKeys in staging / production
    const members = await db
      .select({ jiraKey: releaseIssues.jiraKey })
      .from(releaseIssues)
      .where(and(eq(releaseIssues.releaseId, r.id), isNull(releaseIssues.removedAt)));

    let staging = 0;
    let production = 0;
    if (members.length > 0) {
      const keys = members.map((m) => m.jiraKey);
      const deps = await db
        .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
        .from(deployments)
        .where(inArray(deployments.jiraKey, keys));
      const sSet = new Set<string>();
      const pSet = new Set<string>();
      for (const d of deps) {
        if (d.environment === "staging") sSet.add(d.jiraKey);
        if (d.environment === "production" || d.environment === "canonical") pSet.add(d.jiraKey);
      }
      staging = sSet.size;
      production = pSet.size;
    }

    const id = `rds_${r.id}_${today}`;
    await db
      .insert(releaseDailySnapshots)
      .values({
        id,
        releaseId: r.id,
        date: today,
        done: r.issuesDone || 0,
        inProgress: r.issuesInProgress || 0,
        toDo: r.issuesToDo || 0,
        staging,
        production,
      })
      .onDuplicateKeyUpdate({
        set: {
          done: r.issuesDone || 0,
          inProgress: r.issuesInProgress || 0,
          toDo: r.issuesToDo || 0,
          staging,
          production,
        },
      });
    rowsUpserted += 1;
  }

  return { rowsUpserted };
}
