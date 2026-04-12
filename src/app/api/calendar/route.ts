import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { issues, boards, team_members } from "@/lib/db/schema";
import { eq, and, or, gte, lte, inArray } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const monthParam = searchParams.get("month"); // YYYY-MM
    const teamFilter = searchParams.get("team") || "";
    const boardFilter = searchParams.get("board") || "";
    const memberFilter = searchParams.get("member") || "";
    const statusFilter = searchParams.get("status") || "";

    // Parse month — default to current month
    let year: number, month: number;
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      [year, month] = monthParam.split("-").map(Number);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    // Calculate month boundaries
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endOfMonth = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Fetch tracked boards
    const trackedBoards = await db
      .select()
      .from(boards)
      .where(eq(boards.isTracked, true));

    if (trackedBoards.length === 0) {
      return NextResponse.json({ events: [], boards: [], members: [], teams: [] });
    }

    const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));
    const trackedBoardIds = trackedBoards.map((b) => b.id);

    // Fetch all team members
    const allMembers = await db.select().from(team_members);
    const memberMap = new Map(allMembers.map((m) => [m.id, m]));

    // Build issue query conditions
    const conditions = [
      inArray(issues.boardId, trackedBoardIds),
      // Issues with dueDate in the month, OR startDate in the month
      or(
        and(gte(issues.dueDate, startOfMonth), lte(issues.dueDate, endOfMonth)),
        and(gte(issues.startDate, startOfMonth), lte(issues.startDate, endOfMonth)),
      ),
    ];

    if (boardFilter) {
      const board = trackedBoards.find((b) => b.jiraKey === boardFilter);
      if (board) conditions.push(eq(issues.boardId, board.id));
    }

    if (memberFilter) {
      conditions.push(eq(issues.assigneeId, memberFilter));
    }

    if (statusFilter) {
      conditions.push(
        eq(issues.status, statusFilter as "todo" | "in_progress" | "in_review" | "ready_for_testing" | "ready_for_live" | "done" | "closed"),
      );
    }

    const monthIssues = await db
      .select()
      .from(issues)
      .where(and(...conditions));

    const today = new Date().toISOString().split("T")[0];

    // Build calendar events
    let events = monthIssues.map((issue) => {
      const board = boardMap.get(issue.boardId);
      const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;
      const displayDate = issue.dueDate || issue.startDate || "";

      const initials = member
        ? member.displayName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase()
        : "";

      return {
        id: issue.id,
        issueKey: issue.jiraKey,
        title: issue.title,
        assigneeId: issue.assigneeId || "",
        assigneeName: member?.displayName || "Unassigned",
        assigneeInitials: initials,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        status: issue.status,
        priority: issue.priority,
        type: issue.type,
        startDate: displayDate,
        endDate: displayDate,
        isOverdue:
          !!issue.dueDate &&
          issue.dueDate < today &&
          issue.status !== "done" &&
          issue.status !== "closed",
        teamName: member?.teamName || null,
      };
    });

    // Apply team filter
    if (teamFilter) {
      events = events.filter((e) => e.teamName === teamFilter);
    }

    // Derive teams from members
    const teams = [
      ...new Set(
        allMembers
          .map((m) => m.teamName)
          .filter((t): t is string => !!t),
      ),
    ].sort();

    // Members list for filter dropdown (active only)
    const memberOptions = allMembers
      .filter((m) => m.status === "active")
      .map((m) => ({
        id: m.id,
        displayName: m.displayName,
        teamName: m.teamName,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({
      events,
      boards: trackedBoards.map((b) => ({
        id: b.id,
        jiraKey: b.jiraKey,
        name: b.name,
        color: b.color,
      })),
      members: memberOptions,
      teams,
    });
  } catch (error) {
    console.error("Failed to fetch calendar data:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch calendar data" },
      { status: 500 },
    );
  }
}
