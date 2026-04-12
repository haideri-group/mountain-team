import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issues, boards, team_members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await params;

    // Fetch the issue
    const [issue] = await db
      .select()
      .from(issues)
      .where(eq(issues.jiraKey, key.toUpperCase()))
      .limit(1);

    if (!issue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Fetch board
    const [board] = await db
      .select()
      .from(boards)
      .where(eq(boards.id, issue.boardId))
      .limit(1);

    // Fetch assignee
    let assignee = null;
    if (issue.assigneeId) {
      const [member] = await db
        .select()
        .from(team_members)
        .where(eq(team_members.id, issue.assigneeId))
        .limit(1);
      assignee = member || null;
    }

    const today = new Date().toISOString().split("T")[0];
    const isOverdue =
      !!issue.dueDate &&
      issue.dueDate < today &&
      issue.status !== "done" &&
      issue.status !== "closed";
    const isOnTime =
      issue.dueDate && issue.completedDate
        ? issue.completedDate <= issue.dueDate
        : null;

    // Parse labels
    let labels: string[] = [];
    try {
      labels = issue.labels ? JSON.parse(issue.labels) : [];
    } catch {
      labels = [];
    }

    // Days in current status (from jiraUpdatedAt to now)
    const daysInCurrentStatus = issue.jiraUpdatedAt
      ? Math.max(
          0,
          Math.round(
            (Date.now() - new Date(issue.jiraUpdatedAt).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0;

    // === Assignee context ===
    let assigneeStats = { totalDone: 0, avgCycleTime: 0, onTimePercentage: 100 };
    if (issue.assigneeId) {
      const memberIssues = await db
        .select()
        .from(issues)
        .where(eq(issues.assigneeId, issue.assigneeId));

      const done = memberIssues.filter((i) => i.status === "done");
      const doneWithDue = done.filter((i) => i.dueDate);
      const onTime = doneWithDue.filter(
        (i) => i.completedDate && i.dueDate && i.completedDate <= i.dueDate,
      );
      const cycles = done
        .filter((i) => i.cycleTime)
        .map((i) => i.cycleTime!);

      assigneeStats = {
        totalDone: done.length,
        avgCycleTime:
          cycles.length > 0
            ? Math.round(
                (cycles.reduce((s, c) => s + c, 0) / cycles.length) * 10,
              ) / 10
            : 0,
        onTimePercentage:
          doneWithDue.length > 0
            ? Math.round((onTime.length / doneWithDue.length) * 100)
            : 100,
      };
    }

    // === Board context ===
    const boardIssues = await db
      .select()
      .from(issues)
      .where(eq(issues.boardId, issue.boardId));

    const activeStatuses = [
      "todo",
      "in_progress",
      "in_review",
      "ready_for_testing",
      "ready_for_live",
    ];
    const boardDone = boardIssues.filter((i) => i.status === "done");
    const boardCycles = boardDone
      .filter((i) => i.cycleTime)
      .map((i) => i.cycleTime!);
    const boardOverdue = boardIssues.filter(
      (i) =>
        i.dueDate &&
        i.dueDate < today &&
        i.status !== "done" &&
        i.status !== "closed",
    );

    const boardStats = {
      totalOpen: boardIssues.filter((i) => activeStatuses.includes(i.status))
        .length,
      totalDone: boardDone.length,
      avgCycleTime:
        boardCycles.length > 0
          ? Math.round(
              (boardCycles.reduce((s, c) => s + c, 0) / boardCycles.length) *
                10,
            ) / 10
          : 0,
      overdueCount: boardOverdue.length,
    };

    // === Cycle time percentile ===
    let cycleTimePercentile: number | null = null;
    if (issue.cycleTime && boardCycles.length > 1) {
      const faster = boardCycles.filter((c) => c < issue.cycleTime!).length;
      cycleTimePercentile = Math.round(
        (faster / boardCycles.length) * 100,
      );
    }

    return NextResponse.json({
      issue: {
        id: issue.id,
        jiraKey: issue.jiraKey,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        type: issue.type,
        startDate: issue.startDate,
        dueDate: issue.dueDate,
        completedDate: issue.completedDate,
        cycleTime: issue.cycleTime,
        storyPoints: issue.storyPoints,
        labels,
        jiraCreatedAt: issue.jiraCreatedAt,
        jiraUpdatedAt: issue.jiraUpdatedAt,
        boardKey: board?.jiraKey || "",
        boardName: board?.name || "",
        boardColor: board?.color || "#6b7280",
        assigneeId: assignee?.id || null,
        assigneeName: assignee?.displayName || "Unassigned",
        assigneeAvatarUrl: assignee?.avatarUrl || null,
        assigneeInitials: assignee
          ? getInitials(assignee.displayName)
          : "",
        teamName: assignee?.teamName || null,
        isOverdue,
        isOnTime,
      },
      context: {
        assigneeStats,
        boardStats,
        cycleTimePercentile,
      },
      timeline: {
        created: issue.jiraCreatedAt,
        started: issue.startDate,
        due: issue.dueDate,
        completed: issue.completedDate,
        daysInCurrentStatus,
      },
    });
  } catch (error) {
    console.error("Failed to fetch issue detail:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch issue" },
      { status: 500 },
    );
  }
}
