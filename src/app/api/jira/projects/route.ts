import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isJiraConfigured, fetchJiraProjects } from "@/lib/jira/client";
import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";

// GET /api/jira/projects?startAt=0&maxResults=12&query=
export async function GET(request: NextRequest) {
  try {
    if (!isJiraConfigured()) {
      return NextResponse.json(
        {
          error:
            "JIRA is not configured. Add NEXT_PUBLIC_JIRA_BASE_URL, JIRA_USER_EMAIL, and JIRA_API_TOKEN to your .env file.",
        },
        { status: 503 },
      );
    }

    const { searchParams } = request.nextUrl;
    const startAt = parseInt(searchParams.get("startAt") || "0", 10);
    const maxResults = parseInt(searchParams.get("maxResults") || "12", 10);
    const query = searchParams.get("query") || undefined;

    // Fetch from JIRA with pagination
    const page = await fetchJiraProjects(startAt, maxResults, query);

    // Fetch existing boards from our DB
    const existingBoards = await db.select().from(boards);
    const existingKeys = new Set(existingBoards.map((b) => b.jiraKey));

    // Mark which ones are already added
    const projects = page.projects.map((p) => ({
      ...p,
      alreadyAdded: existingKeys.has(p.key),
      boardId: existingBoards.find((b) => b.jiraKey === p.key)?.id || null,
    }));

    return NextResponse.json({
      projects,
      total: page.total,
      startAt: page.startAt,
      maxResults: page.maxResults,
      isLast: page.isLast,
    });
  } catch (error) {
    console.error("Failed to fetch JIRA projects:", error);
    const message = error instanceof Error ? error.message : "Failed to connect to JIRA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
