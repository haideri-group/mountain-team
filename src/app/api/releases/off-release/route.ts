/**
 * GET /api/releases/off-release
 *
 * Returns deployments that landed WITHOUT a live release — hotfixes,
 * issues with no fixVersions, and orphan deployments (jiraKey referenced
 * but no matching issue row).
 *
 * Server-side only: all DB access, no JIRA calls. Called by the /releases
 * client dashboard via fetch(). No auth credentials ever cross the network.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { deployments, issues, boards, team_members, releaseIssues } from "@/lib/db/schema";
import { desc, gte, inArray, isNull } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";
import { withResolvedAvatars } from "@/lib/db/helpers";
import { classifyDeployment, type DeploymentCategory } from "@/lib/releases/classify";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const days = Math.max(1, Math.min(parseInt(url.searchParams.get("days") || "30", 10), 180));
    const categoryFilter = (url.searchParams.get("category") || "all") as DeploymentCategory | "all";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);

    const since = new Date();
    since.setDate(since.getDate() - days);

    // ── All deployments in window ───────────────────────────────────────
    const rawDeps = await db
      .select()
      .from(deployments)
      .where(gte(deployments.deployedAt, since))
      .orderBy(desc(deployments.deployedAt));

    const jiraKeys = [...new Set(rawDeps.map((d) => d.jiraKey))];

    // ── Resolve issues for these deployments ────────────────────────────
    const issueRows = jiraKeys.length
      ? await db
          .select({
            jiraKey: issues.jiraKey,
            title: issues.title,
            type: issues.type,
            status: issues.status,
            fixVersions: issues.fixVersions,
            assigneeId: issues.assigneeId,
            boardId: issues.boardId,
          })
          .from(issues)
          .where(inArray(issues.jiraKey, jiraKeys))
      : [];
    const issueMap = new Map(issueRows.map((i) => [i.jiraKey, i]));

    // ── Known-release memberships (active) ──────────────────────────────
    const membershipRows = jiraKeys.length
      ? await db
          .select({ jiraKey: releaseIssues.jiraKey })
          .from(releaseIssues)
          .where(isNull(releaseIssues.removedAt))
      : [];
    const inReleaseSet = new Set(membershipRows.map((m) => m.jiraKey));

    // ── Boards + assignees ──────────────────────────────────────────────
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

    // ── Classify every deployment ───────────────────────────────────────
    const counts: Record<DeploymentCategory, number> = {
      in_release: 0,
      hotfix: 0,
      untagged: 0,
      orphan: 0,
    };
    const categorised: Array<{
      id: string;
      jiraKey: string;
      category: DeploymentCategory;
      environment: string;
      siteName: string | null;
      siteLabel: string | null;
      branch: string;
      prUrl: string | null;
      commitSha: string | null;
      deployedBy: string | null;
      deployedAt: string;
      isHotfix: boolean;
      issueTitle: string | null;
      issueType: string | null;
      issueStatus: string | null;
      assigneeName: string | null;
      assigneeAvatar: string | null;
      boardKey: string;
      boardColor: string;
    }> = [];

    for (const d of rawDeps) {
      const issue = issueMap.get(d.jiraKey);
      const category = classifyDeployment({
        isHotfix: d.isHotfix ?? false,
        issueExists: !!issue,
        fixVersionsJson: issue?.fixVersions ?? null,
        hasKnownRelease: inReleaseSet.has(d.jiraKey),
      });
      counts[category] += 1;
      if (category === "in_release") continue;

      if (categoryFilter !== "all" && categoryFilter !== category) continue;

      const board = issue ? boardMap.get(issue.boardId) : null;
      const member = issue?.assigneeId ? memberMap.get(issue.assigneeId) : null;

      categorised.push({
        id: d.id,
        jiraKey: d.jiraKey,
        category,
        environment: d.environment,
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        branch: d.branch,
        prUrl: d.prUrl,
        commitSha: d.commitSha,
        deployedBy: d.deployedBy,
        deployedAt: d.deployedAt.toISOString(),
        isHotfix: d.isHotfix ?? false,
        issueTitle: issue?.title ?? null,
        issueType: issue?.type ?? null,
        issueStatus: issue?.status ?? null,
        assigneeName: member?.displayName ?? null,
        assigneeAvatar: member?.avatarUrl ?? null,
        boardKey: board?.jiraKey ?? "",
        boardColor: board?.color ?? "#6b7280",
      });

      if (categorised.length >= limit) break;
    }

    return NextResponse.json({
      windowDays: days,
      counts: {
        hotfix: counts.hotfix,
        untagged: counts.untagged,
        orphan: counts.orphan,
        total: counts.hotfix + counts.untagged + counts.orphan,
      },
      deployments: categorised,
    });
  } catch (error) {
    console.error(
      "Off-release API error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to load off-release deployments" }, { status: 500 });
  }
}
