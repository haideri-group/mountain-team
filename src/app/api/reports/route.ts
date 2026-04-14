import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { issues, boards, team_members } from "@/lib/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { withResolvedAvatars } from "@/lib/db/helpers";

// --- Helpers ---

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "short" });
}

function weekLabel(weekNum: number): string {
  return `W${weekNum}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function dateDiffDays(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function getWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
}

// --- Period calculation ---

function getPeriodDates(period: string): { from: string; to: string; prevFrom: string; prevTo: string; months: number } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let months = 6;

  if (period === "last-month") months = 1;
  else if (period === "last-3-months") months = 3;

  const fromDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const from = fromDate.toISOString().split("T")[0];

  // Previous period for comparison
  const prevToDate = new Date(fromDate.getTime() - 86400000);
  const prevFromDate = new Date(prevToDate.getFullYear(), prevToDate.getMonth() - months + 1, 1);
  const prevFrom = prevFromDate.toISOString().split("T")[0];
  const prevTo = prevToDate.toISOString().split("T")[0];

  return { from, to, prevFrom, prevTo, months };
}

// --- Main Route ---

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const teamFilter = searchParams.get("team") || "";
    const boardFilter = searchParams.get("board") || "";
    const period = searchParams.get("period") || "last-6-months";

    const { from, to, prevFrom, prevTo, months } = getPeriodDates(period);
    const today = new Date().toISOString().split("T")[0];

    // Fetch tracked boards
    const trackedBoards = await db.select().from(boards).where(eq(boards.isTracked, true));
    if (trackedBoards.length === 0) {
      return NextResponse.json({ error: "No tracked boards" }, { status: 200 });
    }

    const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));
    let trackedBoardIds = trackedBoards.map((b) => b.id);

    if (boardFilter) {
      const filtered = trackedBoards.find((b) => b.jiraKey === boardFilter);
      if (filtered) trackedBoardIds = [filtered.id];
    }

    // Fetch all members
    const allMembers = withResolvedAvatars(await db.select().from(team_members));
    const memberMap = new Map(allMembers.map((m) => [m.id, m]));

    // Fetch issues in period
    const periodIssues = await db
      .select()
      .from(issues)
      .where(
        and(
          inArray(issues.boardId, trackedBoardIds),
          gte(issues.jiraCreatedAt, from),
        ),
      );

    // Fetch previous period issues for comparison
    const prevIssues = await db
      .select()
      .from(issues)
      .where(
        and(
          inArray(issues.boardId, trackedBoardIds),
          gte(issues.jiraCreatedAt, prevFrom),
          lte(issues.jiraCreatedAt, prevTo),
        ),
      );

    // Apply team filter
    let filteredIssues = periodIssues;
    let filteredPrevIssues = prevIssues;
    let filteredMembers = allMembers.filter((m) => m.status !== "departed");

    if (teamFilter) {
      const teamMemberIds = new Set(
        allMembers.filter((m) => m.teamName === teamFilter).map((m) => m.id),
      );
      filteredIssues = periodIssues.filter(
        (i) => i.assigneeId && teamMemberIds.has(i.assigneeId),
      );
      filteredPrevIssues = prevIssues.filter(
        (i) => i.assigneeId && teamMemberIds.has(i.assigneeId),
      );
      filteredMembers = allMembers.filter(
        (m) => m.teamName === teamFilter && m.status !== "departed",
      );
    }

    // === METRICS ===

    const doneIssues = filteredIssues.filter((i) => i.status === "done");
    const prevDone = filteredPrevIssues.filter((i) => i.status === "done");

    const tasksCompleted = doneIssues.length;
    const prevTasksCompleted = prevDone.length;
    const tasksCompletedChange =
      prevTasksCompleted > 0
        ? Math.round(((tasksCompleted - prevTasksCompleted) / prevTasksCompleted) * 100)
        : 0;

    const cycleTimes = doneIssues.filter((i) => i.cycleTime).map((i) => i.cycleTime!);
    const avgCycleTime =
      cycleTimes.length > 0
        ? Math.round((cycleTimes.reduce((s, c) => s + c, 0) / cycleTimes.length) * 10) / 10
        : 0;
    const prevCycleTimes = prevDone.filter((i) => i.cycleTime).map((i) => i.cycleTime!);
    const prevAvgCycleTime =
      prevCycleTimes.length > 0
        ? Math.round((prevCycleTimes.reduce((s, c) => s + c, 0) / prevCycleTimes.length) * 10) / 10
        : 0;

    const doneWithDue = doneIssues.filter((i) => i.dueDate);
    const missed = doneWithDue.filter(
      (i) => i.completedDate && i.dueDate && i.completedDate > i.dueDate,
    );
    const deadlinesMissed = missed.length;
    const deadlinesMissedPct =
      doneWithDue.length > 0 ? Math.round((deadlinesMissed / doneWithDue.length) * 1000) / 10 : 0;

    const onTime = doneWithDue.length - deadlinesMissed;
    const onTimePercentage =
      doneWithDue.length > 0 ? Math.round((onTime / doneWithDue.length) * 100) : 100;

    const prevDoneWithDue = prevDone.filter((i) => i.dueDate);
    const prevOnTime = prevDoneWithDue.filter(
      (i) => !i.completedDate || !i.dueDate || i.completedDate <= i.dueDate,
    ).length;
    const prevOnTimePct =
      prevDoneWithDue.length > 0 ? Math.round((prevOnTime / prevDoneWithDue.length) * 100) : 100;

    // === VELOCITY (monthly, by board type) ===

    const velocity: { period: string; prodCount: number; projectCount: number; total: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const label = monthLabel(d);

      const monthDone = doneIssues.filter((issue) => {
        if (!issue.completedDate) return false;
        const cd = new Date(issue.completedDate);
        return cd.getFullYear() === year && cd.getMonth() === month;
      });

      const prodBoard = trackedBoards.find((b) => b.jiraKey === "PROD");
      const prodCount = prodBoard
        ? monthDone.filter((i) => i.boardId === prodBoard.id).length
        : 0;
      const projectCount = monthDone.length - prodCount;

      velocity.push({ period: label, prodCount, projectCount, total: monthDone.length });
    }

    // === BOARD DISTRIBUTION ===

    const usedColors = new Set<string>();
    const goldenAngle = 137.508;
    const boardDistribution = trackedBoards
      .map((b, idx) => {
        let color = b.color || "";
        // Ensure each board gets a distinct color
        if (!color || usedColors.has(color.toLowerCase())) {
          // Generate via golden angle hue distribution
          const hue = (idx * goldenAngle) % 360;
          const h = hue / 360;
          const s = 0.65, l = 0.55;
          const a = s * Math.min(l, 1 - l);
          const f = (n: number) => {
            const k = (n + h * 12) % 12;
            const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * c).toString(16).padStart(2, "0");
          };
          color = `#${f(0)}${f(8)}${f(4)}`;
        }
        usedColors.add(color.toLowerCase());
        return {
          name: b.name,
          key: b.jiraKey,
          count: filteredIssues.filter((i) => i.boardId === b.id && i.status !== "closed").length,
          color,
        };
      })
      .filter((b) => b.count > 0);

    // === TASK TYPE BREAKDOWN ===

    const typeCounts: Record<string, number> = {};
    for (const issue of filteredIssues) {
      if (issue.status === "closed") continue;
      const t = issue.type || "task";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const typeTotal = Object.values(typeCounts).reduce((s, c) => s + c, 0);
    const typeColors: Record<string, string> = {
      bug: "#ff8400",
      story: "#3b82f6",
      cms_change: "#804200",
      enhancement: "#166534",
      task: "#6366f1",
    };
    const taskTypeBreakdown = Object.entries(typeCounts)
      .map(([type, count]) => ({
        type: type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        count,
        percentage: typeTotal > 0 ? Math.round((count / typeTotal) * 100) : 0,
        color: typeColors[type] || "#6b7280",
      }))
      .sort((a, b) => b.count - a.count);

    // === DEADLINE COMPLIANCE ===

    const breakdown: { label: string; count: number }[] = [];
    let late1 = 0, late2_3 = 0, late4plus = 0;
    for (const issue of missed) {
      const daysLate = dateDiffDays(issue.dueDate!, issue.completedDate!);
      if (daysLate <= 1) late1++;
      else if (daysLate <= 3) late2_3++;
      else late4plus++;
    }
    if (late1 > 0) breakdown.push({ label: "1 day late", count: late1 });
    if (late2_3 > 0) breakdown.push({ label: "2-3 days late", count: late2_3 });
    if (late4plus > 0) breakdown.push({ label: "4+ days late", count: late4plus });

    // === DEVELOPER RANKING ===

    const developerRanking = filteredMembers.map((member) => {
      const memberDone = doneIssues.filter((i) => i.assigneeId === member.id);
      const memberWithDue = memberDone.filter((i) => i.dueDate);
      const memberMissed = memberWithDue.filter(
        (i) => i.completedDate && i.dueDate && i.completedDate > i.dueDate,
      );
      const memberCycles = memberDone.filter((i) => i.cycleTime).map((i) => i.cycleTime!);
      const memberAvgCycle =
        memberCycles.length > 0
          ? Math.round((memberCycles.reduce((s, c) => s + c, 0) / memberCycles.length) * 10) / 10
          : 0;
      const memberOnTimePct =
        memberWithDue.length > 0
          ? Math.round(((memberWithDue.length - memberMissed.length) / memberWithDue.length) * 100)
          : 100;

      // Trend: compare current month vs previous month done count
      const now = new Date();
      const curMonth = memberDone.filter((i) => {
        const cd = i.completedDate ? new Date(i.completedDate) : null;
        return cd && cd.getMonth() === now.getMonth() && cd.getFullYear() === now.getFullYear();
      }).length;
      const prevMonth = memberDone.filter((i) => {
        const cd = i.completedDate ? new Date(i.completedDate) : null;
        const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return cd && cd.getMonth() === pm.getMonth() && cd.getFullYear() === pm.getFullYear();
      }).length;
      const trend: "up" | "down" | "steady" =
        curMonth > prevMonth ? "up" : curMonth < prevMonth ? "down" : "steady";

      return {
        memberId: member.id,
        memberName: member.displayName,
        memberInitials: getInitials(member.displayName),
        avatarUrl: member.avatarUrl,
        doneCount: memberDone.length,
        missedCount: memberMissed.length,
        onTimePercentage: memberOnTimePct,
        avgCycleTime: memberAvgCycle,
        trend,
      };
    })
      .filter((d) => d.doneCount > 0)
      .sort((a, b) => b.onTimePercentage - a.onTimePercentage || b.doneCount - a.doneCount);

    // === WEEKLY PULSE (last 6 weeks) ===

    const weeklyPulse: { week: string; created: number; completed: number }[] = [];
    for (let w = 5; w >= 0; w--) {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);

      const ws = weekStart.toISOString().split("T")[0];
      const we = weekEnd.toISOString().split("T")[0];

      const created = filteredIssues.filter(
        (i) => i.jiraCreatedAt && i.jiraCreatedAt >= ws && i.jiraCreatedAt <= we,
      ).length;
      const completed = filteredIssues.filter(
        (i) => i.completedDate && i.completedDate >= ws && i.completedDate <= we,
      ).length;

      weeklyPulse.push({ week: weekLabel(6 - w), created, completed });
    }

    // === TURNAROUND HISTOGRAM ===

    function enrichTask(i: typeof doneIssues[0]) {
      const b = boardMap.get(i.boardId);
      const m = i.assigneeId ? memberMap.get(i.assigneeId) : null;
      return {
        id: i.id,
        jiraKey: i.jiraKey,
        title: i.title,
        status: i.status,
        assigneeName: m?.displayName || "Unassigned",
        boardKey: b?.jiraKey || "",
        boardColor: b?.color || "#6b7280",
        cycleTime: i.cycleTime,
        completedDate: i.completedDate,
      };
    }

    const buckets = {
      under1: [] as ReturnType<typeof enrichTask>[],
      d1_2: [] as ReturnType<typeof enrichTask>[],
      d3_5: [] as ReturnType<typeof enrichTask>[],
      over5: [] as ReturnType<typeof enrichTask>[],
    };
    for (const issue of doneIssues) {
      if (!issue.cycleTime) continue;
      const t = enrichTask(issue);
      if (issue.cycleTime < 1) buckets.under1.push(t);
      else if (issue.cycleTime <= 2) buckets.d1_2.push(t);
      else if (issue.cycleTime <= 5) buckets.d3_5.push(t);
      else buckets.over5.push(t);
    }
    const turnaround = [
      { label: "< 1 day", count: buckets.under1.length, color: "#166534", tasks: buckets.under1 },
      { label: "1-2 days", count: buckets.d1_2.length, color: "#ff8400", tasks: buckets.d1_2 },
      { label: "3-5 days", count: buckets.d3_5.length, color: "#804200", tasks: buckets.d3_5 },
      { label: "5+ days", count: buckets.over5.length, color: "#ba1a1a", tasks: buckets.over5 },
    ];

    // === CMS VS DEV (monthly) ===
    // CMS tasks identified by "WebContent" label (not issue type)

    const isWebContent = (issue: { labels: string | null }) => {
      if (!issue.labels) return false;
      try {
        const parsed: string[] = JSON.parse(issue.labels);
        return parsed.some((l) => l.toLowerCase() === "webcontent");
      } catch {
        return false;
      }
    };

    const cmsVsDev: { period: string; cms: number; dev: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();

      const monthDone = doneIssues.filter((issue) => {
        if (!issue.completedDate) return false;
        const cd = new Date(issue.completedDate);
        return cd.getFullYear() === year && cd.getMonth() === month;
      });

      cmsVsDev.push({
        period: monthLabel(d),
        cms: monthDone.filter((i) => isWebContent(i)).length,
        dev: monthDone.filter((i) => !isWebContent(i)).length,
      });
    }

    // === DEVELOPER HEATMAP ===
    // Fetch ALL done issues with completedDate in the period (not filtered by jiraCreatedAt)
    // This ensures tasks created before the period but completed within it are counted

    const allDoneInPeriod = await db
      .select()
      .from(issues)
      .where(
        and(
          inArray(issues.boardId, trackedBoardIds),
          eq(issues.status, "done"),
          gte(issues.completedDate, from),
        ),
      );

    // Apply team filter if needed
    const teamMemberIds = teamFilter
      ? new Set(allMembers.filter((m) => m.teamName === teamFilter).map((m) => m.id))
      : null;
    const heatmapDoneIssues = teamMemberIds
      ? allDoneInPeriod.filter((i) => i.assigneeId && teamMemberIds.has(i.assigneeId))
      : allDoneInPeriod;

    // Sort members by completion count (most active first), include all
    const heatmapMembers = filteredMembers
      .map((m) => ({
        id: m.id,
        name: m.displayName.split(" ")[0] + " " + (m.displayName.split(" ").pop()?.[0] || "") + ".",
        doneCount: heatmapDoneIssues.filter((i) => i.assigneeId === m.id).length,
      }))
      .sort((a, b) => b.doneCount - a.doneCount);

    const heatmapMonths: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      heatmapMonths.push(monthLabel(d));
    }

    interface HeatmapTask {
      jiraKey: string;
      title: string;
      type: string | null;
      storyPoints: number | null;
      completedDate: string | null;
      cycleTime: number | null;
      boardKey: string;
      boardColor: string;
    }
    const heatmapCells: { member: string; memberId: string; month: string; count: number; level: string; tasks: HeatmapTask[] }[] = [];
    for (const hm of heatmapMembers) {
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth();
        const label = monthLabel(d);

        const monthIssues = heatmapDoneIssues.filter((issue) => {
          if (issue.assigneeId !== hm.id || !issue.completedDate) return false;
          const cd = new Date(issue.completedDate);
          return cd.getFullYear() === year && cd.getMonth() === month;
        });

        const tasks: HeatmapTask[] = monthIssues.map((issue) => {
          const board = boardMap.get(issue.boardId);
          return {
            jiraKey: issue.jiraKey,
            title: issue.title,
            type: issue.type,
            storyPoints: issue.storyPoints,
            completedDate: issue.completedDate,
            cycleTime: issue.cycleTime,
            boardKey: board?.jiraKey || "?",
            boardColor: board?.color || "#6b7280",
          };
        });

        const count = monthIssues.length;
        const level = count >= 8 ? "high" : count >= 4 ? "medium" : count >= 1 ? "low" : "minimal";
        heatmapCells.push({ member: hm.name, memberId: hm.id, month: label, count, level, tasks });
      }
    }

    // === BOARD HEALTH ===

    const boardHealth = trackedBoards.map((b) => {
      const boardIssues = filteredIssues.filter((i) => i.boardId === b.id);
      const activeStatuses = ["todo", "on_hold", "in_progress", "in_review", "ready_for_testing", "ready_for_live", "rolling_out", "post_live_testing"];

      return {
        boardKey: b.jiraKey,
        boardName: b.name,
        color: b.color || "#6b7280",
        active: boardIssues.filter((i) => activeStatuses.includes(i.status)).length,
        blocked: boardIssues.filter((i) => {
          const labels = i.labels ? JSON.parse(i.labels) : [];
          return labels.includes("Blocked");
        }).length,
        overdue: boardIssues.filter(
          (i) => i.dueDate && i.dueDate < today && i.status !== "done" && i.status !== "closed",
        ).length,
        done: boardIssues.filter((i) => i.status === "done").length,
      };
    });

    // === MISSED DEADLINE TASKS (for drill-down) ===

    // Done but late
    const missedTasks = missed.map((i) => {
      const board = boardMap.get(i.boardId);
      const member = i.assigneeId ? memberMap.get(i.assigneeId) : null;
      const daysLate = Math.round(dateDiffDays(i.dueDate!, i.completedDate!));
      return {
        id: i.id,
        jiraKey: i.jiraKey,
        title: i.title,
        status: i.status,
        assigneeName: member?.displayName || "Unassigned",
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        dueDate: i.dueDate,
        completedDate: i.completedDate,
        daysLate,
      };
    });

    // Active but overdue (still not done, past due date)
    const activeOverdue = filteredIssues
      .filter(
        (i) =>
          i.dueDate &&
          i.dueDate < today &&
          i.status !== "done" &&
          i.status !== "closed",
      )
      .map((i) => {
        const board = boardMap.get(i.boardId);
        const member = i.assigneeId ? memberMap.get(i.assigneeId) : null;
        const daysLate = Math.round(dateDiffDays(i.dueDate!, today));
        return {
          id: i.id,
          jiraKey: i.jiraKey,
          title: i.title,
          status: i.status,
          assigneeName: member?.displayName || "Unassigned",
          boardKey: board?.jiraKey || "",
          boardColor: board?.color || "#6b7280",
          dueDate: i.dueDate,
          completedDate: null as string | null,
          daysLate,
        };
      });

    const allMissedTasks = [...activeOverdue, ...missedTasks].sort(
      (a, b) => b.daysLate - a.daysLate,
    );

    // === TEAMS ===

    const teams = [
      ...new Set(allMembers.map((m) => m.teamName).filter((t): t is string => !!t)),
    ].sort();

    return NextResponse.json({
      metrics: {
        tasksCompleted,
        tasksCompletedChange,
        avgCycleTime,
        avgCycleTimeChange: Math.round((avgCycleTime - prevAvgCycleTime) * 10) / 10,
        deadlinesMissed,
        deadlinesMissedPct,
        onTimePercentage,
        onTimeChange: onTimePercentage - prevOnTimePct,
      },
      velocity,
      boardDistribution,
      taskTypeBreakdown,
      deadlineCompliance: { met: onTime, missed: deadlinesMissed, breakdown },
      developerRanking,
      weeklyPulse,
      turnaround,
      cmsVsDev,
      heatmap: { members: heatmapMembers.map((m) => ({ id: m.id, name: m.name })), months: heatmapMonths, cells: heatmapCells },
      boardHealth,
      missedDeadlineTasks: allMissedTasks,
      teams,
      boards: trackedBoards.map((b) => ({ jiraKey: b.jiraKey, name: b.name, color: b.color })),
    });
  } catch (error) {
    console.error("Failed to compute reports:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute reports" },
      { status: 500 },
    );
  }
}
