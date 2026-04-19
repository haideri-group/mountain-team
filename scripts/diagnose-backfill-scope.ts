/**
 * READ-ONLY Diagnostic: Backfill Job Scope & Sizing
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const REPORT_WIDTH = 80;

function hr(char = "=") {
  console.log(char.repeat(REPORT_WIDTH));
}

function section(title: string) {
  console.log();
  hr("═");
  console.log(`  ${title}`);
  hr("═");
}

function kv(key: string, value: unknown) {
  const v = typeof value === "number" ? value.toLocaleString() : String(value ?? "—");
  console.log(`  ${key.padEnd(50)} : ${v}`);
}

async function run(conn: mysql.Connection): Promise<void> {
  section("1. TRACKED ISSUE INVENTORY");

  const [[totalRow]] = (await conn.query(`
    SELECT COUNT(*) AS count FROM issues
    WHERE boardId IN (SELECT id FROM boards WHERE isTracked = 1)
  `)) as [Array<{ count: number }>, unknown];
  const totalTracked = totalRow?.count ?? 0;
  kv("Total tracked issues", totalTracked);

  console.log();
  const [statusRows] = (await conn.query(`
    SELECT status, COUNT(*) AS count FROM issues
    WHERE boardId IN (SELECT id FROM boards WHERE isTracked = 1)
    GROUP BY status
    ORDER BY count DESC
  `)) as [Array<{ status: string; count: number }>, unknown];

  for (const row of statusRows) {
    kv(`  Status: ${row.status}`, row.count);
  }

  section("2. DEPLOYMENT COVERAGE");

  const [[prodRow]] = (await conn.query(`
    SELECT COUNT(DISTINCT i.id) AS count FROM issues i
    WHERE i.boardId IN (SELECT id FROM boards WHERE isTracked = 1)
      AND EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey AND d.environment IN ('production', 'canonical'))
  `)) as [Array<{ count: number }>, unknown];
  const withProd = prodRow?.count ?? 0;
  kv("Issues with prod/canonical deployment", withProd);
  kv("  % of tracked", totalTracked > 0 ? ((withProd / totalTracked) * 100).toFixed(1) + "%" : "—");

  const [[noneRow]] = (await conn.query(`
    SELECT COUNT(*) AS count FROM issues i
    WHERE i.boardId IN (SELECT id FROM boards WHERE isTracked = 1)
      AND NOT EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey)
  `)) as [Array<{ count: number }>, unknown];
  const noDeployments = noneRow?.count ?? 0;
  kv("Issues with NO deployment rows", noDeployments);
  kv("  % of tracked", totalTracked > 0 ? ((noDeployments / totalTracked) * 100).toFixed(1) + "%" : "—");

  section("3. BACKFILL ELIGIBILITY BY STATUS");

  const [noBucket] = (await conn.query(`
    SELECT status, COUNT(*) AS count FROM issues i
    WHERE i.boardId IN (SELECT id FROM boards WHERE isTracked = 1)
      AND NOT EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey)
    GROUP BY status
    ORDER BY count DESC
  `)) as [Array<{ status: string; count: number }>, unknown];

  console.log("  Issues with NO deployment rows, by status:");
  for (const row of noBucket) {
    kv(`    ${row.status}`, row.count);
  }

  const [[safeSkipRow]] = (await conn.query(`
    SELECT COUNT(DISTINCT i.id) AS count FROM issues i
    WHERE i.boardId IN (SELECT id FROM boards WHERE isTracked = 1)
      AND i.status IN ('done', 'closed')
      AND EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey AND d.environment IN ('production', 'canonical'))
  `)) as [Array<{ count: number }>, unknown];
  const safeSkip = safeSkipRow?.count ?? 0;
  kv("Done/Closed with prod deployment (safe to skip)", safeSkip);

  section("4. GITHUB REPO TRACKING");

  const [[repoCountRow]] = (await conn.query(`SELECT COUNT(*) AS count FROM github_repos`)) as [Array<{ count: number }>, unknown];
  const trackedRepos = repoCountRow?.count ?? 0;
  kv("Total tracked GitHub repos", trackedRepos);

  if (trackedRepos > 0) {
    console.log();
    const [repos] = (await conn.query(`SELECT owner, name, fullName FROM github_repos ORDER BY fullName`)) as [Array<{ owner: string; name: string; fullName: string }>, unknown];
    for (const r of repos) {
      kv(`  ${r.fullName}`, "tracked");
    }
  }

  section("5. TRACKED JIRA BOARDS");

  const [boards] = (await conn.query(`
    SELECT b.id, b.jiraKey, b.name, COUNT(i.id) AS issueCount
    FROM boards b
    LEFT JOIN issues i ON i.boardId = b.id
    WHERE b.isTracked = 1
    GROUP BY b.id, b.jiraKey, b.name
    ORDER BY issueCount DESC
  `)) as [Array<{ id: string; jiraKey: string; name: string; issueCount: number }>, unknown];

  kv("Total tracked boards", boards.length);
  console.log();
  for (const b of boards) {
    kv(`  ${b.jiraKey} (${b.name})`, `${b.issueCount} issues`);
  }

  section("6. SKIP-RULE CEILING");

  const [[ceiling]] = (await conn.query(`
    SELECT COUNT(DISTINCT i.id) AS count FROM issues i
    WHERE i.boardId IN (SELECT id FROM boards WHERE isTracked = 1)
      AND i.status IN ('done', 'closed')
      AND EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey AND d.environment IN ('production', 'canonical'))
  `)) as [Array<{ count: number }>, unknown];
  const ceilingCount = ceiling?.count ?? 0;
  kv("Done/Closed with prod deployment (safe-to-skip ceiling)", ceilingCount);
  kv("  % of tracked", totalTracked > 0 ? ((ceilingCount / totalTracked) * 100).toFixed(1) + "%" : "—");

  section("7. BACKFILL SUMMARY");

  const backfillCandidates = noDeployments;
  console.log();
  kv("Total tracked issues", totalTracked);
  kv("Already have prod deployment", withProd);
  kv("Missing deployment rows (backfill candidates)", backfillCandidates);
  kv("Safe to skip (done/closed + prod dep)", safeSkip);
  console.log();
  kv("Backfill scope (all)", backfillCandidates);
  kv("Conservative first-run (skip done/closed)", backfillCandidates - safeSkip);
  console.log();
  console.log(`  Estimated runs to full coverage (1000 PR check/run): ${Math.ceil(backfillCandidates / 1000)}`);
  console.log(`  GitHub API quota (5000/hr): sufficient for ~5 full passes / hour`);
  hr();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL not set");
    process.exit(1);
  }
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await run(conn);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
