import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  issues,
  boards,
  team_members,
  workloadSnapshots,
} from "@/lib/db/schema";
import { eq, and, ne, gte, inArray, desc } from "drizzle-orm";
import { calculateTaskWeight, WORKLOAD_COUNTED_STATUSES } from "@/lib/workload/snapshots";
import { withResolvedAvatars } from "@/lib/db/helpers";

// --- Helpers ---

function getWorkloadLevel(pct: number): "idle" | "under" | "optimal" | "high" | "over" {
  if (pct === 0) return "idle";
  if (pct < 50) return "under";
  if (pct < 80) return "optimal";
  if (pct <= 100) return "high";
  return "over";
}

function detectBurnoutRisk(trend: { week: string; percentage: number }[]): {
  isAtRisk: boolean;
  consecutiveWeeks: number;
} {
  let consecutive = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].percentage >= 100) consecutive++;
    else break;
  }
  return { isAtRisk: consecutive >= 1, consecutiveWeeks: consecutive };
}

function getTrendDirection(trend: { percentage: number }[]): "up" | "down" | "steady" {
  if (trend.length < 3) return "steady";
  const recent = trend.slice(-2);
  const earlier = trend.slice(-4, -2);
  if (earlier.length === 0) return "steady";
  const recentAvg = recent.reduce((s, t) => s + t.percentage, 0) / recent.length;
  const earlierAvg = earlier.reduce((s, t) => s + t.percentage, 0) / earlier.length;
  const diff = recentAvg - earlierAvg;
  if (diff > 10) return "up";
  if (diff < -10) return "down";
  return "steady";
}

// --- Main Route ---

