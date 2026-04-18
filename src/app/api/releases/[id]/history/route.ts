/**
 * GET /api/releases/[id]/history
 *
 * Daily snapshot rows (done / in-progress / to-do / staging / production)
 * for one release, ordered oldest-first. Drives the burndown chart.
 *
 * No JIRA calls — pure DB read from `release_daily_snapshots` which is
 * populated by the issue-sync cron post-hook.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { releaseDailySnapshots } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const snapshots = await db
      .select({
        date: releaseDailySnapshots.date,
        done: releaseDailySnapshots.done,
        inProgress: releaseDailySnapshots.inProgress,
        toDo: releaseDailySnapshots.toDo,
        staging: releaseDailySnapshots.staging,
        production: releaseDailySnapshots.production,
      })
      .from(releaseDailySnapshots)
      .where(eq(releaseDailySnapshots.releaseId, id))
      .orderBy(asc(releaseDailySnapshots.date));

    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        date: s.date,
        done: s.done ?? 0,
        inProgress: s.inProgress ?? 0,
        toDo: s.toDo ?? 0,
        staging: s.staging ?? 0,
        production: s.production ?? 0,
      })),
    });
  } catch (error) {
    console.error(
      "Release history API error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to load release history" }, { status: 500 });
  }
}
