import { db } from "@/lib/db";
import { team_members } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { desc, like, or, and, eq, count } from "drizzle-orm";
import { auth } from "@/auth";

// GET /api/team — List team members with server-side pagination & filtering
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get("pageSize") || "20", 10)));
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const team = searchParams.get("team") || "";

    // Build WHERE conditions
    const conditions = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          like(team_members.displayName, pattern),
          like(team_members.email, pattern),
          like(team_members.jiraAccountId, pattern),
        ),
      );
    }

    if (status && status !== "all") {
      conditions.push(
        eq(team_members.status, status as "active" | "on_leave" | "departed"),
      );
    }

    if (team && team !== "all") {
      conditions.push(eq(team_members.teamName, team));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count for pagination
    const [countResult] = await db
      .select({ total: count() })
      .from(team_members)
      .where(where);

    const total = countResult.total;

    // Get paginated members
    const members = await db
      .select()
      .from(team_members)
      .where(where)
      .orderBy(desc(team_members.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Get metrics (across ALL members, unfiltered)
    const allStatuses = await db
      .select({
        status: team_members.status,
        teamName: team_members.teamName,
      })
      .from(team_members);

    const metrics = {
      active: allStatuses.filter((m) => m.status === "active").length,
      onLeave: allStatuses.filter((m) => m.status === "on_leave").length,
      departed: allStatuses.filter((m) => m.status === "departed").length,
      total: allStatuses.length,
    };

    // Derive team options (only teams that have members)
    const teamOptions = [
      ...new Set(
        allStatuses
          .map((m) => m.teamName)
          .filter((t): t is string => !!t),
      ),
    ].sort();

    return NextResponse.json({
      members,
      totalCount: total,
      metrics,
      teamOptions,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Failed to fetch team members:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 },
    );
  }
}
