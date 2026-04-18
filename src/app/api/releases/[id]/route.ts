import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  jiraReleases,
  releaseIssues,
  deployments,
  issues,
  boards,
  team_members,
  users,
} from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";
import { withResolvedAvatars } from "@/lib/db/helpers";
import { buildReadinessIssueCounts, computeReleaseReadiness } from "@/lib/releases/readiness-compute";
import { computeTeamVelocityIssuesPerDay } from "@/lib/releases/velocity";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const [release] = await db
      .select()
      .from(jiraReleases)
      .where(eq(jiraReleases.id, id))
      .limit(1);

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    // Owner
    let ownerName: string | null = null;
    if (release.ownerUserId) {
      const [owner] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, release.ownerUserId))
        .limit(1);
      ownerName = owner?.name || owner?.email || null;
    }

    // Active + soft-removed memberships (removed ones tell the scope-creep story)
    const memberships = await db
      .select({
        jiraKey: releaseIssues.jiraKey,
        addedAt: releaseIssues.addedAt,
        removedAt: releaseIssues.removedAt,
      })
      .from(releaseIssues)
      .where(eq(releaseIssues.releaseId, release.id))
      .orderBy(desc(releaseIssues.addedAt));

    const activeMemberships = memberships.filter((m) => !m.removedAt);
    const activeKeys = activeMemberships.map((m) => m.jiraKey);

    // Issue details + enrichment
    const issueRows = activeKeys.length
      ? await db
          .select({
            jiraKey: issues.jiraKey,
            title: issues.title,
            status: issues.status,
            jiraStatusName: issues.jiraStatusName,
            type: issues.type,
            storyPoints: issues.storyPoints,
            assigneeId: issues.assigneeId,
            boardId: issues.boardId,
            brands: issues.brands,
            startDate: issues.startDate,
            jiraCreatedAt: issues.jiraCreatedAt,
          })
          .from(issues)
          .where(inArray(issues.jiraKey, activeKeys))
      : [];

    const boardIds = [...new Set(issueRows.map((i) => i.boardId))];
    const boardRows = boardIds.length
      ? await db
          .select({ id: boards.id, jiraKey: boards.jiraKey, color: boards.color })
          .from(boards)
          .where(inArray(boards.id, boardIds))
      : [];
    const boardMap = new Map(boardRows.map((b) => [b.id, b]));

    const assigneeIds = [...new Set(issueRows.map((i) => i.assigneeId).filter((v): v is string => !!v))];
    const memberRows = assigneeIds.length
      ? withResolvedAvatars(
          await db
            .select({
              id: team_members.id,
              displayName: team_members.displayName,
              avatarUrl: team_members.avatarUrl,
            })
            .from(team_members)
            .where(inArray(team_members.id, assigneeIds)),
        )
      : [];
    const memberMap = new Map(memberRows.map((m) => [m.id, m]));

    // All deployments touching any issue in the release
    const allDeps = activeKeys.length
      ? await db
          .select()
          .from(deployments)
          .where(inArray(deployments.jiraKey, activeKeys))
          .orderBy(desc(deployments.deployedAt))
      : [];

    // Per-issue deployment status
    const stagingKeys = new Set<string>();
    const productionKeys = new Set<string>();
    const stagingSitesByKey = new Map<string, Set<string>>();
    const productionSitesByKey = new Map<string, Set<string>>();
    for (const d of allDeps) {
      if (d.environment === "staging") {
        stagingKeys.add(d.jiraKey);
        if (d.siteName) {
          const set = stagingSitesByKey.get(d.jiraKey) || new Set<string>();
          set.add(d.siteName);
          stagingSitesByKey.set(d.jiraKey, set);
        }
      }
      if (d.environment === "production" || d.environment === "canonical") {
        productionKeys.add(d.jiraKey);
        if (d.siteName) {
          const set = productionSitesByKey.get(d.jiraKey) || new Set<string>();
          set.add(d.siteName);
          productionSitesByKey.set(d.jiraKey, set);
        }
      }
    }

    const membershipByKey = new Map(activeMemberships.map((m) => [m.jiraKey, m]));

    const enrichedIssues = issueRows.map((i) => {
      const board = boardMap.get(i.boardId);
      const member = i.assigneeId ? memberMap.get(i.assigneeId) : null;
      const m = membershipByKey.get(i.jiraKey);
      const deploymentStatus: "production" | "staging" | null = productionKeys.has(i.jiraKey)
        ? "production"
        : stagingKeys.has(i.jiraKey)
          ? "staging"
          : null;
      return {
        jiraKey: i.jiraKey,
        title: i.title,
        status: i.status,
        jiraStatusName: i.jiraStatusName,
        issueType: i.type,
        storyPoints: i.storyPoints,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        deploymentStatus,
        stagingSites: [...(stagingSitesByKey.get(i.jiraKey) || [])],
        productionSites: [...(productionSitesByKey.get(i.jiraKey) || [])],
        addedToReleaseAt: m ? m.addedAt.toISOString() : null,
      };
    });

    // Chronological deployment log for this release
    const deploymentLog = allDeps.map((d) => ({
      id: d.id,
      jiraKey: d.jiraKey,
      environment: d.environment,
      siteName: d.siteName,
      siteLabel: d.siteLabel,
      branch: d.branch,
      prUrl: d.prUrl,
      commitSha: d.commitSha,
      deployedBy: d.deployedBy,
      deployedAt: d.deployedAt.toISOString(),
      isHotfix: d.isHotfix ?? false,
    }));

    // Timeline milestones (best-effort from deployments log)
    const firstStaging = [...allDeps].reverse().find((d) => d.environment === "staging");
    const firstProduction = [...allDeps]
      .reverse()
      .find((d) => d.environment === "production" || d.environment === "canonical");

    // Scope-creep tracked members
    const scopeCreep = memberships.filter((m) => {
      const createdAt = release.createdAt ? new Date(release.createdAt).getTime() : 0;
      const oneDay = 24 * 60 * 60 * 1000;
      return m.addedAt.getTime() > createdAt + oneDay;
    });

    // Readiness — compute from the same rows we've already loaded
    const stagingCount = activeKeys.filter((k) => stagingKeys.has(k)).length;
    const productionCount = activeKeys.filter((k) => productionKeys.has(k)).length;
    const issueCountsForReadiness = buildReadinessIssueCounts(
      issueRows.map((i) => ({
        status: i.status,
        assigneeId: i.assigneeId,
        startRef: i.startDate || i.jiraCreatedAt,
      })),
    );
    const totalForReadiness =
      issueCountsForReadiness.done +
      issueCountsForReadiness.toDo +
      issueCountsForReadiness.inProgress +
      issueCountsForReadiness.inReview +
      issueCountsForReadiness.readyForTesting +
      issueCountsForReadiness.readyForLive;
    const velocityIssuesPerDay = await computeTeamVelocityIssuesPerDay(28);
    const readinessOut = computeReleaseReadiness({
      release: {
        releaseDate: release.releaseDate,
        released: release.released,
        createdAt: release.createdAt,
      },
      issueCounts: issueCountsForReadiness,
      coverage: { staging: stagingCount, production: productionCount, total: totalForReadiness },
      scopeCreepCount: scopeCreep.filter((m) => !m.removedAt).length,
      velocityIssuesPerDay,
    });

    const isAdmin = session.user.role === "admin";

    return NextResponse.json({
      isAdmin,
      release: {
        id: release.id,
        name: release.name,
        description: release.description,
        projectKey: release.projectKey,
        startDate: release.startDate,
        releaseDate: release.releaseDate,
        released: release.released,
        archived: release.archived,
        overdue: release.overdue,
        issuesDone: release.issuesDone || 0,
        issuesInProgress: release.issuesInProgress || 0,
        issuesToDo: release.issuesToDo || 0,
        issuesTotal: release.issuesTotal || activeKeys.length,
        issuesDeployedStaging: stagingCount,
        issuesDeployedProduction: productionCount,
        lastSyncedAt: release.lastSyncedAt ? release.lastSyncedAt.toISOString() : null,
        createdAt: release.createdAt ? release.createdAt.toISOString() : null,
        ownerName,
        readiness: readinessOut,
      },
      issues: enrichedIssues,
      deployments: deploymentLog,
      timeline: {
        createdAt: release.createdAt ? release.createdAt.toISOString() : null,
        firstStagingAt: firstStaging?.deployedAt.toISOString() || null,
        firstProductionAt: firstProduction?.deployedAt.toISOString() || null,
      },
      scopeCreep: scopeCreep.map((m) => ({
        jiraKey: m.jiraKey,
        addedAt: m.addedAt.toISOString(),
        removedAt: m.removedAt ? m.removedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    console.error(
      "Release detail API error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to load release" }, { status: 500 });
  }
}
