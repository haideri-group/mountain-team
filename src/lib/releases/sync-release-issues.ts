import crypto from "crypto";
import { db } from "@/lib/db";
import { jiraReleases, releaseIssues } from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";

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
 * Concurrency: the whole diff runs inside a single DB transaction. Concurrent
 * adds for the same (releaseId, jiraKey) collide on the `uk_release_issues_active`
 * unique index; the INSERT uses onDuplicateKeyUpdate to no-op on that conflict,
 * so both callers succeed without creating a duplicate active row.
 *
 * Errors are logged (via sanitizeErrorText, since JIRA tokens can surface in
 * SQL driver messages) and re-thrown — callers must treat failure as a real
 * failure so release-membership state can't silently drift.
 */
export async function syncReleaseIssuesForIssue(
  jiraKey: string,
  oldFixVersionsJson: string | null,
  newFixVersionsJson: string | null,
  projectKey: string,
): Promise<void> {
  const oldSet = new Set(parseVersionNames(oldFixVersionsJson));
  const newSet = new Set(parseVersionNames(newFixVersionsJson));

  const added: string[] = [];
  const removed: string[] = [];
  for (const name of newSet) if (!oldSet.has(name)) added.push(name);
  for (const name of oldSet) if (!newSet.has(name)) removed.push(name);

  if (added.length === 0 && removed.length === 0) return;

  try {
    await db.transaction(async (tx) => {
      for (const name of added) {
        const [release] = await tx
          .select({ id: jiraReleases.id })
          .from(jiraReleases)
          .where(and(eq(jiraReleases.projectKey, projectKey), eq(jiraReleases.name, name)))
          .limit(1);
        if (!release) continue;

        // Upsert against uk_release_issues_active. If a concurrent caller won
        // the race, the conflict triggers a no-op update — both callers leave
        // the same single active row behind. Drizzle's MySQL onDuplicateKeyUpdate
        // requires at least one column in `set`; `id = id` is the canonical no-op.
        await tx
          .insert(releaseIssues)
          .values({
            id: `ri_${crypto.randomBytes(8).toString("hex")}`,
            releaseId: release.id,
            jiraKey,
          })
          .onDuplicateKeyUpdate({ set: { id: sql`id` } });
      }

      for (const name of removed) {
        const [release] = await tx
          .select({ id: jiraReleases.id })
          .from(jiraReleases)
          .where(and(eq(jiraReleases.projectKey, projectKey), eq(jiraReleases.name, name)))
          .limit(1);
        if (!release) continue;

        await tx
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
    });
  } catch (err) {
    // Sanitize — SQL driver messages can echo upstream tokens from JIRA responses
    const message = sanitizeErrorText(err instanceof Error ? err.message : String(err));
    console.error("syncReleaseIssuesForIssue failed:", message);
    throw new Error(`release_issues sync failed: ${message}`);
  }
}

/**
 * Idempotent reconciliation: reads the current active junction state for the
 * issue and makes it match `currentFixVersionsJson`. Used by bulk/manual sync
 * where we can't rely on an accurate "old" snapshot (a prior failed diff-based
 * call may have left the issue row persisted with the new value but the
 * junction un-updated; a second diff would see no change and fail to repair).
 *
 * Safe to re-run repeatedly against the same input — the final junction state
 * is fully determined by `currentFixVersionsJson`.
 */
export async function reconcileReleaseIssues(
  jiraKey: string,
  currentFixVersionsJson: string | null,
  projectKey: string,
): Promise<void> {
  const target = new Set(parseVersionNames(currentFixVersionsJson));

  try {
    await db.transaction(async (tx) => {
      // Current active membership for this issue
      const activeRows = await tx
        .select({
          id: releaseIssues.id,
          releaseId: releaseIssues.releaseId,
          name: jiraReleases.name,
          projectKey: jiraReleases.projectKey,
        })
        .from(releaseIssues)
        .innerJoin(jiraReleases, eq(jiraReleases.id, releaseIssues.releaseId))
        .where(and(eq(releaseIssues.jiraKey, jiraKey), isNull(releaseIssues.removedAt)));

      const activeByName = new Map(
        activeRows.filter((r) => r.projectKey === projectKey).map((r) => [r.name, r]),
      );

      // Soft-remove any active rows that no longer match fixVersions
      const toRemove = activeRows.filter(
        (r) => r.projectKey === projectKey && !target.has(r.name),
      );
      if (toRemove.length > 0) {
        await tx
          .update(releaseIssues)
          .set({ removedAt: new Date() })
          .where(inArray(
            releaseIssues.id,
            toRemove.map((r) => r.id),
          ));
      }

      // Insert missing (with upsert-no-op for the concurrent-add race)
      for (const name of target) {
        if (activeByName.has(name)) continue;
        const [release] = await tx
          .select({ id: jiraReleases.id })
          .from(jiraReleases)
          .where(and(eq(jiraReleases.projectKey, projectKey), eq(jiraReleases.name, name)))
          .limit(1);
        if (!release) continue;

        await tx
          .insert(releaseIssues)
          .values({
            id: `ri_${crypto.randomBytes(8).toString("hex")}`,
            releaseId: release.id,
            jiraKey,
          })
          .onDuplicateKeyUpdate({ set: { id: sql`id` } });
      }
    });
  } catch (err) {
    const message = sanitizeErrorText(err instanceof Error ? err.message : String(err));
    console.error("reconcileReleaseIssues failed:", message);
    throw new Error(`release_issues reconcile failed: ${message}`);
  }
}
