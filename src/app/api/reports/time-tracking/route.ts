import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { worklogs, timedoctorEntries, team_members } from "@/lib/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { APP_TIMEZONE } from "@/lib/config";

function getPKTDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

function getStartOfWeekPKT(now: Date): Date {
  const dateStr = getPKTDateString(now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  utc.setUTCDate(utc.getUTCDate() - diff);
  const mondayStr = utc.toISOString().split("T")[0];
  return new Date(`${mondayStr}T00:00:00+05:00`);
}

function getStartOfMonthPKT(now: Date): Date {
  const dateStr = getPKTDateString(now);
  const [year, month] = dateStr.split("-");
  return new Date(`${year}-${month}-01T00:00:00+05:00`);
}

function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 1);
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "week";
    const teamFilter = url.searchParams.get("team") || "";

    const now = new Date();
    const sinceDate = period === "month" ? getStartOfMonthPKT(now) : getStartOfWeekPKT(now);
    const daysInPeriod = countWorkingDays(sinceDate, now);

    const memberFilter = teamFilter
      ? and(inArray(team_members.status, ["active", "on_leave"]), eq(team_members.teamName, teamFilter))
      : inArray(team_members.status, ["active", "on_leave"]);

    const members = await db
      .select({
        id: team_members.id,
        displayName: team_members.displayName,
        avatarUrl: team_members.avatarUrl,
      })
      .from(team_members)
      .where(memberFilter);

    if (members.length === 0) {
      return NextResponse.json({ members: [], teamTotal: 0, teamDailyAvg: 0, hasTimeDoctorData: false });
    }

    const memberIds = members.map((m) => m.id);

    // Fetch JIRA worklogs
    const allJiraWorklogs = await db
      .select({
        memberId: worklogs.memberId,
        started: worklogs.started,
        timeSpentSeconds: worklogs.timeSpentSeconds,
      })
      .from(worklogs)
      .where(and(inArray(worklogs.memberId, memberIds), gte(worklogs.started, sinceDate)));

    // Fetch Time Doctor entries
    const allTDEntries = await db
      .select({
        memberId: timedoctorEntries.memberId,
        started: timedoctorEntries.started,
        durationSeconds: timedoctorEntries.durationSeconds,
      })
      .from(timedoctorEntries)
      .where(and(inArray(timedoctorEntries.memberId, memberIds), gte(timedoctorEntries.started, sinceDate)));

    const hasTimeDoctorData = allTDEntries.length > 0;

    // Aggregate per member
    const jiraTotals = new Map<string, { seconds: number; days: Set<string> }>();
    const tdTotals = new Map<string, { seconds: number; days: Set<string> }>();

    for (const m of members) {
      jiraTotals.set(m.id, { seconds: 0, days: new Set() });
      tdTotals.set(m.id, { seconds: 0, days: new Set() });
    }

    for (const wl of allJiraWorklogs) {
      if (!wl.memberId) continue;
      const entry = jiraTotals.get(wl.memberId);
      if (!entry) continue;
      entry.seconds += wl.timeSpentSeconds;
      entry.days.add(getPKTDateString(wl.started));
    }

    for (const td of allTDEntries) {
      if (!td.memberId) continue;
      const entry = tdTotals.get(td.memberId);
      if (!entry) continue;
      entry.seconds += td.durationSeconds;
      entry.days.add(getPKTDateString(td.started));
    }

    let teamTotal = 0;
    let teamJira = 0;
    let teamTD = 0;

    const memberResults = members
      .map((m) => {
        const jira = jiraTotals.get(m.id)!;
        const td = tdTotals.get(m.id)!;
        const otherSeconds = Math.max(0, td.seconds - jira.seconds);
        const totalSeconds = td.seconds > 0 ? td.seconds : jira.seconds;
        const allDays = new Set([...jira.days, ...td.days]);

        teamTotal += totalSeconds;
        teamJira += jira.seconds;
        teamTD += td.seconds;

        return {
          memberId: m.id,
          displayName: m.displayName,
          avatarUrl: m.avatarUrl,
          jiraSeconds: jira.seconds,
          timedoctorSeconds: td.seconds,
          otherSeconds,
          totalSeconds,
          dailyAvgSeconds: Math.round(totalSeconds / daysInPeriod),
          daysLogged: allDays.size,
          daysInPeriod,
        };
      })
      .sort((a, b) => b.totalSeconds - a.totalSeconds);

    return NextResponse.json({
      members: memberResults,
      teamTotal,
      teamDailyAvg: members.length > 0 ? Math.round(teamTotal / members.length / daysInPeriod) : 0,
      hasTimeDoctorData,
    });
  } catch (error) {
    console.error("Reports time tracking error:", error);
    return NextResponse.json(
      { error: "Failed to load time tracking report" },
      { status: 500 },
    );
  }
}
