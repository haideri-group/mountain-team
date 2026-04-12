import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { team_members, issues, boards } from "@/lib/db/schema";
import { like, or, eq, ne } from "drizzle-orm";
import { auth } from "@/auth";

// GET /api/search?q=alex — Search members + issues
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const query = request.nextUrl.searchParams.get("q") || "";
    if (query.length < 2) {
      return NextResponse.json({ members: [], issues: [] });
    }

    const pattern = `%${query}%`;

    // Search members
    const memberResults = await db
      .select()
      .from(team_members)
      .where(
        or(
          like(team_members.displayName, pattern),
          like(team_members.email, pattern),
        ),
      )
      .limit(5);

    // Search issues
    const issueResults = await db
      .select({
        id: issues.id,
        jiraKey: issues.jiraKey,
        title: issues.title,
        status: issues.status,
        assigneeId: issues.assigneeId,
        boardId: issues.boardId,
      })
      .from(issues)
      .where(
        or(
          like(issues.jiraKey, pattern),
          like(issues.title, pattern),
        ),
      )
      .limit(5);

    // Enrich issues with board color + assignee name
    const boardMap = new Map(
      (await db.select().from(boards)).map((b) => [b.id, b]),
    );
    const memberMap = new Map(
      (await db.select().from(team_members)).map((m) => [m.id, m]),
    );

    const enrichedIssues = issueResults.map((issue) => {
      const board = boardMap.get(issue.boardId);
      const assignee = issue.assigneeId
        ? memberMap.get(issue.assigneeId)
        : null;
      return {
        id: issue.id,
        jiraKey: issue.jiraKey,
        title: issue.title,
        status: issue.status,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        assigneeName: assignee?.displayName || null,
      };
    });

    return NextResponse.json({
      members: memberResults.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        email: m.email,
        avatarUrl: m.avatarUrl,
        teamName: m.teamName,
        role: m.role,
        status: m.status,
      })),
      issues: enrichedIssues,
    });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 },
    );
  }
}
