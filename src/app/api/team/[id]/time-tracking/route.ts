import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { worklogs, timedoctorEntries, team_members, issues, boards, syncLogs } from "@/lib/db/schema";
import { eq, and, gte, desc, inArray, or } from "drizzle-orm";
import { APP_TIMEZONE } from "@/lib/config";

// ─── Timezone-aware date helpers ─────────────────────────────────────────────

function getPKTDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

function getPKTDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, weekday: "short" });
}

function getStartOfWeekPKT(now: Date): Date {
  const dateStr = getPKTDateString(now);
  const d = new Date(`${dateStr}T00:00:00+05:00`);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function getStartOfMonthPKT(now: Date): Date {
  const dateStr = getPKTDateString(now);
  const [year, month] = dateStr.split("-");
  return new Date(`${year}-${month}-01T00:00:00+05:00`);
}

// ─── Period summary helper ───────────────────────────────────────────────────

interface PeriodSummary {
  jira: number;
  timedoctor: number;
  other: number;
  total: number;
}

function buildSummary(jira: number, td: number): PeriodSummary {
  const other = Math.max(0, td - jira);
  const total = td > 0 ? td : jira; // TD is ground truth when available
  return { jira, timedoctor: td, other, total };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [member] = await db
      .select({ id: team_members.id, status: team_members.status })
      .from(team_members)
      .where(eq(team_members.id, id))
      .limit(1);

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const now = new Date();
    const todayStr = getPKTDateString(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getPKTDateString(yesterday);
    const weekStart = getStartOfWeekPKT(now);
    const monthStart = getStartOfMonthPKT(now);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ── Fetch JIRA worklogs ────────────────────────────────────────────────
    const memberWorklogs = await db
      .select({
        jiraKey: worklogs.jiraKey,
        started: worklogs.started,
        timeSpentSeconds: worklogs.timeSpentSeconds,
      })
      .from(worklogs)
      .where(and(eq(worklogs.memberId, id), gte(worklogs.started, thirtyDaysAgo)))
      .orderBy(desc(worklogs.started));

    // ── Fetch Time Doctor entries ──────────────────────────────────────────
    const tdEntries = await db
      .select({
        started: timedoctorEntries.started,
        durationSeconds: timedoctorEntries.durationSeconds,
        taskName: timedoctorEntries.taskName,
        projectName: timedoctorEntries.projectName,
      })
      .from(timedoctorEntries)
      .where(and(eq(timedoctorEntries.memberId, id), gte(timedoctorEntries.started, thirtyDaysAgo)))
      .orderBy(desc(timedoctorEntries.started));

    const hasTimeDoctorData = tdEntries.length > 0;

    // ── Aggregate JIRA per day + summaries ─────────────────────────────────
    const jiraDaily = new Map<string, number>();
    let jiraToday = 0, jiraYesterday = 0, jiraWeek = 0, jiraMonth = 0;

    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    for (let d = new Date(fourteenDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      jiraDaily.set(getPKTDateString(d), 0);
    }

    const recentMap = new Map<string, { jiraKey: string; date: string; seconds: number }>();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const wl of memberWorklogs) {
      const wlDate = getPKTDateString(wl.started);
      const s = wl.timeSpentSeconds;

      if (wlDate === todayStr) jiraToday += s;
      if (wlDate === yesterdayStr) jiraYesterday += s;
      if (wl.started >= weekStart) jiraWeek += s;
      if (wl.started >= monthStart) jiraMonth += s;

      if (jiraDaily.has(wlDate)) {
        jiraDaily.set(wlDate, (jiraDaily.get(wlDate) || 0) + s);
      }

      if (wl.started >= sevenDaysAgo) {
        const key = `${wl.jiraKey}::${wlDate}`;
        const existing = recentMap.get(key);
        if (existing) existing.seconds += s;
        else recentMap.set(key, { jiraKey: wl.jiraKey, date: wlDate, seconds: s });
      }
    }

    // ── Aggregate TD per day + summaries ───────────────────────────────────
    const tdDaily = new Map<string, number>();
    for (const date of jiraDaily.keys()) tdDaily.set(date, 0);
    let tdToday = 0, tdYesterday = 0, tdWeek = 0, tdMonth = 0;

    const recentOtherMap = new Map<string, { taskName: string; projectName: string | null; date: string; seconds: number }>();

    for (const entry of tdEntries) {
      const entryDate = getPKTDateString(entry.started);
      const s = entry.durationSeconds;

      if (entryDate === todayStr) tdToday += s;
      if (entryDate === yesterdayStr) tdYesterday += s;
      if (entry.started >= weekStart) tdWeek += s;
      if (entry.started >= monthStart) tdMonth += s;

      if (tdDaily.has(entryDate)) {
        tdDaily.set(entryDate, (tdDaily.get(entryDate) || 0) + s);
      }

      // Recent non-JIRA work for breakdown
      if (entry.started >= sevenDaysAgo && entry.taskName) {
        const key = `${entry.taskName}::${entryDate}`;
        const existing = recentOtherMap.get(key);
        if (existing) existing.seconds += s;
        else recentOtherMap.set(key, {
          taskName: entry.taskName,
          projectName: entry.projectName,
          date: entryDate,
          seconds: s,
        });
      }
    }

    // ── Build response ─────────────────────────────────────────────────────
    const summary = {
      today: buildSummary(jiraToday, tdToday),
      yesterday: buildSummary(jiraYesterday, tdYesterday),
      thisWeek: buildSummary(jiraWeek, tdWeek),
      thisMonth: buildSummary(jiraMonth, tdMonth),
    };

    const dailyBreakdown = [...jiraDaily.keys()].map((date) => {
      const jiraS = jiraDaily.get(date) || 0;
      const tdS = tdDaily.get(date) || 0;
      const otherS = Math.max(0, tdS - jiraS);
      const d = new Date(`${date}T12:00:00+05:00`);
      return {
        date,
        label: getPKTDayLabel(d),
        jiraSeconds: jiraS,
        timedoctorSeconds: tdS,
        otherSeconds: otherS,
        totalSeconds: tdS > 0 ? tdS : jiraS,
        isToday: date === todayStr,
      };
    });

    // Enrich JIRA recent worklogs
    const recentKeys = [...new Set([...recentMap.values()].map((r) => r.jiraKey))];
    const issueInfo = new Map<string, { title: string; boardKey: string; boardColor: string }>();

    if (recentKeys.length > 0) {
      const allIssueRows = await db
        .select({ jiraKey: issues.jiraKey, title: issues.title, boardId: issues.boardId })
        .from(issues)
        .where(inArray(issues.jiraKey, recentKeys));

      const boardIds = [...new Set(allIssueRows.map((i) => i.boardId))];
      const allBoards = boardIds.length > 0
        ? await db.select({ id: boards.id, jiraKey: boards.jiraKey, color: boards.color }).from(boards).where(inArray(boards.id, boardIds))
        : [];
      const boardMap = new Map(allBoards.map((b) => [b.id, b]));

      for (const row of allIssueRows) {
        const board = boardMap.get(row.boardId);
        issueInfo.set(row.jiraKey, {
          title: row.title,
          boardKey: board?.jiraKey || "",
          boardColor: board?.color || "#6b7280",
        });
      }
    }

    const recentWorklogs = [...recentMap.values()]
      .sort((a, b) => b.date.localeCompare(a.date) || b.seconds - a.seconds)
      .map((r) => {
        const info = issueInfo.get(r.jiraKey);
        return {
          jiraKey: r.jiraKey,
          issueTitle: info?.title || "Unknown",
          boardKey: info?.boardKey || "",
          boardColor: info?.boardColor || "#6b7280",
          date: r.date,
          seconds: r.seconds,
        };
      });

    // Recent "other" work from TD (non-JIRA activities)
    const recentOtherWork = [...recentOtherMap.values()]
      .sort((a, b) => b.date.localeCompare(a.date) || b.seconds - a.seconds)
      .slice(0, 10);

    // Last sync time (most recent of either type)
    const [lastSync] = await db
      .select({ completedAt: syncLogs.completedAt })
      .from(syncLogs)
      .where(or(eq(syncLogs.type, "worklog_sync"), eq(syncLogs.type, "timedoctor_sync")))
      .orderBy(desc(syncLogs.completedAt))
      .limit(1);

    return NextResponse.json({
      summary,
      dailyBreakdown,
      recentWorklogs,
      recentOtherWork,
      hasTimeDoctorData,
      lastSyncedAt: lastSync?.completedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("Time tracking API error:", error);
    return NextResponse.json(
      { error: "Failed to load time tracking data" },
      { status: 500 },
    );
  }
}
