import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { team_members, issues, boards, deployments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withResolvedAvatar } from "@/lib/db/helpers";
import { calculateTaskWeight, WORKLOAD_COUNTED_STATUSES } from "@/lib/workload/snapshots";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Fetch member
    const [memberRaw] = await db
      .select()
      .from(team_members)
      .where(eq(team_members.id, id))
      .limit(1);

    if (!memberRaw) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const member = withResolvedAvatar(memberRaw);

    // Fetch tracked boards
    const trackedBoards = await db
      .select()
      .from(boards)
      .where(eq(boards.isTracked, true));

    const trackedBoardIds = trackedBoards.map((b) => b.id);
    const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));

    // Fetch all issues assigned to this member from tracked boards
    let memberIssues: (typeof issues.$inferSelect)[] = [];
    if (trackedBoardIds.length > 0) {
      memberIssues = await db
        .select()
        .from(issues)
        .where(
          and(
            eq(issues.assigneeId, id),
            inArray(issues.boardId, trackedBoardIds),
          ),
        );
    }

    // Build deployment status map
    const issueKeys = memberIssues.map((i) => i.jiraKey);
    const matchingDeployments = issueKeys.length > 0 ? await db
      .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
      .from(deployments)
      .where(inArray(deployments.jiraKey, issueKeys)) : [];

    const deploymentStatusMap = new Map<string, "production" | "staging">();
    for (const d of matchingDeployments) {
      const current = deploymentStatusMap.get(d.jiraKey);
      if (d.environment === "production" || d.environment === "canonical") {
        deploymentStatusMap.set(d.jiraKey, "production");
      } else if (d.environment === "staging" && current !== "production") {
        deploymentStatusMap.set(d.jiraKey, "staging");
      }
    }

    // Enrich issues with board info + deployment status
    const enrichedIssues = memberIssues.map((issue) => {
      const board = boardMap.get(issue.boardId);
      return {
        ...issue,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        boardName: board?.name || "",
        deploymentStatus: deploymentStatusMap.get(issue.jiraKey) || null,
      };
    });

    // Sort by JIRA creation date descending (newest first)
    const allIssuesSorted = [...enrichedIssues].sort((a, b) => {
      const aDate = a.jiraCreatedAt || a.createdAt?.toISOString() || "";
      const bDate = b.jiraCreatedAt || b.createdAt?.toISOString() || "";
      return bDate.localeCompare(aDate);
    });

    // 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const today = new Date().toISOString().split("T")[0];

    // Current task
    const currentIssue =
      enrichedIssues.find((i) => i.status === "in_progress") || null;

    // Queued tasks
    const queuedIssues = enrichedIssues
      .filter((i) => i.status === "todo")
      .sort((a, b) => {
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return a.startDate.localeCompare(b.startDate);
      });

    // In review / ready for testing / ready for live
    const inReviewIssues = enrichedIssues.filter((i) =>
      ["in_review", "ready_for_testing", "ready_for_live"].includes(i.status),
    );

    // Recent done (7 days)
    const recentDone = enrichedIssues
      .filter(
        (i) =>
          i.status === "done" &&
          i.completedDate &&
          i.completedDate >= sevenDaysAgoStr,
      )
      .sort((a, b) =>
        (b.completedDate || "").localeCompare(a.completedDate || ""),
      );

    // Stats
    const totalTasks = enrichedIssues.length;
    const totalDone = enrichedIssues.filter((i) => i.status === "done").length;
    const totalClosed = enrichedIssues.filter(
      (i) => i.status === "closed",
    ).length;

    // On-time delivery
    const doneWithDue = enrichedIssues.filter(
      (i) => i.status === "done" && i.dueDate,
    );
    const onTime = doneWithDue.filter(
      (i) => i.completedDate && i.dueDate && i.completedDate <= i.dueDate,
    ).length;
    const onTimePercentage =
      doneWithDue.length > 0 ? Math.round((onTime / doneWithDue.length) * 100) : 100;

    // Avg cycle time
    const doneTasks = enrichedIssues.filter(
      (i) => i.status === "done" && i.cycleTime,
    );
    const avgCycleTime =
      doneTasks.length > 0
        ? Math.round(
            (doneTasks.reduce((s, i) => s + (i.cycleTime || 0), 0) /
              doneTasks.length) *
              10,
          ) / 10
        : 0;

    // Active points using shared weighted formula
    const capacity = member.capacity || 15;
    const countedStatuses: readonly string[] = WORKLOAD_COUNTED_STATUSES;
    const activePoints = Math.round(
      enrichedIssues
        .filter((i) => countedStatuses.includes(i.status))
        .reduce((sum, i) => sum + calculateTaskWeight(i), 0) * 10,
    ) / 10;
    const workloadPercentage = Math.round((activePoints / capacity) * 100);

    // Overdue count
    const overdueCount = enrichedIssues.filter(
      (i) =>
        i.dueDate &&
        i.dueDate < today &&
        i.status !== "done" &&
        i.status !== "closed",
    ).length;

    // Monthly completion data (last 6 months)
    const monthlyData: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthStr = d.toLocaleDateString("en-GB", { month: "short" });
      const count = enrichedIssues.filter((issue) => {
        if (issue.status !== "done" || !issue.completedDate) return false;
        const cd = new Date(issue.completedDate);
        return cd.getFullYear() === year && cd.getMonth() === month;
      }).length;
      monthlyData.push({ month: monthStr, count });
    }

    // Tenure (for departed)
    let tenure: string | null = null;
    if (member.status === "departed" && member.joinedDate) {
      const endDate = member.departedDate
        ? new Date(member.departedDate)
        : new Date();
      const startDate = new Date(member.joinedDate);
      const years = endDate.getFullYear() - startDate.getFullYear();
      const months = endDate.getMonth() - startDate.getMonth();
      const totalMonths = years * 12 + months;
      const y = Math.floor(totalMonths / 12);
      const m = totalMonths % 12;
      tenure =
        y > 0 ? `${y}y ${m}m` : `${m}m`;
    }

    return NextResponse.json({
      member,
      stats: {
        totalTasks,
        totalDone,
        totalClosed,
        onTimePercentage,
        avgCycleTime,
        activePoints,
        deadlinesMet: onTime,
        deadlinesTotal: doneWithDue.length,
        workloadPercentage,
        overdueCount,
        tenure,
      },
      currentIssue,
      queuedIssues,
      inReviewIssues,
      recentDone,
      allIssues: allIssuesSorted,
      monthlyData,
      boards: trackedBoards.map((b) => ({
        id: b.id,
        jiraKey: b.jiraKey,
        name: b.name,
        color: b.color,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch member profile:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch member profile",
      },
      { status: 500 },
    );
  }
}
