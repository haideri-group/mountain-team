import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issues, boards, team_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { discoverCustomFieldIds } from "@/lib/jira/issues";
import { normalizeIssue, calculateCycleTime } from "@/lib/jira/normalizer";
import type { JiraIssueRaw } from "@/lib/jira/issues";

// POST /api/webhooks/jira -- Receives JIRA webhook events
export async function POST(request: Request) {
  try {
    // Verify webhook secret (optional but recommended)
    const secret = request.headers.get("x-webhook-secret");
    const expectedSecret = process.env.SYNC_SECRET;
    if (expectedSecret && secret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const payload = await request.json();

    // JIRA sends different event types
    const webhookEvent = payload.webhookEvent as string;
    const issue = payload.issue as JiraIssueRaw | undefined;

    // Only process issue events
    if (!webhookEvent?.startsWith("jira:issue_") || !issue) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Check if issue has the Frontend label
    const frontendLabel = process.env.JIRA_FRONTEND_LABEL || "Frontend";
    const labels: string[] = issue.fields?.labels || [];
    if (!labels.includes(frontendLabel)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no frontend label" });
    }

    // Handle deletion
    if (webhookEvent === "jira:issue_deleted") {
      // We don't delete issues (preserve history), but mark as closed
      const [existing] = await db
        .select()
        .from(issues)
        .where(eq(issues.jiraKey, issue.key))
        .limit(1);

      if (existing) {
        await db
          .update(issues)
          .set({ status: "closed" })
          .where(eq(issues.id, existing.id));
      }

      return NextResponse.json({ ok: true, action: "marked_closed" });
    }

    // For created/updated events, normalize and upsert
    const customFields = await discoverCustomFieldIds();
    const normalized = normalizeIssue(issue, customFields);

    // Resolve board
    const [board] = await db
      .select()
      .from(boards)
      .where(eq(boards.jiraKey, normalized.projectKey))
      .limit(1);

    if (!board) {
      return NextResponse.json({ ok: true, skipped: true, reason: "board not tracked" });
    }

    // Resolve assignee
    let assigneeId: string | null = null;
    if (normalized.assigneeAccountId) {
      const [member] = await db
        .select()
        .from(team_members)
        .where(eq(team_members.jiraAccountId, normalized.assigneeAccountId))
        .limit(1);
      assigneeId = member?.id || null;
    }

    // Check existing for cycle time logic
    const [existing] = await db
      .select()
      .from(issues)
      .where(eq(issues.jiraKey, normalized.jiraKey))
      .limit(1);

    let { completedDate, cycleTime } = normalized;

    if (existing) {
      const wasDone = existing.status === "done" || existing.status === "closed";
      const nowActive = normalized.status !== "done" && normalized.status !== "closed";
      if (wasDone && nowActive) {
        completedDate = null;
        cycleTime = null;
      }

      const wasActive = existing.status !== "done" && existing.status !== "closed";
      const nowDone = normalized.status === "done" || normalized.status === "closed";
      if (wasActive && nowDone && !completedDate) {
        completedDate = new Date().toISOString().split("T")[0];
        cycleTime = calculateCycleTime(
          normalized.startDate || existing.startDate,
          completedDate,
        );
      }
    }

    const id = existing?.id || `iss_${Date.now()}`;

    await db
      .insert(issues)
      .values({
        id,
        jiraKey: normalized.jiraKey,
        boardId: board.id,
        assigneeId,
        title: normalized.title,
        status: normalized.status,
        priority: normalized.priority,
        type: normalized.type,
        startDate: normalized.startDate,
        dueDate: normalized.dueDate,
        completedDate,
        cycleTime,
        storyPoints: normalized.storyPoints,
        labels: normalized.labels,
        jiraCreatedAt: normalized.jiraCreatedAt,
        jiraUpdatedAt: normalized.jiraUpdatedAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          boardId: board.id,
          assigneeId,
          title: normalized.title,
          status: normalized.status,
          priority: normalized.priority,
          type: normalized.type,
          startDate: normalized.startDate,
          dueDate: normalized.dueDate,
          completedDate,
          cycleTime,
          storyPoints: normalized.storyPoints,
          labels: normalized.labels,
          jiraCreatedAt: normalized.jiraCreatedAt,
          jiraUpdatedAt: normalized.jiraUpdatedAt,
        },
      });

    return NextResponse.json({
      ok: true,
      action: existing ? "updated" : "created",
      jiraKey: normalized.jiraKey,
    });
  } catch (error) {
    console.error("JIRA webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}
