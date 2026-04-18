/**
 * GET /api/releases/health
 *
 * KPIs for the /reports "Release health" section + weekly-velocity bar
 * over the last 12 weeks. No JIRA API calls — derived from jira_releases,
 * release_issues and deployments already in DB.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jiraReleases, releaseIssues } from "@/lib/db/schema";
import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoWeekKey(d: Date): string {
  // "2026-W16" — Monday-anchored week, UTC
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diff);
  // ISO week number
  const target = new Date(monday);
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    // Releases marked released in the last 90 days.
    // `releaseDate` is the JIRA-set target; when `released=true` we treat
    // `releaseDate` as the actual ship date (best signal we have without
    // a JIRA "markedReleasedAt" timestamp).
    const shipped = await db
      .select({
        id: jiraReleases.id,
        releaseDate: jiraReleases.releaseDate,
      })
      .from(jiraReleases)
      .where(
        and(
          eq(jiraReleases.released, true),
          eq(jiraReleases.archived, false),
          isNotNull(jiraReleases.releaseDate),
          gte(jiraReleases.releaseDate, ymd(ninetyDaysAgo)),
        ),
      );

    // True "on-time %" requires a due-date snapshot captured at release-start.
    // JIRA's `releaseDate` field shifts when the PM pushes the date, so
    // comparing ship-date to today's `releaseDate` always reports 100%.
    // We hold this metric as null until Phase C persists the original due date.
    const onTimePct: number | null = null;
    const avgDaysLate: number | null = null;

    // Scope-creep rate: among active non-archived releases, average late-added
    // issues per release (addedAt > createdAt + 1d).
    const activeReleases = await db
      .select({ id: jiraReleases.id, createdAt: jiraReleases.createdAt })
      .from(jiraReleases)
      .where(and(eq(jiraReleases.archived, false), eq(jiraReleases.released, false)));

    // Single pass over active memberships — compare each row's addedAt
    // against its release's creation cutoff in JS. One query instead of N.
    const releasesWithCreatedAt = activeReleases.filter(
      (r): r is typeof r & { createdAt: Date } => !!r.createdAt,
    );
    const activeIdsWithCreated = releasesWithCreatedAt.map((r) => r.id);
    const cutoffByRelease = new Map(
      releasesWithCreatedAt.map((r) => [r.id, r.createdAt.getTime() + 24 * 60 * 60 * 1000]),
    );

    const allActiveMemberships = activeIdsWithCreated.length
      ? await db
          .select({ releaseId: releaseIssues.releaseId, addedAt: releaseIssues.addedAt })
          .from(releaseIssues)
          .where(
            and(
              inArray(releaseIssues.releaseId, activeIdsWithCreated),
              isNull(releaseIssues.removedAt),
            ),
          )
      : [];

    let totalCreep = 0;
    for (const m of allActiveMemberships) {
      const cutoff = cutoffByRelease.get(m.releaseId);
      if (cutoff !== undefined && m.addedAt.getTime() > cutoff) totalCreep += 1;
    }
    const scopeCreepRate =
      activeReleases.length > 0
        ? Math.round((totalCreep / activeReleases.length) * 10) / 10
        : 0;

    // Velocity: releases shipped per ISO week over last 12 weeks.
    const shipped12w = await db
      .select({ releaseDate: jiraReleases.releaseDate })
      .from(jiraReleases)
      .where(
        and(
          eq(jiraReleases.released, true),
          eq(jiraReleases.archived, false),
          isNotNull(jiraReleases.releaseDate),
          gte(jiraReleases.releaseDate, ymd(twelveWeeksAgo)),
        ),
      );

    const weekCounts = new Map<string, number>();
    // Pre-seed last 12 weeks with zeros so empty weeks still render on the chart.
    const cursor = new Date(twelveWeeksAgo);
    for (let i = 0; i < 12; i++) {
      weekCounts.set(isoWeekKey(cursor), 0);
      cursor.setDate(cursor.getDate() + 7);
    }
    for (const r of shipped12w) {
      if (!r.releaseDate) continue;
      const d = new Date(`${r.releaseDate}T12:00:00Z`);
      const key = isoWeekKey(d);
      weekCounts.set(key, (weekCounts.get(key) || 0) + 1);
    }
    const velocity = [...weekCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));

    return NextResponse.json({
      kpis: {
        onTimePct,
        avgDaysLate,
        scopeCreepRate,
        shippedCount90d: shipped.length,
      },
      velocity,
    });
  } catch (error) {
    console.error(
      "Release health API error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to load release health" }, { status: 500 });
  }
}
