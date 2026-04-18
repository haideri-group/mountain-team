/**
 * GET /api/releases/[id]/notes
 *
 * Returns both internal and customer-facing release notes (markdown).
 * Pure DB read — no JIRA calls — so safe to call on every detail-page view.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jiraReleases, releaseIssues, issues, team_members } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";
import { generateReleaseNotes } from "@/lib/releases/notes-generator";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const [release] = await db
      .select()
      .from(jiraReleases)
      .where(eq(jiraReleases.id, id))
      .limit(1);

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const memberships = await db
      .select({ jiraKey: releaseIssues.jiraKey })
      .from(releaseIssues)
      .where(and(eq(releaseIssues.releaseId, id), isNull(releaseIssues.removedAt)));
    const keys = memberships.map((m) => m.jiraKey);

    const issueRows = keys.length
      ? await db
          .select({
            jiraKey: issues.jiraKey,
            title: issues.title,
            type: issues.type,
            assigneeId: issues.assigneeId,
          })
          .from(issues)
          .where(inArray(issues.jiraKey, keys))
      : [];

    const assigneeIds = [...new Set(issueRows.map((i) => i.assigneeId).filter((v): v is string => !!v))];
    const memberRows = assigneeIds.length
      ? await db
          .select({ id: team_members.id, displayName: team_members.displayName })
          .from(team_members)
          .where(inArray(team_members.id, assigneeIds))
      : [];
    const memberMap = new Map(memberRows.map((m) => [m.id, m.displayName]));

    const notesInput = issueRows.map((i) => ({
      jiraKey: i.jiraKey,
      title: i.title,
      type: i.type,
      assigneeName: i.assigneeId ? memberMap.get(i.assigneeId) || null : null,
    }));

    const notes = generateReleaseNotes(
      {
        name: release.name,
        projectKey: release.projectKey,
        description: release.description,
        releaseDate: release.releaseDate,
        released: release.released,
      },
      notesInput,
    );

    return NextResponse.json({
      name: release.name,
      projectKey: release.projectKey,
      issueCount: issueRows.length,
      internal: notes.internal,
      customer: notes.customer,
    });
  } catch (error) {
    console.error(
      "Release notes API error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to generate release notes" }, { status: 500 });
  }
}
