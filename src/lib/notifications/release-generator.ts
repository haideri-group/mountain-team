/**
 * Generates release-scoped notifications. Runs as a post-sync hook.
 *
 * The five types we fire:
 *   - release_overdue       — past due, not released (fires once per release)
 *   - release_ready         — all issues done AND ≥80% staging coverage
 *   - release_deployed      — released=true in JIRA flipped since last run
 *                             OR 100% production coverage reached
 *   - release_scope_changed — new issue added > 1d after release.createdAt
 *                             that we haven't seen yet
 *   - release_stale         — release has unfinished work AND lastSyncedAt
 *                             isn't fresh AND nothing has moved (heuristic:
 *                             ≥3 stale in-progress tasks)
 *
 * Every fire is deduplicated against unread notifications of the same
 * (type, relatedReleaseId) — matches the pattern in `generator.ts`.
 */
import { db } from "@/lib/db";
import {
  notifications,
  jiraReleases,
  releaseIssues,
  deployments,
  issues,
  dashboardConfig,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { buildReadinessIssueCounts, computeReleaseReadiness } from "@/lib/releases/readiness-compute";
import { computeTeamVelocityIssuesPerDay } from "@/lib/releases/velocity";

type ReleaseNotificationType =
  | "release_overdue"
  | "release_ready"
  | "release_deployed"
  | "release_scope_changed"
  | "release_stale";

const RELEASE_TYPES: ReleaseNotificationType[] = [
  "release_overdue",
  "release_ready",
  "release_deployed",
  "release_scope_changed",
  "release_stale",
];

/** Types that should fire at most once per release for the lifetime of the
 *  release. Marking them read should NOT allow a re-fire. */
const ONE_SHOT_TYPES: ReadonlySet<ReleaseNotificationType> = new Set([
  "release_deployed",
  "release_ready",
]);

/** Types that can re-fire after a read if the underlying condition re-emerges. */
const RECURRING_TYPES: ReadonlySet<ReleaseNotificationType> = new Set([
  "release_overdue",
  "release_scope_changed",
  "release_stale",
]);

/**
 * Load existing release-scoped notifications once, expose an in-memory check.
 *
 * One-shot types (ready/deployed) check the FULL history so marking them read
 * doesn't cause re-fire. Recurring types (overdue/scope-changed/stale) check
 * only unread rows so they re-fire if the admin dismissed and the condition
 * still holds.
 */
async function loadExistingKeys(): Promise<Set<string>> {
  const oneShotTypes = [...ONE_SHOT_TYPES] as ReleaseNotificationType[];
  const recurringTypes = [...RECURRING_TYPES] as ReleaseNotificationType[];

  const [oneShotRows, recurringRows] = await Promise.all([
    oneShotTypes.length
      ? db
          .select({ type: notifications.type, releaseId: notifications.relatedReleaseId })
          .from(notifications)
          .where(
            and(
              inArray(notifications.type, oneShotTypes),
              isNotNull(notifications.relatedReleaseId),
            ),
          )
      : Promise.resolve([]),
    recurringTypes.length
      ? db
          .select({ type: notifications.type, releaseId: notifications.relatedReleaseId })
          .from(notifications)
          .where(
            and(
              inArray(notifications.type, recurringTypes),
              eq(notifications.isRead, false),
              isNotNull(notifications.relatedReleaseId),
            ),
          )
      : Promise.resolve([]),
  ]);

  const keys = new Set<string>();
  for (const r of [...oneShotRows, ...recurringRows]) {
    keys.add(`${r.type}:${r.releaseId}`);
  }
  return keys;
}

// Keep backward-compat export name used elsewhere in this file.
const loadExistingUnread = loadExistingKeys;

function dedupKey(type: ReleaseNotificationType, releaseId: string): string {
  return `${type}:${releaseId}`;
}

async function createReleaseNotification(data: {
  type: ReleaseNotificationType;
  title: string;
  message: string;
  releaseId: string;
}) {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  await db.insert(notifications).values({
    id,
    type: data.type,
    title: data.title,
    message: data.message,
    relatedReleaseId: data.releaseId,
    relatedIssueId: null,
    relatedMemberId: null,
    isRead: false,
  });
}

export async function generateReleaseNotifications(): Promise<{
  overdue: number;
  ready: number;
  deployed: number;
  scopeChanged: number;
  stale: number;
}> {
  const counts = { overdue: 0, ready: 0, deployed: 0, scopeChanged: 0, stale: 0 };

  // Respect the same admin toggle that gates deployment notifications — one
  // switch covers "all automated pipeline alerts" from the user's point of view.
  const [config] = await db.select().from(dashboardConfig).limit(1);
  if (config && config.deploymentNotifications === false) return counts;

  const releases = await db
    .select()
    .from(jiraReleases)
    .where(eq(jiraReleases.archived, false));

  if (releases.length === 0) return counts;

  // Single query to check "what's already unread" — feeds all dedup decisions below.
  const existing = await loadExistingUnread();

  // Velocity once, reused for every release's readiness call.
  const velocityIssuesPerDay = await computeTeamVelocityIssuesPerDay(28);
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Batch: all active memberships across releases
  const releaseIds = releases.map((r) => r.id);
  const memberships = await db
    .select({
      releaseId: releaseIssues.releaseId,
      jiraKey: releaseIssues.jiraKey,
      addedAt: releaseIssues.addedAt,
    })
    .from(releaseIssues)
    .where(and(inArray(releaseIssues.releaseId, releaseIds), isNull(releaseIssues.removedAt)));

  const byRelease = new Map<string, typeof memberships>();
  for (const m of memberships) {
    const list = byRelease.get(m.releaseId) || [];
    list.push(m);
    byRelease.set(m.releaseId, list);
  }

  // Batch: per-issue details for readiness
  const allKeys = [...new Set(memberships.map((m) => m.jiraKey))];
  const issueDetails = allKeys.length
    ? await db
        .select({
          jiraKey: issues.jiraKey,
          status: issues.status,
          assigneeId: issues.assigneeId,
          startDate: issues.startDate,
          jiraCreatedAt: issues.jiraCreatedAt,
        })
        .from(issues)
        .where(inArray(issues.jiraKey, allKeys))
    : [];
  const issueMap = new Map(issueDetails.map((i) => [i.jiraKey, i]));

  // Batch: deployment coverage
  const allDeps = allKeys.length
    ? await db
        .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
        .from(deployments)
        .where(inArray(deployments.jiraKey, allKeys))
    : [];
  const stagingSet = new Set<string>();
  const productionSet = new Set<string>();
  for (const d of allDeps) {
    if (d.environment === "staging") stagingSet.add(d.jiraKey);
    if (d.environment === "production" || d.environment === "canonical")
      productionSet.add(d.jiraKey);
  }

  for (const r of releases) {
    const keys = (byRelease.get(r.id) || []).map((m) => m.jiraKey);
    const releaseMemberships = byRelease.get(r.id) || [];

    const issueRows = keys
      .map((k) => issueMap.get(k))
      .filter((v): v is NonNullable<typeof v> => !!v)
      .map((i) => ({
        status: i.status,
        assigneeId: i.assigneeId,
        startRef: i.startDate || i.jiraCreatedAt,
      }));
    const issueCounts = buildReadinessIssueCounts(issueRows);
    const total =
      issueCounts.done +
      issueCounts.toDo +
      issueCounts.inProgress +
      issueCounts.inReview +
      issueCounts.readyForTesting +
      issueCounts.readyForLive;
    const staging = keys.filter((k) => stagingSet.has(k)).length;
    const production = keys.filter((k) => productionSet.has(k)).length;

    // Scope-creep count = memberships whose addedAt is > createdAt + 1d
    const creepCutoff = r.createdAt ? new Date(r.createdAt.getTime() + 86400000) : null;
    const scopeCreepCount = creepCutoff
      ? releaseMemberships.filter((m) => m.addedAt.getTime() > creepCutoff.getTime()).length
      : 0;

    const readiness = computeReleaseReadiness({
      release: { releaseDate: r.releaseDate, released: r.released, createdAt: r.createdAt },
      issueCounts,
      coverage: { staging, production, total },
      scopeCreepCount,
      velocityIssuesPerDay,
    });

    // 1. release_deployed — released just flipped OR 100% production coverage
    if (r.released || (total > 0 && production === total)) {
      if (!existing.has(dedupKey("release_deployed", r.id))) {
        await createReleaseNotification({
          type: "release_deployed",
          title: `Released: ${r.name}`,
          message: `${r.projectKey} · ${r.name} — ${r.released ? "marked released in JIRA" : "100% production coverage"}`,
          releaseId: r.id,
        });
        existing.add(dedupKey("release_deployed", r.id));
        counts.deployed++;
      }
      continue; // a released release skips the other categories
    }

    // 2. release_overdue
    if (readiness.status === "overdue") {
      if (!existing.has(dedupKey("release_overdue", r.id))) {
        await createReleaseNotification({
          type: "release_overdue",
          title: `Overdue: ${r.name}`,
          message: `${r.projectKey} · ${readiness.reason}`,
          releaseId: r.id,
        });
        existing.add(dedupKey("release_overdue", r.id));
        counts.overdue++;
      }
    }

    // 3. release_ready — all issues done AND ≥80% staged
    const allDone = total > 0 && issueCounts.done === total;
    const enoughStaged = total > 0 && staging / total >= 0.8;
    if (allDone && enoughStaged && !r.released) {
      if (!existing.has(dedupKey("release_ready", r.id))) {
        await createReleaseNotification({
          type: "release_ready",
          title: `Ready to ship: ${r.name}`,
          message: `${r.projectKey} · ${issueCounts.done}/${total} done · ${staging}/${total} staged`,
          releaseId: r.id,
        });
        existing.add(dedupKey("release_ready", r.id));
        counts.ready++;
      }
    }

    // 4. release_scope_changed — membership added in the last 24h AND
    //    > 1d after release creation (real scope creep). Copy matches window.
    const recentCreep = releaseMemberships.filter(
      (m) =>
        creepCutoff &&
        m.addedAt.getTime() > creepCutoff.getTime() &&
        m.addedAt.getTime() >= oneDayAgo.getTime(),
    );
    if (recentCreep.length > 0) {
      if (!existing.has(dedupKey("release_scope_changed", r.id))) {
        await createReleaseNotification({
          type: "release_scope_changed",
          title: `Scope changed: ${r.name}`,
          message: `${r.projectKey} · ${recentCreep.length} ${recentCreep.length === 1 ? "issue" : "issues"} added in the last 24h`,
          releaseId: r.id,
        });
        existing.add(dedupKey("release_scope_changed", r.id));
        counts.scopeChanged++;
      }
    }

    // 5. release_stale — 3+ stale in-progress tasks AND no movement in the
    //    last 24h. Without the movement gate an actively-updating release
    //    would keep firing this alert while work was still progressing.
    const lastSync = r.lastSyncedAt ? r.lastSyncedAt.getTime() : null;
    const movedRecently = lastSync === null ? false : lastSync >= oneDayAgo.getTime();
    // "Moved recently" also considers whether any membership changed recently —
    // a just-added / just-removed issue counts as real activity.
    const membershipMoved = releaseMemberships.some(
      (m) => m.addedAt.getTime() >= oneDayAgo.getTime(),
    );
    const isStuck = issueCounts.staleInProgress >= 3 && !movedRecently && !membershipMoved;
    if (isStuck) {
      if (!existing.has(dedupKey("release_stale", r.id))) {
        await createReleaseNotification({
          type: "release_stale",
          title: `Stalled: ${r.name}`,
          message: `${r.projectKey} · ${issueCounts.staleInProgress} tasks stuck in progress for 3+ days, no updates in 24h`,
          releaseId: r.id,
        });
        existing.add(dedupKey("release_stale", r.id));
        counts.stale++;
      }
    }
  }

  return counts;
}
