import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { deployments, issues, boards, team_members, githubRepos, githubBranchMappings } from "@/lib/db/schema";
import { eq, and, desc, gte, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { withResolvedAvatars } from "@/lib/db/helpers";
import { sanitizeErrorText } from "@/lib/jira/client";
import type { Mismatch, PendingRelease, SiteStatus } from "@/components/deployments/types";
import { APP_TIMEZONE } from "@/lib/config";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPKTDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

function getStartOfWeekPKT(now: Date): Date {
  const dateStr = getPKTDateString(now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  utc.setUTCDate(utc.getUTCDate() - diff);
  const mondayStr = utc.toISOString().split("T")[0];
  return new Date(`${mondayStr}T00:00:00+05:00`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const envFilter = url.searchParams.get("environment") || "";
    const repoFilter = url.searchParams.get("repo") || "";
    const siteFilter = url.searchParams.get("site") || "";
    const boardFilter = url.searchParams.get("board") || "";

    const now = new Date();
    const weekStart = getStartOfWeekPKT(now);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ── Load reference data ────────────────────────────────────────────
    const allBoards = await db
      .select({ id: boards.id, jiraKey: boards.jiraKey, name: boards.name, color: boards.color })
      .from(boards)
      .where(eq(boards.isTracked, true));
    const boardMap = new Map(allBoards.map((b) => [b.id, b]));
    const boardKeyMap = new Map(allBoards.map((b) => [b.jiraKey, b]));

    const allRepos = await db.select().from(githubRepos);
    const repoMap = new Map(allRepos.map((r) => [r.id, r]));

    const allMembers = withResolvedAvatars(
      await db
        .select({
          id: team_members.id,
          displayName: team_members.displayName,
          avatarUrl: team_members.avatarUrl,
        })
        .from(team_members),
    );
    const memberMap = new Map(allMembers.map((m) => [m.id, m]));

    // All configured sites from branch mappings
    const allMappings = await db.select().from(githubBranchMappings);
    const siteNames = [...new Set(allMappings.filter((m) => m.siteName).map((m) => m.siteName!))].sort();

    // ── Fetch all deployments (last 30 days) ───────────────────────────
    let allDeployments = await db
      .select()
      .from(deployments)
      .where(gte(deployments.deployedAt, thirtyDaysAgo))
      .orderBy(desc(deployments.deployedAt));

    // Apply filters
    if (envFilter) allDeployments = allDeployments.filter((d) => d.environment === envFilter);
    if (repoFilter) allDeployments = allDeployments.filter((d) => repoMap.get(d.repoId)?.fullName === repoFilter);
    if (siteFilter) allDeployments = allDeployments.filter((d) => d.siteName === siteFilter);
    if (boardFilter) allDeployments = allDeployments.filter((d) => d.jiraKey.startsWith(boardFilter + "-"));

    // ── Fetch issues for context ───────────────────────────────────────
    const deployedKeys = [...new Set(allDeployments.map((d) => d.jiraKey))];
    const deployedIssues = deployedKeys.length > 0
      ? await db
          .select({
            jiraKey: issues.jiraKey,
            title: issues.title,
            status: issues.status,
            jiraStatusName: issues.jiraStatusName,
            type: issues.type,
            assigneeId: issues.assigneeId,
            boardId: issues.boardId,
            jiraUpdatedAt: issues.jiraUpdatedAt,
          })
          .from(issues)
          .where(inArray(issues.jiraKey, deployedKeys))
      : [];
    const issueMap = new Map(deployedIssues.map((i) => [i.jiraKey, i]));

    // ── Metrics ────────────────────────────────────────────────────────
    const deploymentsThisWeek = allDeployments.filter((d) => d.deployedAt >= weekStart).length;

    // Pending releases: staging but not production
    const stagingKeys = new Set<string>();
    const productionKeys = new Set<string>();
    for (const d of allDeployments) {
      const key = `${d.jiraKey}:${d.siteName || "_"}`;
      if (d.environment === "staging") stagingKeys.add(key);
      if (d.environment === "production" || d.environment === "canonical") productionKeys.add(key);
    }
    const pendingKeys = [...stagingKeys].filter((k) => !productionKeys.has(k));

    // Status mismatches: deployed to production but status not post_live/done/closed
    const EXPECTED_POST_DEPLOY = ["post_live_testing", "done", "closed"];
    const mismatchList: Mismatch[] = [];
    const seenMismatchKeys = new Set<string>();

    for (const d of allDeployments) {
      if (d.environment !== "production") continue;
      const issue = issueMap.get(d.jiraKey);
      if (!issue) continue;
      if (EXPECTED_POST_DEPLOY.includes(issue.status)) continue;
      if (seenMismatchKeys.has(d.jiraKey)) continue;
      seenMismatchKeys.add(d.jiraKey);

      const board = boardMap.get(issue.boardId);
      const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;

      mismatchList.push({
        jiraKey: d.jiraKey,
        title: issue.title,
        status: issue.status,
        jiraStatusName: issue.jiraStatusName,
        issueType: issue.type,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        environment: d.environment,
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        deployedAt: d.deployedAt.toISOString(),
        daysSinceDeployment: daysBetween(d.deployedAt, now),
        type: "production_not_updated" as const,
      });
    }

    // Also flag staging deployments where status is still backlog/todo/in_progress
    const EARLY_STATUSES = ["backlog", "todo", "in_progress"];
    for (const d of allDeployments) {
      if (d.environment !== "staging") continue;
      const issue = issueMap.get(d.jiraKey);
      if (!issue || !EARLY_STATUSES.includes(issue.status)) continue;
      if (seenMismatchKeys.has(d.jiraKey)) continue;
      seenMismatchKeys.add(d.jiraKey);

      const board = boardMap.get(issue.boardId);
      const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;

      mismatchList.push({
        jiraKey: d.jiraKey,
        title: issue.title,
        status: issue.status,
        jiraStatusName: issue.jiraStatusName,
        issueType: issue.type,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        environment: d.environment,
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        deployedAt: d.deployedAt.toISOString(),
        daysSinceDeployment: daysBetween(d.deployedAt, now),
        type: "staging_status_behind" as const,
      });
    }

    // Avg days in staging for pending releases
    const pendingDays: number[] = [];
    const pendingReleases: PendingRelease[] = [];
    const pendingDedup = new Map<string, PendingRelease>();

    for (const d of allDeployments) {
      if (d.environment !== "staging") continue;
      const dedupKey = `${d.jiraKey}:${d.siteName || "_"}`;
      if (productionKeys.has(dedupKey)) continue;
      if (pendingDedup.has(dedupKey)) continue;

      const issue = issueMap.get(d.jiraKey);
      const board = issue ? boardMap.get(issue.boardId) : null;
      const member = issue?.assigneeId ? memberMap.get(issue.assigneeId) : null;
      const dp = daysBetween(d.deployedAt, now);
      pendingDays.push(dp);

      const entry = {
        jiraKey: d.jiraKey,
        title: issue?.title || d.prTitle || "Unknown",
        issueType: issue?.type || null,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || d.jiraKey.split("-")[0],
        boardColor: board?.color || "#6b7280",
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        stagedAt: d.deployedAt.toISOString(),
        daysPending: dp,
      };
      pendingDedup.set(dedupKey, entry);
      pendingReleases.push(entry);
    }
    pendingReleases.sort((a, b) => b.daysPending - a.daysPending);

    const avgDaysInStaging = pendingDays.length > 0
      ? Math.round(pendingDays.reduce((s, d) => s + d, 0) / pendingDays.length)
      : 0;

    // ── Pipeline (tasks by deployment-related statuses) ────────────────
    const PIPELINE_STATUSES = ["ready_for_testing", "ready_for_live", "rolling_out", "post_live_testing"];
    let pipelineIssues = await db
      .select({
        jiraKey: issues.jiraKey,
        title: issues.title,
        status: issues.status,
        jiraStatusName: issues.jiraStatusName,
        type: issues.type,
        assigneeId: issues.assigneeId,
        boardId: issues.boardId,
        jiraUpdatedAt: issues.jiraUpdatedAt,
      })
      .from(issues)
      .where(inArray(issues.status, PIPELINE_STATUSES));

    if (boardFilter) {
      pipelineIssues = pipelineIssues.filter((i) => {
        const board = boardMap.get(i.boardId);
        return board?.jiraKey === boardFilter;
      });
    }

    // Enrich pipeline tasks with deployment info
    const pipelineKeys = pipelineIssues.map((i) => i.jiraKey);
    const pipelineDeployments = pipelineKeys.length > 0
      ? await db
          .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
          .from(deployments)
          .where(inArray(deployments.jiraKey, pipelineKeys))
      : [];
    const deployStatusMap = new Map<string, "production" | "staging" | null>();
    for (const d of pipelineDeployments) {
      const current = deployStatusMap.get(d.jiraKey);
      if (d.environment === "production") deployStatusMap.set(d.jiraKey, "production");
      else if (d.environment === "staging" && current !== "production") deployStatusMap.set(d.jiraKey, "staging");
    }

    function buildPipelineTask(issue: typeof pipelineIssues[0]) {
      const board = boardMap.get(issue.boardId);
      const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;
      const updatedAt = issue.jiraUpdatedAt ? new Date(issue.jiraUpdatedAt) : now;
      return {
        jiraKey: issue.jiraKey,
        title: issue.title,
        status: issue.status,
        jiraStatusName: issue.jiraStatusName,
        issueType: issue.type,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        deploymentStatus: deployStatusMap.get(issue.jiraKey) || null,
        daysInStatus: daysBetween(updatedAt, now),
      };
    }

    const pipeline = {
      readyForTesting: pipelineIssues.filter((i) => i.status === "ready_for_testing").map(buildPipelineTask),
      readyForLive: pipelineIssues.filter((i) => i.status === "ready_for_live").map(buildPipelineTask),
      rollingOut: pipelineIssues.filter((i) => i.status === "rolling_out").map(buildPipelineTask),
      postLiveTesting: pipelineIssues.filter((i) => i.status === "post_live_testing").map(buildPipelineTask),
    };

    // ── Recent deployments (last 30 days, capped at 50) ────────────────
    const recentDeployments = allDeployments.slice(0, 50).map((d) => {
      const issue = issueMap.get(d.jiraKey);
      const repo = repoMap.get(d.repoId);
      const board = issue ? boardMap.get(issue.boardId) : null;
      const boardKey = board?.jiraKey || d.jiraKey.split("-")[0];
      const boardInfo = board || boardKeyMap.get(boardKey);

      return {
        id: d.id,
        jiraKey: d.jiraKey,
        issueTitle: issue?.title || d.prTitle || null,
        environment: d.environment,
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        branch: d.branch,
        prUrl: d.prUrl,
        commitSha: d.commitSha,
        deployedBy: d.deployedBy,
        deployedAt: d.deployedAt.toISOString(),
        isHotfix: d.isHotfix || false,
        repoName: repo?.fullName || "",
        boardKey: boardInfo?.jiraKey || boardKey,
        boardColor: boardInfo?.color || "#6b7280",
      };
    });

    // ── Site overview (latest per site per environment) ─────────────────
    // Only show sites that have deployments matching current filters
    const activeSiteNames = [...new Set(allDeployments.filter((d) => d.siteName).map((d) => d.siteName!))].sort();
    const siteOverview: SiteStatus[] = [];
    for (const siteName of activeSiteNames) {
      const siteDeployments = allDeployments.filter((d) => d.siteName === siteName);
      const latestStaging = siteDeployments.find((d) => d.environment === "staging");
      const latestProd = siteDeployments.find((d) => d.environment === "production");
      const lastDeploy = siteDeployments[0];

      // Find site label from mappings
      const mapping = allMappings.find((m) => m.siteName === siteName);

      siteOverview.push({
        siteName,
        siteLabel: mapping?.siteLabel || null,
        latestStaging: latestStaging ? {
          jiraKey: latestStaging.jiraKey,
          deployedAt: latestStaging.deployedAt.toISOString(),
          branch: latestStaging.branch,
        } : null,
        latestProduction: latestProd ? {
          jiraKey: latestProd.jiraKey,
          deployedAt: latestProd.deployedAt.toISOString(),
          branch: latestProd.branch,
        } : null,
        lastDeployAt: lastDeploy?.deployedAt.toISOString() || null,
      });
    }

    return NextResponse.json({
      metrics: {
        deploymentsThisWeek,
        pendingReleases: pendingReleases.length,
        statusMismatches: mismatchList.length,
        avgDaysInStaging,
      },
      mismatches: mismatchList,
      pipeline,
      pendingReleases,
      recentDeployments,
      siteOverview,
      repos: allRepos.map((r) => ({ id: r.id, fullName: r.fullName })),
      sites: siteNames,
      boards: allBoards.map((b) => ({ jiraKey: b.jiraKey, name: b.name, color: b.color })),
    });
  } catch (error) {
    console.error("Deployments API error:", sanitizeErrorText(error instanceof Error ? error.message : String(error)));
    return NextResponse.json(
      { error: "Failed to load deployment data" },
      { status: 500 },
    );
  }
}