export async function GET(request: NextRequest) {
  try {
    // Public read-only — no auth required

    const teamParam = request.nextUrl.searchParams.get("team") || "";

    // Step 1: Fetch members + boards in parallel (lightweight queries)
    const [allMembersUnfilteredRaw, trackedBoards] = await Promise.all([
      db.select().from(team_members).where(ne(team_members.status, "departed")),
      db.select().from(boards).where(eq(boards.isTracked, true)),
    ]);
    const allMembersUnfiltered = withResolvedAvatars(allMembersUnfilteredRaw);

    // Derive teams from ALL members before filtering
    const teams = [
      ...new Set(
        allMembersUnfiltered.map((m) => m.teamName).filter((t): t is string => !!t),
      ),
    ].sort();

    // Default to first team when no filter provided (performance: avoid loading all teams)
    const teamFilter = teamParam === "All" ? "" : (teamParam || teams[0] || "");

    const allMembers = teamFilter
      ? allMembersUnfiltered.filter((m) => m.teamName === teamFilter)
      : allMembersUnfiltered;

    const memberIds = allMembers.map((m) => m.id);
    const trackedBoardIds = trackedBoards.map((b) => b.id);
    const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));

    if (memberIds.length === 0 || trackedBoardIds.length === 0) {
      return NextResponse.json({
        members: [], summary: { teamAverage: 0, overCapacityCount: 0, highLoadCount: 0, optimalCount: 0, underLoadCount: 0, idleCount: allMembers.length, burnoutRiskCount: 0, totalActivePoints: 0, totalCapacity: 0 },
        alerts: [], teams, selectedTeam: teamFilter || "All",
      });
    }

    // Step 2: Fetch issues + snapshots in parallel, filtered to team members at DB level
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const countedStatuses = WORKLOAD_COUNTED_STATUSES;

    const [activeIssues, doneIssues, memberSnapshots] = await Promise.all([
      // Active issues assigned to team members only
      db.select().from(issues).where(
        and(
          inArray(issues.boardId, trackedBoardIds),
          inArray(issues.status, [...countedStatuses]),
          inArray(issues.assigneeId, memberIds),
        ),
      ),
      // Done issues in last 7 days for team members only
      db.select().from(issues).where(
        and(
          inArray(issues.boardId, trackedBoardIds),
          eq(issues.status, "done"),
          gte(issues.completedDate, sevenDaysAgoStr),
          inArray(issues.assigneeId, memberIds),
        ),
      ),
      // Snapshots for team members only
      db.select().from(workloadSnapshots).where(
        inArray(workloadSnapshots.memberId, memberIds),
      ).orderBy(desc(workloadSnapshots.weekStart)),
    ]);

    // Build member workload data
    const members = allMembers.map((member) => {
      const memberIssues = activeIssues.filter(
        (i) => i.assigneeId === member.id,
      );

      const activePoints = memberIssues.reduce(
        (sum, i) => sum + calculateTaskWeight(i),
        0,
      );

      const capacity = member.capacity || 15;
      const percentage = Math.round((activePoints / capacity) * 100);
      const level = getWorkloadLevel(percentage);

      // Completed in last 7 days
      const completedCount = doneIssues.filter(
        (i) => i.assigneeId === member.id,
      ).length;

      // Task breakdown for tooltip
      const tasks = memberIssues.slice(0, 10).map((i) => {
        const board = boardMap.get(i.boardId);
        return {
          jiraKey: i.jiraKey,
          title: i.title,
          status: i.status,
          storyPoints: i.storyPoints,
          type: i.type,
          boardKey: board?.jiraKey || "",
          boardColor: board?.color || "#6b7280",
          weight: calculateTaskWeight(i),
        };
      });

      // Weekly trend (last 8 weeks)
      const snapshots = memberSnapshots
        .filter((s) => s.memberId === member.id)
        .slice(0, 8)
        .reverse(); // oldest first

      const trend = snapshots.map((s) => ({
        week: s.weekStart,
        percentage: s.percentage || 0,
      }));

      const { isAtRisk, consecutiveWeeks } = detectBurnoutRisk(trend);
      const trendDirection = getTrendDirection(trend);

      return {
        id: member.id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        teamName: member.teamName,
        capacity,
        status: member.status,
        assignedCount: memberIssues.length,
        activePoints: Math.round(activePoints * 10) / 10,
        completedCount,
        percentage,
        level,
        tasks,
        totalTaskCount: memberIssues.length,
        trend,
        trendDirection,
        burnoutRisk: isAtRisk,
        weeksOverCapacity: consecutiveWeeks,
      };
    });

    // Sort by percentage descending
    members.sort((a, b) => b.percentage - a.percentage);

    // Summary
    const activeOnly = members.filter((m) => m.status === "active");
    const summary = {
      teamAverage:
        activeOnly.length > 0
          ? Math.round(
              activeOnly.reduce((s, m) => s + m.percentage, 0) /
                activeOnly.length,
            )
          : 0,
      overCapacityCount: activeOnly.filter((m) => m.level === "over").length,
      highLoadCount: activeOnly.filter((m) => m.level === "high").length,
      optimalCount: activeOnly.filter((m) => m.level === "optimal").length,
      underLoadCount: activeOnly.filter(
        (m) => m.level === "under",
      ).length,
      idleCount: activeOnly.filter((m) => m.level === "idle").length,
      burnoutRiskCount: activeOnly.filter((m) => m.burnoutRisk).length,
      totalActivePoints: Math.round(
        activeOnly.reduce((s, m) => s + m.activePoints, 0) * 10,
      ) / 10,
      totalCapacity: activeOnly.reduce((s, m) => s + m.capacity, 0),
    };

    // Alerts
    const alerts: {
      type: "over-capacity" | "idle" | "burnout-risk";
      memberId: string;
      memberName: string;
      avatarUrl: string | null;
      percentage: number;
      message: string;
    }[] = [];

    for (const m of members) {
      if (m.level === "over") {
        alerts.push({
          type: "over-capacity",
          memberId: m.id,
          memberName: m.displayName,
          avatarUrl: m.avatarUrl,
          percentage: m.percentage,
          message: `${m.assignedCount} tasks assigned · ${m.activePoints} pts / ${m.capacity} capacity`,
        });
      }
      if (m.burnoutRisk && m.level !== "over") {
        alerts.push({
          type: "burnout-risk",
          memberId: m.id,
          memberName: m.displayName,
          avatarUrl: m.avatarUrl,
          percentage: m.percentage,
          message: `100%+ for ${m.weeksOverCapacity} week${m.weeksOverCapacity > 1 ? "s" : ""} · Monitor closely`,
        });
      }
      if (m.level === "idle" && m.status === "active") {
        alerts.push({
          type: "idle",
          memberId: m.id,
          memberName: m.displayName,
          avatarUrl: m.avatarUrl,
          percentage: 0,
          message: "No tasks assigned · Available for assignment",
        });
      }
    }

    return NextResponse.json({ members, summary, alerts, teams, selectedTeam: teamFilter || "All" });
  } catch (error) {
    console.error("Failed to compute workload:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute workload" },
      { status: 500 },
    );
  }
}
