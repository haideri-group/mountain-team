import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jiraReleases, releaseIssues, deployments, issues, users } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";
import { buildReadinessIssueCounts, computeReleaseReadiness } from "@/lib/releases/readiness-compute";
import { computeTeamVelocityIssuesPerDay } from "@/lib/releases/velocity";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const statusFilter = (url.searchParams.get("status") || "unreleased") as "unreleased" | "released" | "all";
    const projectFilter = url.searchParams.get("project") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

    // ── Fetch releases matching filters ─────────────────────────────────
    const whereClauses = [eq(jiraReleases.archived, false)];
    if (statusFilter === "unreleased") whereClauses.push(eq(jiraReleases.released, false));
    if (statusFilter === "released") whereClauses.push(eq(jiraReleases.released, true));
    if (projectFilter) whereClauses.push(eq(jiraReleases.projectKey, projectFilter));

    const rawReleases = await db
      .select()
      .from(jiraReleases)
      .where(and(...whereClauses))
      .orderBy(desc(jiraReleases.releaseDate))
      .limit(limit);

    const releaseIds = rawReleases.map((r) => r.id);

    // ── Resolve owner user names in one query ───────────────────────────
    const ownerIds = rawReleases.map((r) => r.ownerUserId).filter((v): v is string => !!v);
    const owners = ownerIds.length
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o.name || o.email]));

    // ── Fetch release_issues for all returned releases (active rows) ────
    const activeMemberships = releaseIds.length
      ? await db
          .select({
            releaseId: releaseIssues.releaseId,
            jiraKey: releaseIssues.jiraKey,
            addedAt: releaseIssues.addedAt,
          })
          .from(releaseIssues)
          .where(and(inArray(releaseIssues.releaseId, releaseIds), isNull(releaseIssues.removedAt)))
      : [];

    // Map: releaseId → jiraKey[]
    const releaseKeyMap = new Map<string, string[]>();
    for (const m of activeMemberships) {
      const list = releaseKeyMap.get(m.releaseId) || [];
      list.push(m.jiraKey);
      releaseKeyMap.set(m.releaseId, list);
    }

    // ── Fetch deployment coverage for every jiraKey in one query ────────
    const allJiraKeys = [...new Set(activeMemberships.map((m) => m.jiraKey))];
    const releaseDeps = allJiraKeys.length
      ? await db
          .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
          .from(deployments)
          .where(inArray(deployments.jiraKey, allJiraKeys))
      : [];
    const stagingByKey = new Set<string>();
    const productionByKey = new Set<string>();
    for (const d of releaseDeps) {
      if (d.environment === "staging") stagingByKey.add(d.jiraKey);
      if (d.environment === "production" || d.environment === "canonical") productionByKey.add(d.jiraKey);
    }

    // ── Fetch per-issue signals needed for readiness (one batched query) ─
    const issueDetails = allJiraKeys.length
      ? await db
          .select({
            jiraKey: issues.jiraKey,
            status: issues.status,
            assigneeId: issues.assigneeId,
            startDate: issues.startDate,
            jiraCreatedAt: issues.jiraCreatedAt,
          })
          .from(issues)
          .where(inArray(issues.jiraKey, allJiraKeys))
      : [];
    const issueDetailMap = new Map(issueDetails.map((i) => [i.jiraKey, i]));

    // ── Per-release scope-creep counts (added more than a day after release.createdAt) ─
    // Computed from the active memberships we already fetched above.
    const creepByRelease = new Map<string, number>();
    for (const r of rawReleases) {
      if (!r.createdAt) continue;
      const cutoff = new Date(r.createdAt.getTime() + 24 * 60 * 60 * 1000);
      const creepCount = activeMemberships.filter(
        (m) => m.releaseId === r.id && m.addedAt.getTime() > cutoff.getTime(),
      ).length;
      creepByRelease.set(r.id, creepCount);
    }

    // ── Team velocity (one query, reused across all releases) ──────────
    const velocityIssuesPerDay = await computeTeamVelocityIssuesPerDay(28);

    // ── Build release DTOs ──────────────────────────────────────────────
    const now = Date.now();
    const releases = rawReleases.map((r) => {
      const keys = releaseKeyMap.get(r.id) || [];
      const staged = keys.filter((k) => stagingByKey.has(k)).length;
      const production = keys.filter((k) => productionByKey.has(k)).length;

      let daysUntilDue: number | null = null;
      if (r.releaseDate) {
        const target = new Date(`${r.releaseDate}T00:00:00Z`).getTime();
        daysUntilDue = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
      }

      // Per-issue rows for this release, lifted from the batched map
      const issueRowsForRelease = keys
        .map((k) => issueDetailMap.get(k))
        .filter((v): v is NonNullable<typeof v> => !!v)
        .map((i) => ({
          status: i.status,
          assigneeId: i.assigneeId,
          startRef: i.startDate || i.jiraCreatedAt,
        }));
      const issueCounts = buildReadinessIssueCounts(issueRowsForRelease);
      const total =
        issueCounts.done +
        issueCounts.toDo +
        issueCounts.inProgress +
        issueCounts.inReview +
        issueCounts.readyForTesting +
        issueCounts.readyForLive;

      const readinessOut = computeReleaseReadiness({
        release: { releaseDate: r.releaseDate, released: r.released, createdAt: r.createdAt },
        issueCounts,
        coverage: { staging: staged, production, total },
        scopeCreepCount: creepByRelease.get(r.id) || 0,
        velocityIssuesPerDay,
      });

      return {
        id: r.id,
        name: r.name,
        description: r.description,
        projectKey: r.projectKey,
        startDate: r.startDate,
        releaseDate: r.releaseDate,
        released: r.released,
        overdue: r.overdue,
        daysUntilDue,
        issuesDone: r.issuesDone || 0,
        issuesInProgress: r.issuesInProgress || 0,
        issuesToDo: r.issuesToDo || 0,
        issuesTotal: r.issuesTotal || keys.length,
        issuesDeployedStaging: staged,
        issuesDeployedProduction: production,
        memberCount: keys.length,
        lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
        ownerName: r.ownerUserId ? ownerMap.get(r.ownerUserId) || null : null,
        readiness: readinessOut,
      };
    });

    // ── KPI strip ───────────────────────────────────────────────────────
    const activeCount = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(jiraReleases)
      .where(and(eq(jiraReleases.archived, false), eq(jiraReleases.released, false)))
      .then((rows) => Number(rows[0]?.c ?? 0));

    // Scope creep: release_issues added in last 30d to active releases
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeReleaseIds = await db
      .select({ id: jiraReleases.id })
      .from(jiraReleases)
      .where(and(eq(jiraReleases.archived, false), eq(jiraReleases.released, false)))
      .then((rows) => rows.map((r) => r.id));

    let scopeCreepCount = 0;
    if (activeReleaseIds.length > 0) {
      const creepRows = await db
        .select({ c: sql<number>`COUNT(*)` })
        .from(releaseIssues)
        .where(
          and(
            inArray(releaseIssues.releaseId, activeReleaseIds),
            gte(releaseIssues.addedAt, thirtyDaysAgo),
          ),
        );
      scopeCreepCount = Number(creepRows[0]?.c ?? 0);
    }

    // Off-release deploys in last 7 days: hotfix + untagged (no fixVersions)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentDeps = await db
      .select({
        id: deployments.id,
        jiraKey: deployments.jiraKey,
        isHotfix: deployments.isHotfix,
      })
      .from(deployments)
      .where(gte(deployments.deployedAt, sevenDaysAgo));

    const recentDepJiraKeys = [...new Set(recentDeps.map((d) => d.jiraKey))];
    const recentIssues = recentDepJiraKeys.length
      ? await db
          .select({ jiraKey: issues.jiraKey, fixVersions: issues.fixVersions })
          .from(issues)
          .where(inArray(issues.jiraKey, recentDepJiraKeys))
      : [];
    const issueFixVersionMap = new Map(recentIssues.map((i) => [i.jiraKey, i.fixVersions]));

    let offReleaseDeploys7d = 0;
    for (const d of recentDeps) {
      if (d.isHotfix) {
        offReleaseDeploys7d += 1;
        continue;
      }
      const fv = issueFixVersionMap.get(d.jiraKey);
      if (!fv || fv === "[]") offReleaseDeploys7d += 1;
    }

    // Distinct project keys (for filter dropdown)
    const projectRows = await db
      .selectDistinct({ projectKey: jiraReleases.projectKey })
      .from(jiraReleases)
      .where(eq(jiraReleases.archived, false));
    const projects = projectRows.map((p) => p.projectKey).sort();

    return NextResponse.json({
      metrics: {
        activeReleases: activeCount,
        scopeCreepCount,
        offReleaseDeploys7d,
      },
      releases,
      projects,
    });
  } catch (error) {
    console.error(
      "Releases API error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to load releases" }, { status: 500 });
  }
}
