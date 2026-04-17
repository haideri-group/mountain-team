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

/** Issue types excluded from workload — parent-level items where devs work on sub-tasks */
export const WORKLOAD_EXCLUDED_TYPES = ["story"] as const;

/** Statuses counted toward workload (includes reduced-weight statuses) */
export const WORKLOAD_COUNTED_STATUSES = ["todo", "in_progress", "in_review", "ready_for_testing"] as const;

/** Statuses where dev's active work is done — counted at 10% weight for potential support */
export const WORKLOAD_REDUCED_STATUSES = ["in_review", "ready_for_testing"] as const;
const REDUCED_WEIGHT_MULTIPLIER = 0.1;

// Calculate task weight based on type, priority, labels, story points, and status
export function calculateTaskWeight(issue: {
  storyPoints: number | null;
  type: string | null;
  status?: string | null;
  requestPriority: string | null;
  labels: string | null;
}): number {
  // Parent-level types excluded from workload
  if (issue.type && (WORKLOAD_EXCLUDED_TYPES as readonly string[]).includes(issue.type)) return 0;

  // Calculate base weight
  let weight = 1.0;

  if (issue.storyPoints && issue.storyPoints > 0) {
    // Story points always override
    weight = issue.storyPoints;
  } else {
    // Parse labels
    let labelsList: string[] = [];
    try {
      labelsList = issue.labels ? JSON.parse(issue.labels) : [];
    } catch {
      labelsList = [];
    }

    if (labelsList.some((l) => l.toLowerCase() === "webcontent")) {
      weight = 0.5;
    } else if (issue.type === "bug") {
      // Bug weight based on Request Priority
      switch (issue.requestPriority) {
        case "P1": weight = 3.0; break;
        case "P2": weight = 2.0; break;
        case "P3": weight = 1.5; break;
        default: weight = 1.0;
      }
    }
  }

  // Reduced weight for statuses where dev's active work is done
  if (issue.status && (WORKLOAD_REDUCED_STATUSES as readonly string[]).includes(issue.status)) {
    weight *= REDUCED_WEIGHT_MULTIPLIER;
  }

  return Math.round(weight * 100) / 100; // Avoid floating point noise
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
  const activeIssues = await db
    .select()
    .from(issues)
    .where(
      and(
        inArray(issues.boardId, trackedBoardIds),
        inArray(issues.status, [...WORKLOAD_COUNTED_STATUSES]),
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
