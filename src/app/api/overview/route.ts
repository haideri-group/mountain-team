import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { team_members, issues, boards, deployments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withResolvedAvatars } from "@/lib/db/helpers";
import { calculateTaskWeight, WORKLOAD_COUNTED_STATUSES } from "@/lib/workload/snapshots";

export async function GET() {
  try {
    // Public read-only endpoint — no auth required for GET

    // Fetch all members (exclude departed by default — client can filter)
    const allMembers = withResolvedAvatars(await db.select().from(team_members));

    // Fetch tracked boards
    const trackedBoards = await db
      .select()
      .from(boards)
      .where(eq(boards.isTracked, true));

    const trackedBoardIds = trackedBoards.map((b) => b.id);

    // Fetch all issues from tracked boards
    let allIssues: (typeof issues.$inferSelect)[] = [];
    if (trackedBoardIds.length > 0) {
      allIssues = await db
        .select()
        .from(issues)
        .where(inArray(issues.boardId, trackedBoardIds));
    }

    // Build board lookup for colors
    const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));

    // Build deployment status lookup per jiraKey (scoped to current issues only)
    const issueKeys = allIssues.map((i) => i.jiraKey);
    const matchingDeployments = issueKeys.length > 0
      ? await db
          .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
          .from(deployments)
          .where(inArray(deployments.jiraKey, issueKeys))
      : [];

    const deploymentStatusMap = new Map<string, "production" | "staging">();
    for (const d of matchingDeployments) {
      const current = deploymentStatusMap.get(d.jiraKey);
      if (d.environment === "production" || d.environment === "canonical") {
        deploymentStatusMap.set(d.jiraKey, "production");
      } else if (d.environment === "staging" && current !== "production") {
        deploymentStatusMap.set(d.jiraKey, "staging");
      }
    }

    // 7 days ago for "recent done"
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    // Build member-with-issues data
    const membersWithIssues = allMembers.map((member) => {
      const memberIssues = allIssues.filter((i) => i.assigneeId === member.id);

      // Current task: first in_progress issue
      const currentIssue = memberIssues.find((i) => i.status === "in_progress") || null;

      // Queued: todo issues sorted by startDate
      const queuedIssues = memberIssues
        .filter((i) => i.status === "todo")
        .sort((a, b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate.localeCompare(b.startDate);
        });

      // Recent done: done in last 7 days
      const recentDone = memberIssues
        .filter(
          (i) =>
            i.status === "done" &&
            i.completedDate &&
            i.completedDate >= sevenDaysAgoStr,
        )
        .sort((a, b) => {
          if (!a.completedDate || !b.completedDate) return 0;
          return b.completedDate.localeCompare(a.completedDate);
        });

      const totalDone = memberIssues.filter((i) => i.status === "done").length;
      const totalClosed = memberIssues.filter((i) => i.status === "closed").length;

      // Workload: uses shared weighted formula
      const countedStatuses: readonly string[] = WORKLOAD_COUNTED_STATUSES;
      const activePoints = memberIssues
        .filter((i) => countedStatuses.includes(i.status))
        .reduce((sum, i) => sum + calculateTaskWeight(i), 0);

      const capacity = member.capacity || 15;
      const workloadPercentage = Math.round((activePoints / capacity) * 100);

      // Avg cycle time for done tasks
      const doneTasks = memberIssues.filter((i) => i.status === "done" && i.cycleTime);
      const avgCycleTime =
        doneTasks.length > 0
          ? Math.round((doneTasks.reduce((s, i) => s + (i.cycleTime || 0), 0) / doneTasks.length) * 10) / 10
          : 0;

      // On-time percentage
      const doneWithDue = memberIssues.filter((i) => i.status === "done" && i.dueDate);
      const onTime = doneWithDue.filter(
        (i) => i.completedDate && i.dueDate && i.completedDate <= i.dueDate,
      ).length;
      const onTimePercentage = doneWithDue.length > 0 ? Math.round((onTime / doneWithDue.length) * 100) : 100;

      // Enrich issues with board info
      const enrichIssue = (issue: typeof issues.$inferSelect) => {
        const board = boardMap.get(issue.boardId);
        return {
          ...issue,
          boardKey: board?.jiraKey || "",
          boardColor: board?.color || "#6b7280",
          deploymentStatus: deploymentStatusMap.get(issue.jiraKey) || null,
        };
      };

      return {
        ...member,
        currentIssue: currentIssue ? enrichIssue(currentIssue) : null,
        queuedIssues: queuedIssues.map(enrichIssue),
        recentDone: recentDone.map(enrichIssue),
        totalDone,
        totalClosed,
        onTimePercentage,
        avgCycleTime,
        workloadPercentage,
        issueCount: memberIssues.filter((i) => i.status !== "done" && i.status !== "closed").length,
      };
    });

    // Sort by workload descending (highest loaded first)
    membersWithIssues.sort((a, b) => b.workloadPercentage - a.workloadPercentage);

    // Compute overview metrics
    const activeStatuses = ["backlog", "todo", "on_hold", "in_progress", "in_review", "ready_for_testing", "ready_for_live", "rolling_out", "post_live_testing"];
    const today = new Date().toISOString().split("T")[0];

    const metrics = {
      teamMembers: allMembers.filter((m) => m.status === "active").length,
      activeIssues: allIssues.filter((i) => activeStatuses.includes(i.status)).length,
      inProgress: allIssues.filter((i) => i.status === "in_progress").length,
      overdueTasks: allIssues.filter(
        (i) =>
          i.dueDate &&
          i.dueDate < today &&
          i.status !== "done" &&
          i.status !== "closed",
      ).length,
      overdueChange: 0, // TODO: compute vs last week
    };

    return NextResponse.json({
      members: membersWithIssues,
      metrics,
      boards: trackedBoards.map((b) => ({
        id: b.id,
        jiraKey: b.jiraKey,
        name: b.name,
        color: b.color,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch overview data:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch overview data" },
      { status: 500 },
    );
  }
}
