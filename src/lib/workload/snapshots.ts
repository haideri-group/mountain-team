import { db } from "@/lib/db";
import {
  workloadSnapshots,
  team_members,
  issues,
  boards,
} from "@/lib/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";

// Get Monday of the current week as YYYY-MM-DD
function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return monday.toISOString().split("T")[0];
}

// Calculate task weight based on type, priority, labels, and story points
export function calculateTaskWeight(issue: {
  storyPoints: number | null;
  type: string | null;
  requestPriority: string | null;
  labels: string | null;
}): number {
  // Story points always override if set
  if (issue.storyPoints && issue.storyPoints > 0) {
    return issue.storyPoints;
  }

  // Parse labels
  let labelsList: string[] = [];
  try {
    labelsList = issue.labels ? JSON.parse(issue.labels) : [];
  } catch {
    labelsList = [];
  }

  // WebContent label = 0.5 weight
  if (labelsList.some((l) => l.toLowerCase() === "webcontent")) {
    return 0.5;
  }

  // Bug weight based on Request Priority
  if (issue.type === "bug") {
    switch (issue.requestPriority) {
      case "P1":
        return 3.0;
      case "P2":
        return 2.0;
      case "P3":
        return 1.5;
      default:
        return 1.0; // P4 or no priority
    }
  }

  // Default weight
  return 1.0;
}

// Record workload snapshots for all active members
export async function recordWorkloadSnapshots(): Promise<number> {
  const weekStart = getCurrentWeekStart();

  // Fetch active members
  const activeMembers = await db
    .select()
    .from(team_members)
    .where(ne(team_members.status, "departed"));

  // Fetch tracked boards
  const trackedBoards = await db
    .select()
    .from(boards)
    .where(eq(boards.isTracked, true));
  const trackedBoardIds = trackedBoards.map((b) => b.id);

  if (trackedBoardIds.length === 0) return 0;

  // Fetch all active issues (counted statuses only)
  const countedStatuses = ["todo", "in_progress", "in_review"] as const;
  const activeIssues = await db
    .select()
    .from(issues)
    .where(
      and(
        inArray(issues.boardId, trackedBoardIds),
        inArray(issues.status, [...countedStatuses]),
      ),
    );

  let count = 0;

  for (const member of activeMembers) {
    const memberIssues = activeIssues.filter(
      (i) => i.assigneeId === member.id,
    );

    const activePoints = memberIssues.reduce(
      (sum, i) => sum + calculateTaskWeight(i),
      0,
    );

    const capacity = member.capacity || 15;
    const percentage = Math.round((activePoints / capacity) * 100);

    const id = `ws_${member.id}_${weekStart}`;

    // Upsert: one snapshot per member per week
    await db
      .insert(workloadSnapshots)
      .values({
        id,
        memberId: member.id,
        weekStart,
        percentage,
        activePoints,
        capacity,
        assignedCount: memberIssues.length,
      })
      .onDuplicateKeyUpdate({
        set: {
          percentage,
          activePoints,
          capacity,
          assignedCount: memberIssues.length,
        },
      });

    count++;
  }

  return count;
}
