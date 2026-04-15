import { db } from "@/lib/db";
import {
  notifications,
  issues,
  team_members,
  boards,
  dashboardConfig,
} from "@/lib/db/schema";
import { eq, and, ne, lt, inArray } from "drizzle-orm";
import { calculateTaskWeight } from "@/lib/workload/snapshots";

// --- Helpers ---

function today(): string {
  return new Date().toISOString().split("T")[0];
}

async function getConfig() {
  const [config] = await db.select().from(dashboardConfig).limit(1);
  return {
    taskAgingAlerts: config?.taskAgingAlerts ?? true,
    overdueNotifications: config?.overdueNotifications ?? true,
    taskAgingDays: config?.taskAgingDays ?? 3,
  };
}

async function isDuplicate(
  type: string,
  relatedIssueId: string | null,
  relatedMemberId: string | null,
): Promise<boolean> {
  const conditions = [
    eq(notifications.type, type as "aging" | "overdue" | "capacity" | "completed" | "unblocked" | "deployed"),
    eq(notifications.isRead, false),
  ];

  if (relatedIssueId) {
    conditions.push(eq(notifications.relatedIssueId, relatedIssueId));
  }
  if (relatedMemberId) {
    conditions.push(eq(notifications.relatedMemberId, relatedMemberId));
  }

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(...conditions))
    .limit(1);

  return !!existing;
}

async function createNotification(data: {
  type: "aging" | "overdue" | "capacity" | "completed" | "unblocked" | "deployed";
  title: string;
  message: string;
  relatedIssueId?: string | null;
  relatedMemberId?: string | null;
}) {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  await db.insert(notifications).values({
    id,
    type: data.type,
    title: data.title,
    message: data.message,
    relatedIssueId: data.relatedIssueId || null,
    relatedMemberId: data.relatedMemberId || null,
    isRead: false,
  });
}

// --- Post-Sync Generation ---

