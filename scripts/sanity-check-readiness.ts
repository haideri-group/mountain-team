/**
 * Read-only sanity check: compute readiness for the top 10 non-archived
 * unreleased releases and print status, reason, projected ship, score.
 *
 * Run after editing readiness.ts to eyeball that the output matches intuition.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import {
  computeReadiness,
  issueStatusBucket,
  type ReadinessInput,
  type ReadinessIssueCounts,
} from "../src/lib/releases/readiness";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // 10 most recent non-archived releases
  const [releases] = (await conn.query(
    `SELECT r.id, r.name, r.projectKey, r.releaseDate, r.released, r.createdAt
     FROM jira_releases r
     WHERE r.archived = 0
     ORDER BY r.releaseDate DESC
     LIMIT 10`,
  )) as [
    Array<{
      id: string;
      name: string;
      projectKey: string;
      releaseDate: string | null;
      released: 0 | 1;
      createdAt: Date;
    }>,
    unknown,
  ];

  // Team velocity — actual throughput: issues completed in the last 28 days / 28.
  // Much more defensible for forecasting than summing active workload.
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0];
  const [[velocityRow]] = (await conn.query(
    `SELECT COUNT(*) AS c FROM issues
     WHERE completedDate IS NOT NULL
       AND completedDate >= ?
       AND status = 'done'`,
    [fourWeeksAgoStr],
  )) as [Array<{ c: number | string }>, unknown];
  const completedCount = Number(velocityRow?.c || 0);
  const velocityIssuesPerDay = completedCount > 0 ? completedCount / 28 : null;

  console.log(`Velocity (issues/day) approx: ${velocityIssuesPerDay?.toFixed(2) ?? "unknown"}`);
  console.log();
  console.log("═".repeat(80));

  for (const r of releases) {
    // Active members only — issues + release_issues membership
    const [issueRows] = (await conn.query(
      `SELECT i.jiraKey, i.status, i.assigneeId, i.startDate, i.jiraCreatedAt
       FROM release_issues ri
       JOIN issues i ON i.jiraKey = ri.jiraKey
       WHERE ri.releaseId = ? AND ri.removedAt IS NULL`,
      [r.id],
    )) as [
      Array<{
        jiraKey: string;
        status: string;
        assigneeId: string | null;
        startDate: string | null;
        jiraCreatedAt: string | null;
      }>,
      unknown,
    ];

    const counts: ReadinessIssueCounts = {
      done: 0,
      inProgress: 0,
      inReview: 0,
      readyForTesting: 0,
      readyForLive: 0,
      toDo: 0,
      unassigned: 0,
      staleInProgress: 0,
    };

    const now = Date.now();
    const STALE_MS = 3 * 24 * 60 * 60 * 1000;

    for (const i of issueRows) {
      const bucket = issueStatusBucket(i.status);
      if (bucket === "done") counts.done += 1;
      else if (bucket === "inProgress") counts.inProgress += 1;
      else if (bucket === "inReview") counts.inReview += 1;
      else if (bucket === "readyForTesting") counts.readyForTesting += 1;
      else if (bucket === "readyForLive") counts.readyForLive += 1;
      else if (bucket === "toDo") counts.toDo += 1;

      if (!i.assigneeId && bucket !== "done") counts.unassigned += 1;

      if (bucket === "inProgress") {
        const startRef = i.startDate || i.jiraCreatedAt;
        if (startRef) {
          const age = now - new Date(startRef).getTime();
          if (age > STALE_MS) counts.staleInProgress += 1;
        }
      }
    }

    // Deployment coverage
    const jiraKeys = issueRows.map((i) => i.jiraKey);
    let staging = 0;
    let production = 0;
    if (jiraKeys.length > 0) {
      const placeholders = jiraKeys.map(() => "?").join(",");
      const [depRows] = (await conn.query(
        `SELECT jiraKey, environment FROM deployments WHERE jiraKey IN (${placeholders})`,
        jiraKeys,
      )) as [Array<{ jiraKey: string; environment: string }>, unknown];
      const sSet = new Set<string>();
      const pSet = new Set<string>();
      for (const d of depRows) {
        if (d.environment === "staging") sSet.add(d.jiraKey);
        if (d.environment === "production" || d.environment === "canonical") pSet.add(d.jiraKey);
      }
      staging = sSet.size;
      production = pSet.size;
    }

    // Scope creep — issues added > 1 day after release.createdAt
    const creepCutoff = new Date(new Date(r.createdAt).getTime() + 24 * 60 * 60 * 1000);
    const [[creepRow]] = (await conn.query(
      `SELECT COUNT(*) AS c FROM release_issues WHERE releaseId = ? AND addedAt > ?`,
      [r.id, creepCutoff],
    )) as [Array<{ c: number | string }>, unknown];
    const scopeCreepCount = Number(creepRow?.c ?? 0);

    const total = counts.done + counts.toDo + counts.inProgress + counts.inReview + counts.readyForTesting + counts.readyForLive;

    const input: ReadinessInput = {
      release: {
        releaseDate: r.releaseDate,
        released: !!r.released,
        createdAt: r.createdAt.toISOString(),
      },
      issueCounts: counts,
      coverage: { staging, production, total },
      scopeCreepCount,
      velocityIssuesPerDay,
    };

    const out = computeReadiness(input);

    const statusIcon = {
      on_track: "🟢",
      at_risk: "🟡",
      slipping: "🔴",
      overdue: "⚫",
      released: "🟩",
    }[out.status];

    console.log(`${statusIcon}  ${r.projectKey.padEnd(10)} ${r.name}`);
    console.log(`    ${out.reason}`);
    console.log(
      `    Score ${out.score}  ·  Projected ${out.projectedShipDate || "—"}  ·  ` +
        `Due ${r.releaseDate || "—"}  ·  Delta ${out.projectedDaysVsDue ?? "—"}`,
    );
    console.log(
      `    Issues: ${counts.done}✓ ${counts.inProgress}⚙ ${counts.inReview}👁 ` +
        `${counts.readyForTesting}🧪 ${counts.readyForLive}🚀 ${counts.toDo}☐  ` +
        `(${total} total)`,
    );
    console.log(
      `    Staged: ${staging}/${total}  ·  Prod: ${production}/${total}  ·  ` +
        `Scope creep: ${scopeCreepCount}  ·  Stale: ${counts.staleInProgress}  ·  ` +
        `Unassigned: ${counts.unassigned}`,
    );
    console.log();
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
