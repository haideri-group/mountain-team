import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { team_members, issues, boards, deployments } from "@/lib/db/schema";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";

// ─── Diagnostic endpoint ─────────────────────────────────────────────────────
//
// Reproduces the exact query workload of /api/overview but with `performance.now()`
// brackets around every measurable step. Returns a JSON breakdown so we can see
// where the 15-second TTFB is actually going: per-query latency, in-memory work,
// auth check, etc.
//
// Auth: admin session OR `Authorization: Bearer <DIAG_SECRET>` header. The
// secret path lets the agent run this without a session cookie; constant-time
// compared at the byte level, fails closed if DIAG_SECRET is unset or under
// 16 bytes. Header (not query string) so the secret never lands in nginx /
// Cloudflare / Railway access logs, browser history, or referrer chains.
//
// After diagnosing, this endpoint should be deleted (or kept under a feature
// flag) — it's not meant for steady-state use.
//
// Usage:
//   curl -b "authjs.session-token=…" https://haider-team.appz.cc/api/debug/overview-timing
//   curl -H "Authorization: Bearer <DIAG_SECRET>" https://haider-team.appz.cc/api/debug/overview-timing

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

type Phase = { name: string; ms: number; rows?: number; note?: string };

export async function GET(request: Request) {
  const phases: Phase[] = [];
  const t0 = performance.now();

  // Auth gate. Two paths, either is sufficient:
  //   1. Admin session cookie (normal browser usage).
  //   2. `Authorization: Bearer <DIAG_SECRET>` header. Lets the agent run
  //      this from a terminal without scraping a session cookie. Header
  //      (not query) so the secret never lands in access logs / referrers /
  //      browser history. Constant-time compared on raw bytes; fails closed
  //      if DIAG_SECRET is unset or under 16 bytes.
  const authStart = performance.now();
  const session = await auth();
  phases.push({ name: "auth()", ms: round(performance.now() - authStart) });

  const isAdminSession = session?.user?.role === "admin";

  const authHeader = request.headers.get("authorization");
  const providedSecret = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const expectedSecret = process.env.DIAG_SECRET;

  // Compare byte-for-byte (timingSafeEqual operates on bytes; String.length
  // counts UTF-16 code units which can differ from UTF-8 byte length for
  // non-ASCII inputs — mismatched buffer lengths would throw and 500).
  const isSecretValid = (() => {
    if (!expectedSecret || Buffer.byteLength(expectedSecret) < 16) return false;
    if (!providedSecret) return false;
    const provided = Buffer.from(providedSecret);
    const expected = Buffer.from(expectedSecret);
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(provided, expected);
  })();

  if (!isAdminSession && !isSecretValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Baseline: trivial round-trip ──────────────────────────────────────────
  // Measures pure connection latency. If this is slow, every subsequent
  // query will be at least this slow regardless of optimization.
  const ping1Start = performance.now();
  await db.execute(sql`SELECT 1`);
  phases.push({
    name: "SELECT 1 (cold ping)",
    ms: round(performance.now() - ping1Start),
    note: "First query — may include connection setup / TLS handshake",
  });

  const ping2Start = performance.now();
  await db.execute(sql`SELECT 1`);
  phases.push({
    name: "SELECT 1 (warm ping)",
    ms: round(performance.now() - ping2Start),
    note: "Second ping on same pool — should be sub-50ms if connection is warm",
  });

  const ping3Start = performance.now();
  await db.execute(sql`SELECT 1`);
  phases.push({
    name: "SELECT 1 (warm ping #2)",
    ms: round(performance.now() - ping3Start),
  });

  // ── The 5 queries from /api/overview, sequential ──────────────────────────
  const q1Start = performance.now();
  const allMembers = await db.select().from(team_members);
  phases.push({
    name: "Q1: SELECT * FROM team_members",
    ms: round(performance.now() - q1Start),
    rows: allMembers.length,
  });

  const q2Start = performance.now();
  const trackedBoards = await db
    .select()
    .from(boards)
    .where(eq(boards.isTracked, true));
  phases.push({
    name: "Q2: SELECT * FROM boards WHERE isTracked=1",
    ms: round(performance.now() - q2Start),
    rows: trackedBoards.length,
  });

  const trackedBoardIds = trackedBoards.map((b) => b.id);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  const q3Start = performance.now();
  const allIssues =
    trackedBoardIds.length > 0
      ? await db
          .select({
            id: issues.id,
            jiraKey: issues.jiraKey,
            status: issues.status,
            boardId: issues.boardId,
            assigneeId: issues.assigneeId,
            completedDate: issues.completedDate,
          })
          .from(issues)
          .where(
            and(
              inArray(issues.boardId, trackedBoardIds),
              or(
                inArray(issues.status, [...ACTIVE_STATUSES]),
                and(
                  eq(issues.status, "done"),
                  gte(issues.completedDate, thirtyDaysAgoStr),
                ),
                and(
                  eq(issues.status, "closed"),
                  gte(issues.completedDate, thirtyDaysAgoStr),
                ),
              ),
            ),
          )
      : [];
  phases.push({
    name: "Q3 (narrow, 6 cols): SELECT … FROM issues WHERE active|recent-done",
    ms: round(performance.now() - q3Start),
    rows: allIssues.length,
  });

  // Q3-FULL: select the same 16 columns /api/overview actually uses, to test
  // whether the wider projection (labels, title, priority, ...) is the slow bit.
  const q3FullStart = performance.now();
  const allIssuesFull =
    trackedBoardIds.length > 0
      ? await db
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
            requestPriority: issues.requestPriority,
            labels: issues.labels,
            jiraCreatedAt: issues.jiraCreatedAt,
          })
          .from(issues)
          .where(
            and(
              inArray(issues.boardId, trackedBoardIds),
              or(
                inArray(issues.status, [...ACTIVE_STATUSES]),
                and(
                  eq(issues.status, "done"),
                  gte(issues.completedDate, thirtyDaysAgoStr),
                ),
                and(
                  eq(issues.status, "closed"),
                  gte(issues.completedDate, thirtyDaysAgoStr),
                ),
              ),
            ),
          )
      : [];
  phases.push({
    name: "Q3-FULL (16 cols, same as /api/overview): same WHERE",
    ms: round(performance.now() - q3FullStart),
    rows: allIssuesFull.length,
    note: "If much slower than narrow Q3, the wider projection (labels JSON, title) is the bottleneck",
  });

  const issueKeys = allIssues.map((i) => i.jiraKey);

  const q4Start = performance.now();
  const matchingDeployments =
    issueKeys.length > 0
      ? await db
          .select({
            jiraKey: deployments.jiraKey,
            environment: deployments.environment,
          })
          .from(deployments)
          .where(inArray(deployments.jiraKey, issueKeys))
      : [];
  phases.push({
    name: `Q4: SELECT … FROM deployments WHERE jiraKey IN (${issueKeys.length} keys)`,
    ms: round(performance.now() - q4Start),
    rows: matchingDeployments.length,
  });

  const q5Start = performance.now();
  const lifetimeCounts =
    trackedBoardIds.length > 0
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
  phases.push({
    name: "Q5: SELECT assigneeId, status, COUNT(*) GROUP BY (lifetime)",
    ms: round(performance.now() - q5Start),
    rows: lifetimeCounts.length,
  });

  // ── Replicate /api/overview's in-memory mapping work ──────────────────────
  // 47 members × 785 issues × ~6 filters/sort each. Should be tens of ms in JS.
  // If this is multi-second, the slowness is in here, not the DB.
  const mapStart = performance.now();
  const boardMap = new Map(trackedBoards.map((b) => [b.id, b]));
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
  const result = allMembers.map((member) => {
    const memberIssues = allIssuesFull.filter((i) => i.assigneeId === member.id);
    const currentIssue = memberIssues.find((i) => i.status === "in_progress") || null;
    const queuedIssues = memberIssues
      .filter((i) => i.status === "todo")
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    const recentDone = memberIssues
      .filter(
        (i) =>
          i.status === "done" &&
          i.completedDate &&
          i.completedDate >= sevenDaysAgoStr,
      )
      .sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || ""));
    // Touch boardMap for each issue (mimic enrichIssue) so we measure that too.
    [...queuedIssues, ...recentDone].forEach((i) => boardMap.get(i.boardId));
    return {
      memberId: member.id,
      currentIssue: currentIssue?.id ?? null,
      queuedCount: queuedIssues.length,
      recentDoneCount: recentDone.length,
    };
  });
  phases.push({
    name: "In-memory mapping (47 members × 785 issues filter/sort/enrich)",
    ms: round(performance.now() - mapStart),
    rows: result.length,
  });

  // ── JSON serialize a payload comparable to /api/overview's response ───────
  const serStart = performance.now();
  const _payload = JSON.stringify({
    members: result,
    issuesFull: allIssuesFull,
    deployments: matchingDeployments,
    boards: trackedBoards,
    members_raw: allMembers,
  });
  void _payload; // discard, just measure serialize time
  phases.push({
    name: "JSON.stringify of full payload (87KB-equivalent)",
    ms: round(performance.now() - serStart),
  });

  // ── Same 5 queries, parallelized along their actual dependency DAG ────────
  // Phase A: Q1 + Q2 in parallel
  // Phase B: Q3 + Q5 in parallel (both depend on trackedBoardIds from Q2)
  // Phase C: Q4 (depends on issueKeys from Q3)
  // Skipped if Q2 returned 0 boards (no issues to fetch anyway).
  const parStart = performance.now();
  const [, trackedBoardsP] = await Promise.all([
    db.select().from(team_members),
    db.select().from(boards).where(eq(boards.isTracked, true)),
  ]);
  const tbIds = trackedBoardsP.map((b) => b.id);
  if (tbIds.length > 0) {
    const [allIssuesP] = await Promise.all([
      db
        .select({
          jiraKey: issues.jiraKey,
        })
        .from(issues)
        .where(
          and(
            inArray(issues.boardId, tbIds),
            or(
              inArray(issues.status, [...ACTIVE_STATUSES]),
              and(
                eq(issues.status, "done"),
                gte(issues.completedDate, thirtyDaysAgoStr),
              ),
              and(
                eq(issues.status, "closed"),
                gte(issues.completedDate, thirtyDaysAgoStr),
              ),
            ),
          ),
        ),
      db
        .select({
          assigneeId: issues.assigneeId,
          status: issues.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(issues)
        .where(
          and(
            inArray(issues.boardId, tbIds),
            inArray(issues.status, ["done", "closed"]),
          ),
        )
        .groupBy(issues.assigneeId, issues.status),
    ]);
    const ikeys = allIssuesP.map((i) => i.jiraKey);
    if (ikeys.length > 0) {
      await db
        .select({
          jiraKey: deployments.jiraKey,
          environment: deployments.environment,
        })
        .from(deployments)
        .where(inArray(deployments.jiraKey, ikeys));
    }
  }
  phases.push({
    name: "All 5 queries, parallelized (3 phases instead of 5)",
    ms: round(performance.now() - parStart),
    note: "If this is much smaller than the sum of Q1-Q5, parallelization helps",
  });

  const total = round(performance.now() - t0);

  return NextResponse.json({
    total_ms: total,
    note: "All times in milliseconds. Run twice — second run reflects warm pool.",
    db_url_host: hidePassword(process.env.DATABASE_URL ?? ""),
    railway_region: process.env.RAILWAY_REGION ?? "(unset)",
    railway_environment: process.env.RAILWAY_ENVIRONMENT ?? "(unset)",
    phases,
  });
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function hidePassword(url: string): string {
  return url.replace(/:[^:@]+@/, ":***@");
}
