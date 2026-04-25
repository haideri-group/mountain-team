import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issues, boards, team_members } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { discoverCustomFieldIds } from "@/lib/jira/issues";
import { normalizeIssue } from "@/lib/jira/normalizer";
import { applyCycleTimeLogic, buildIssueUpsertFields } from "@/lib/sync/issue-sync";
import { generateNotificationForIssue } from "@/lib/notifications/generator";
import { refreshReleasesForIssue } from "@/lib/sync/release-sync";
import { reconcileReleaseIssues } from "@/lib/releases/sync-release-issues";
import type { JiraIssueRaw } from "@/lib/jira/issues";
import { sanitizeErrorText } from "@/lib/jira/client";
import { OVERVIEW_CACHE_TAG } from "@/lib/config";

// Helper: log webhook event for diagnostics
async function logWebhook(event: string | null, summary: string, payload?: string) {
  try {
    const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db.execute(
      sql`INSERT INTO webhook_logs (id, source, event, result, payload) VALUES (${id}, 'jira', ${event || 'unknown'}, ${summary}, ${(payload || '').substring(0, 2000)})`,
    );
  } catch { /* non-fatal */ }
}

// Helper: drop the cached /api/overview payload so the next page load
// reflects the webhook event immediately. Best-effort — invalidation
// failures must not propagate (the unstable_cache 30s fallback is the
// safety net), and `next/cache` is a sync-aware import inside an async
// scope so it's loaded lazily.
async function invalidateOverviewCache() {
  try {
    const { revalidateTag } = await import("next/cache");
    // "max" profile = stale-while-revalidate: serves stale immediately,
    // recomputes in background. Single-arg revalidateTag(tag) is
    // deprecated in Next.js 16.
    revalidateTag(OVERVIEW_CACHE_TAG, "max");
  } catch (err) {
    console.error(
      "Overview cache invalidation failed:",
      sanitizeErrorText(err instanceof Error ? err.message : String(err)),
    );
  }
}

// POST /api/webhooks/jira -- Receives JIRA webhook events
export async function POST(request: Request) {
  try {
    // Verify webhook secret (optional but recommended)
    const secret = request.headers.get("x-webhook-secret");
    const expectedSecret = process.env.SYNC_SECRET;
    if (expectedSecret && secret && secret !== expectedSecret) {
      await logWebhook(null, `AUTH FAILED: secret mismatch (got: ${secret?.substring(0, 8)}...)`);
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const payload = await request.json();

    // Log every incoming webhook for diagnostics
    const issueKey = payload.issue?.key || "no-issue";
    const event = payload.webhookEvent || "unknown";
    await logWebhook(event, `Received: ${issueKey}`, JSON.stringify({ event, key: issueKey, timestamp: payload.timestamp }));

    // JIRA sends different event types
    const webhookEvent = payload.webhookEvent as string;
    const issue = payload.issue as JiraIssueRaw | undefined;

    // Only process issue events
    if (!webhookEvent?.startsWith("jira:issue_") || !issue) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Accept issues assigned to tracked team members OR with Frontend label
    const frontendLabel = process.env.JIRA_FRONTEND_LABEL || "Frontend";
    const labels: string[] = issue.fields?.labels || [];
    const hasLabel = labels.includes(frontendLabel);

    const assigneeAccountId = issue.fields?.assignee?.accountId || null;
    let isTeamMember = false;
    if (assigneeAccountId) {
      const [member] = await db
        .select()
        .from(team_members)
        .where(eq(team_members.jiraAccountId, assigneeAccountId))
        .limit(1);
      isTeamMember = !!member;
    }

    if (!hasLabel && !isTeamMember) {
      return NextResponse.json({ ok: true, skipped: true, reason: "not team member and no frontend label" });
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
        await invalidateOverviewCache();
      }

      return NextResponse.json({ ok: true, action: "marked_closed" });
    }

    // For created/updated events, normalize and upsert using shared utilities
    const customFields = await discoverCustomFieldIds();
    const normalized = await normalizeIssue(issue, customFields);

    // Fetch rendered description (webhooks don't include renderedFields)
    let renderedDescription: string | null = normalized.description;
    if (!renderedDescription) {
      try {
        const jiraBase = process.env.NEXT_PUBLIC_JIRA_BASE_URL;
        const jiraEmail = process.env.JIRA_USER_EMAIL;
        const jiraToken = process.env.JIRA_API_TOKEN;
        if (jiraBase && jiraEmail && jiraToken) {
          const descRes = await fetch(
            `${jiraBase}/rest/api/3/issue/${issue.key}?expand=renderedFields&fields=description`,
            {
              headers: {
                Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`,
                Accept: "application/json",
              },
              cache: "no-store",
            },
          );
          if (descRes.ok) {
            const descData = await descRes.json();
            renderedDescription = descData.renderedFields?.description || null;
          }
        }
      } catch {
        // Non-fatal — description will update on next sync
      }
    }

    // Resolve board
    const [board] = await db
      .select()
      .from(boards)
      .where(eq(boards.jiraKey, normalized.projectKey))
      .limit(1);

    if (!board || !board.isTracked) {
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

    // Cycle time + upsert using shared utilities
    const [existing] = await db
      .select()
      .from(issues)
      .where(eq(issues.jiraKey, normalized.jiraKey))
      .limit(1);

    const { completedDate, cycleTime } = applyCycleTimeLogic(normalized, existing);
    const id = existing?.id || `iss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fields = buildIssueUpsertFields(normalized, board.id, assigneeId, completedDate, cycleTime, renderedDescription);

    await db
      .insert(issues)
      .values({ id, jiraKey: normalized.jiraKey, ...fields })
      .onDuplicateKeyUpdate({ set: fields });

    // Drop the cached /api/overview payload IMMEDIATELY after the issues
    // upsert. Doing this *before* the downstream reconciliation/notification
    // steps means a thrown exception in those hooks (e.g. reconcileReleaseIssues
    // failing on a transient DB error) can't leave the cache stale until the
    // 30s fallback expires — the `issues` table has already changed and the
    // cache must reflect that, regardless of whether the downstream work
    // succeeds.
    await invalidateOverviewCache();

    // Auto-discover new releases from fixVersions (also refreshes existing release status)
    try {
      await refreshReleasesForIssue(normalized.fixVersions, normalized.projectKey);
    } catch {
      // Non-fatal — releases will sync on next cron
    }

    // Reconcile the release_issues junction against the now-persisted
    // fixVersions. Idempotent — retries and re-fires of the same webhook
    // converge on the correct state without needing a stable "old" snapshot.
    await reconcileReleaseIssues(
      normalized.jiraKey,
      normalized.fixVersions,
      normalized.projectKey,
    );

    // Generate notification for this issue change
    try {
      await generateNotificationForIssue(
        id,
        normalized.jiraKey,
        normalized.title,
        normalized.status,
        assigneeId,
        normalized.dueDate,
      );
    } catch {
      // Non-fatal
    }

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
