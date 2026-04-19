import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { team_members, issues, boards, deployments } from "@/lib/db/schema";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { withResolvedAvatars } from "@/lib/db/helpers";
import { calculateTaskWeight, WORKLOAD_COUNTED_STATUSES } from "@/lib/workload/snapshots";
import { requirePublicOrSession } from "@/lib/ip/gate";

// Statuses the overview treats as "active". Used both in the SQL filter and in
// the in-memory metrics calc — keep in sync.
const ACTIVE_STATUSES = [
  "backlog",
  "todo",
  "on_hold",
  "in_progress",
  "in_review",
  "ready_for_testing",
  "ready_for_live",
  "rolling_out",
  "post_live_testing",
] as const;

export async function GET(request: Request) {
  try {
    // Guest-readable endpoint — allowed for logged-in users OR for
    // requests from IPs in the admin-managed allowlist.
    const gate = await requirePublicOrSession(request);
    if (!gate.allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all members (exclude departed by default — client can filter)
    const allMembers = withResolvedAvatars(await db.select().from(team_members));

    // Fetch tracked boards
    const trackedBoards = await db
      .select()
      .from(boards)
      .where(eq(boards.isTracked, true));

    const trackedBoardIds = trackedBoards.map((b) => b.id);

    // ── Fetch issues with TWO narrowings ────────────────────────────────
    // 1. Project only columns we actually render / compute on. Previously a
    //    SELECT * pulled `description` (rendered HTML, 5–50 KB per row) and
    //    several other blobs (labels, brands, fixVersions) that nothing on
    //    the overview reads. On 3k+ issues that's tens of MB shipped to
    //    build a page that needs a few hundred KB.
    // 2. Filter to active-or-recently-done. Old done/closed issues
    //    accumulate indefinitely; the overview only shows "recent done"
    //    (last 7 days) and counts total-done for stats that don't need
    //    the row itself. 30 days is a comfortable cushion for that count.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    type IssueRow = {
      id: string;
      jiraKey: string;
      title: string;
      status: string;
      type: "bug" | "story" | "cms_change" | "enhancement" | "task" | "subtask" | null;
      boardId: string;
      assigneeId: string | null;
      startDate: string | null;
      dueDate: string | null;
      completedDate: string | null;
      cycleTime: number | null;
      storyPoints: number | null;
      priority: "highest" | "high" | "medium" | "low" | "lowest" | null;
      requestPriority: string | null;
      labels: string | null;
      jiraCreatedAt: string | null;
    };

    let allIssues: IssueRow[] = [];
    if (trackedBoardIds.length > 0) {
      allIssues = (await db
        .select({
          id: issues.id,
          jiraKey: issues.jiraKey,
          title: issues.title,
          status: issues.status,
          type: issues.type,
          boardId: issues.boardId,
          assigneeId: issues.assigneeId,
          startDate: issues.startDate,
          dueDate: issues.dueDate,
          completedDate: issues.completedDate,
          cycleTime: issues.cycleTime,
          storyPoints: issues.storyPoints,
          priority: issues.priority,
          requestPriority: issues.requestPriority, // calculateTaskWeight
          labels: issues.labels, // calculateTaskWeight
          jiraCreatedAt: issues.jiraCreatedAt,
        })
        .from(issues)
        .where(
          and(
            inArray(issues.boardId, trackedBoardIds),
            or(
              inArray(issues.status, [...ACTIVE_STATUSES]),
              // Recently completed — needed for "recent done" + totalDone
              // counts. Issues done > 30d ago are counted in aggregate via
              // a separate query below if we ever need a lifetime total.
              and(eq(issues.status, "done"), gte(issues.completedDate, thirtyDaysAgoStr)),
              and(eq(issues.status, "closed"), gte(issues.completedDate, thirtyDaysAgoStr)),
            ),
          ),
        )) as IssueRow[];
    }

    // Build board lookup for colors
    const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));

    // Build deployment status lookup per jiraKey (scoped to current issues only)
    const issueKeys = allIssues.map((i) => i.jiraKey);
    const matchingDeployments = issueKeys.length > 0
      ? await db
          .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
          .from(deployments)
          .where(inArray(deployments.jiraKey, issueKeys))
      : [];

    const deploymentStatusMap = new Map<string, "production" | "staging">();
    for (const d of matchingDeployments) {
      const current = deploymentStatusMap.get(d.jiraKey);
      if (d.environment === "production" || d.environment === "canonical") {
        deploymentStatusMap.set(d.jiraKey, "production");
      } else if (d.environment === "staging" && current !== "production") {
        deploymentStatusMap.set(d.jiraKey, "staging");
      }
    }

    // Lifetime done/closed counts per assignee — cheap aggregate (one query,
    // a few dozen rows) that preserves the API contract while letting
    // `allIssues` stay narrowed to active + recent-done.
    const lifetimeCounts = trackedBoardIds.length > 0
      ? await db
          .select({
            assigneeId: issues.assigneeId,
            status: issues.status,
            count: sql<number>`COUNT(*)`,
          })
          .from(issues)
          .where(
            and(
              inArray(issues.boardId, trackedBoardIds),
              inArray(issues.status, ["done", "closed"]),
            ),
          )
          .groupBy(issues.assigneeId, issues.status)
      : [];
    const doneByAssignee = new Map<string, number>();
    const closedByAssignee = new Map<string, number>();
    for (const row of lifetimeCounts) {
      if (!row.assigneeId) continue;
      const n = Number(row.count);
      if (row.status === "done") doneByAssignee.set(row.assigneeId, n);
      else if (row.status === "closed") closedByAssignee.set(row.assigneeId, n);
    }

    // 7 days ago for "recent done"
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    // Build member-with-issues data
    const membersWithIssues = allMembers.map((member) => {
      const memberIssues = allIssues.filter((i) => i.assigneeId === member.id);

      // Current task: first in_progress issue
      const currentIssue = memberIssues.find((i) => i.status === "in_progress") || null;

      // Queued: todo issues sorted by startDate
      const queuedIssues = memberIssues
        .filter((i) => i.status === "todo")
        .sort((a, b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate.localeCompare(b.startDate);
        });

      // Recent done: done in last 7 days
      const recentDone = memberIssues
        .filter(
          (i) =>
            i.status === "done" &&
            i.completedDate &&
            i.completedDate >= sevenDaysAgoStr,
        )
        .sort((a, b) => {
          if (!a.completedDate || !b.completedDate) return 0;
          return b.completedDate.localeCompare(a.completedDate);
        });

      // Preserve lifetime semantics using the aggregate map; `memberIssues`
      // only carries last-30d done/closed so its counts would be incomplete.
      const totalDone = doneByAssignee.get(member.id) || 0;
      const totalClosed = closedByAssignee.get(member.id) || 0;

      // Workload: uses shared weighted formula
      const countedStatuses: readonly string[] = WORKLOAD_COUNTED_STATUSES;
      const activePoints = memberIssues
        .filter((i) => countedStatuses.includes(i.status))
        .reduce((sum, i) => sum + calculateTaskWeight(i), 0);

      const capacity = member.capacity || 15;
      const workloadPercentage = Math.round((activePoints / capacity) * 100);

      // Avg cycle time for done tasks
      const doneTasks = memberIssues.filter((i) => i.status === "done" && i.cycleTime);
      const avgCycleTime =
        doneTasks.length > 0
          ? Math.round((doneTasks.reduce((s, i) => s + (i.cycleTime || 0), 0) / doneTasks.length) * 10) / 10
          : 0;

      // On-time percentage
      const doneWithDue = memberIssues.filter((i) => i.status === "done" && i.dueDate);
      const onTime = doneWithDue.filter(
        (i) => i.completedDate && i.dueDate && i.completedDate <= i.dueDate,
      ).length;
      const onTimePercentage = doneWithDue.length > 0 ? Math.round((onTime / doneWithDue.length) * 100) : 100;

      // Enrich issues with board info
      const enrichIssue = (issue: IssueRow) => {
        const board = boardMap.get(issue.boardId);
        return {
          ...issue,
          boardKey: board?.jiraKey || "",
          boardColor: board?.color || "#6b7280",
          deploymentStatus: deploymentStatusMap.get(issue.jiraKey) || null,
        };
      };

      return {
        ...member,
        currentIssue: currentIssue ? enrichIssue(currentIssue) : null,
        queuedIssues: queuedIssues.map(enrichIssue),
        recentDone: recentDone.map(enrichIssue),
        totalDone,
        totalClosed,
        onTimePercentage,
        avgCycleTime,
        workloadPercentage,
        issueCount: memberIssues.filter((i) => i.status !== "done" && i.status !== "closed").length,
      };
    });

    // Sort by workload descending (highest loaded first)
    membersWithIssues.sort((a, b) => b.workloadPercentage - a.workloadPercentage);

    // Compute overview metrics. `allIssues` is now scoped to active +
    // recent-done, which is the superset every metric below needs — no
    // separate query required.
    const activeSet: ReadonlySet<string> = new Set(ACTIVE_STATUSES);
    const today = new Date().toISOString().split("T")[0];

    const metrics = {
      teamMembers: allMembers.filter((m) => m.status === "active").length,
      activeIssues: allIssues.filter((i) => activeSet.has(i.status)).length,
      inProgress: allIssues.filter((i) => i.status === "in_progress").length,
      overdueTasks: allIssues.filter(
        (i) =>
          i.dueDate &&
          i.dueDate < today &&
          i.status !== "done" &&
          i.status !== "closed",
      ).length,
      overdueChange: 0, // TODO: compute vs last week
    };

    return NextResponse.json(
      {
        members: membersWithIssues,
        metrics,
        boards: trackedBoards.map((b) => ({
          id: b.id,
          jiraKey: b.jiraKey,
          name: b.name,
          color: b.color,
        })),
      },
      {
        headers: {
          // Cache for 30s, serve stale for up to 60s more while revalidating.
          // Overview data moves on webhook-driven syncs, so 30s of staleness
          // is invisible to users but eliminates re-query cost on rapid
          // re-navigation (e.g., clicking between tabs, back-navigation).
          "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch overview data:", error);
    return NextResponse.json(
      { error: "Failed to fetch overview data" },
      { status: 500 },
    );
  }
}