export async function generateNotificationsFromSync(): Promise<{
  aging: number;
  overdue: number;
  capacity: number;
}> {
  const config = await getConfig();
  const counts = { aging: 0, overdue: 0, capacity: 0 };
  const todayStr = today();

  // Fetch tracked boards
  const trackedBoards = await db
    .select()
    .from(boards)
    .where(eq(boards.isTracked, true));
  const trackedBoardIds = trackedBoards.map((b) => b.id);

  if (trackedBoardIds.length === 0) return counts;

  // Fetch all active issues from tracked boards
  const activeStatuses = [
    "todo",
    "in_progress",
    "in_review",
    "ready_for_testing",
    "ready_for_live",
  ] as const;

  const allIssues = await db
    .select()
    .from(issues)
    .where(
      and(
        inArray(issues.boardId, trackedBoardIds),
        inArray(issues.status, [...activeStatuses]),
      ),
    );

  // Fetch members for capacity check
  const allMembers = await db
    .select()
    .from(team_members)
    .where(ne(team_members.status, "departed"));

  const memberMap = new Map(allMembers.map((m) => [m.id, m]));
  const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));

  // --- Aging Detection ---
  if (config.taskAgingAlerts) {
    const inProgressIssues = allIssues.filter(
      (i) => i.status === "in_progress",
    );

    for (const issue of inProgressIssues) {
      // Calculate days in progress from jiraUpdatedAt or startDate
      const startRef = issue.startDate || issue.jiraCreatedAt;
      if (!startRef) continue;

      const daysInProgress = Math.round(
        (Date.now() - new Date(startRef).getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysInProgress >= config.taskAgingDays) {
        if (await isDuplicate("aging", issue.id, null)) continue;

        const member = issue.assigneeId
          ? memberMap.get(issue.assigneeId)
          : null;
        const board = boardMap.get(issue.boardId);

        await createNotification({
          type: "aging",
          title: `Task aging: ${daysInProgress} days in progress`,
          message: `${issue.jiraKey} · ${issue.title}${member ? ` — ${member.displayName}` : ""}${board ? ` · ${board.jiraKey}` : ""}`,
          relatedIssueId: issue.id,
          relatedMemberId: issue.assigneeId,
        });
        counts.aging++;
      }
    }
  }

  // --- Overdue Detection ---
  if (config.overdueNotifications) {
    const overdueIssues = allIssues.filter(
      (i) => i.dueDate && i.dueDate < todayStr,
    );

    for (const issue of overdueIssues) {
      if (await isDuplicate("overdue", issue.id, null)) continue;

      const member = issue.assigneeId
        ? memberMap.get(issue.assigneeId)
        : null;
      const daysOverdue = Math.round(
        (Date.now() - new Date(issue.dueDate!).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      await createNotification({
        type: "overdue",
        title: "Overdue: deadline passed",
        message: `${issue.jiraKey} · ${issue.title}${member ? ` — ${member.displayName}` : ""} · Due ${issue.dueDate} — ${daysOverdue}d overdue`,
        relatedIssueId: issue.id,
        relatedMemberId: issue.assigneeId,
      });
      counts.overdue++;
    }
  }

  // --- Capacity Detection ---
  for (const member of allMembers) {
    const memberIssues = allIssues.filter(
      (i) => i.assigneeId === member.id,
    );
    const activePoints = memberIssues.reduce(
      (sum, i) => sum + calculateTaskWeight(i),
      0,
    );
    const capacity = member.capacity || 10;
    const percentage = Math.round((activePoints / capacity) * 100);

    if (percentage > 100) {
      if (await isDuplicate("capacity", null, member.id)) continue;

      await createNotification({
        type: "capacity",
        title: `Capacity alert: ${percentage}%`,
        message: `${member.displayName} is at ${percentage}% capacity — ${memberIssues.length} active tasks`,
        relatedMemberId: member.id,
      });
      counts.capacity++;
    }
  }

  return counts;
}

// --- Single Issue Notification (from webhook) ---

export async function generateNotificationForIssue(
  issueId: string,
  jiraKey: string,
  title: string,
  status: string,
  assigneeId: string | null,
  dueDate: string | null,
): Promise<void> {
  const config = await getConfig();
  const todayStr = today();

  // Completed notification
  if (status === "done") {
    await createNotification({
      type: "completed",
      title: "Task completed",
      message: `${jiraKey} · ${title}`,
      relatedIssueId: issueId,
      relatedMemberId: assigneeId,
    });
    return;
  }

  // Overdue check
  if (
    config.overdueNotifications &&
    dueDate &&
    dueDate < todayStr &&
    status !== "done" &&
    status !== "closed"
  ) {
    if (!(await isDuplicate("overdue", issueId, null))) {
      const daysOverdue = Math.round(
        (Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      await createNotification({
        type: "overdue",
        title: "Overdue: deadline passed",
        message: `${jiraKey} · ${title} — ${daysOverdue}d overdue`,
        relatedIssueId: issueId,
        relatedMemberId: assigneeId,
      });
    }
  }
}

// --- Deployment Notification ---

export async function generateDeploymentNotification(
  jiraKey: string,
  environment: string,
  siteName: string | null,
  siteLabel: string | null,
  deployedBy: string | null,
): Promise<void> {
  // Check config
  const [config] = await db.select().from(dashboardConfig).limit(1);
  if (config && config.deploymentNotifications === false) return;

  // Look up issue
  const [issue] = await db
    .select({ id: issues.id, title: issues.title, assigneeId: issues.assigneeId })
    .from(issues)
    .where(eq(issues.jiraKey, jiraKey))
    .limit(1);

  if (!issue) return; // Issue not synced yet

  // Dedup
  if (await isDuplicate("deployed", issue.id, null)) return;

  const envLabel = environment === "production" ? "Production" : environment === "canonical" ? "Main" : "Staging";
  const siteInfo = siteLabel || siteName || "";
  const byInfo = deployedBy ? ` by ${deployedBy}` : "";

  await createNotification({
    type: "deployed",
    title: `Deployed to ${envLabel}${siteInfo ? `: ${siteInfo}` : ""}`,
    message: `${jiraKey} · ${issue.title}${byInfo}`,
    relatedIssueId: issue.id,
    relatedMemberId: issue.assigneeId,
  });
}
