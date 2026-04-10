import { NextResponse } from "next/server";
import { isJiraConfigured, fetchJiraProjects } from "@/lib/jira/client";
import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";

// GET /api/jira/projects — Fetch projects from JIRA, mark which are already tracked
export async function GET() {
  try {
    if (!isJiraConfigured()) {
      return NextResponse.json(
        { error: "JIRA is not configured. Add JIRA_BASE_URL, JIRA_USER_EMAIL, and JIRA_API_TOKEN to your .env file." },
        { status: 503 },
      );
    }

    // Fetch from JIRA
    const jiraProjects = await fetchJiraProjects();

    // Fetch existing boards from our DB
    const existingBoards = await db.select().from(boards);
    const existingKeys = new Set(existingBoards.map((b) => b.jiraKey));

    // Mark which ones are already added
    const projects = jiraProjects.map((p) => ({
      ...p,
      alreadyAdded: existingKeys.has(p.key),
      boardId: existingBoards.find((b) => b.jiraKey === p.key)?.id || null,
    }));

    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to fetch JIRA projects:", error);
    const message = error instanceof Error ? error.message : "Failed to connect to JIRA";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
