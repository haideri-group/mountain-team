import { db } from "@/lib/db";
import { issues } from "@/lib/db/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

/**
 * Team throughput in issues/day, averaged over the last N days.
 * Based on actual issues that crossed into `done`, not workload load.
 * Returns `null` when there's no history yet — callers should treat null
 * as "cannot project" rather than zero.
 */
export async function computeTeamVelocityIssuesPerDay(days = 28): Promise<number | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(issues)
    .where(
      and(
        eq(issues.status, "done"),
        isNotNull(issues.completedDate),
        gte(issues.completedDate, cutoffStr),
      ),
    );

  const count = Number(rows[0]?.c ?? 0);
  return count > 0 ? count / days : null;
}
