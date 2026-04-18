/**
 * Harden release_issues uniqueness.
 *
 * Adds a VIRTUAL generated column `activeKey` that equals `releaseId|jiraKey`
 * for active rows (removedAt IS NULL) and NULL for soft-removed rows, plus a
 * UNIQUE KEY over it. Because MySQL treats NULLs as distinct in unique indexes,
 * this allows any number of historical (removed) rows per (releaseId, jiraKey)
 * but enforces at most one active row — closing the concurrent-insert race
 * that existed when syncReleaseIssuesForIssue ran from webhook + bulk sync
 * at the same time.
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent.
 *
 * Before applying, the script counts existing (releaseId, jiraKey) pairs with
 * more than one active row — if any exist, the migration aborts and lists them
 * so they can be deduped manually before applying the constraint.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [[{ schema }]] = (await conn.query("SELECT DATABASE() AS `schema`")) as [
      [{ schema: string }],
      unknown,
    ];

    console.log(`Target database: ${schema}`);
    console.log(`Mode: ${MODE}`);
    if (!APPLY) console.log("  (SQL below will NOT be executed — re-run with --apply)");
    console.log();

    const columnExists = async (table: string, column: string) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1",
        [schema, table, column],
      );
      return (rows as unknown[]).length > 0;
    };
    const indexExists = async (table: string, index: string) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1",
        [schema, table, index],
      );
      return (rows as unknown[]).length > 0;
    };

    // ── Pre-flight dedup check ─────────────────────────────────────────────
    const [dupRows] = (await conn.query(
      `SELECT releaseId, jiraKey, COUNT(*) AS c
       FROM release_issues
       WHERE removedAt IS NULL
       GROUP BY releaseId, jiraKey
       HAVING COUNT(*) > 1`,
    )) as [Array<{ releaseId: string; jiraKey: string; c: number }>, unknown];
    if (dupRows.length > 0) {
      console.log("[abort] Duplicate active rows found — resolve before applying the constraint:");
      for (const d of dupRows) {
        console.log(`  ${d.releaseId} / ${d.jiraKey}: ${d.c} active rows`);
      }
      await conn.end();
      process.exit(1);
    }
    console.log("[check] No duplicate active rows — safe to apply.");

    let planned = 0;
    let executed = 0;
    const run = async (label: string, sql: string) => {
      planned += 1;
      if (APPLY) {
        await conn.query(sql);
        executed += 1;
        console.log(`  [+] ${label}`);
      } else {
        console.log(`  [would apply] ${label}`);
        sql.trim().split("\n").forEach((line) => console.log(`      ${line}`));
      }
    };

    if (await columnExists("release_issues", "activeKey")) {
      console.log("  [skip] release_issues.activeKey already exists");
    } else {
      await run(
        "release_issues.activeKey VIRTUAL column",
        `ALTER TABLE \`release_issues\`
  ADD COLUMN \`activeKey\` varchar(300)
  GENERATED ALWAYS AS (
    IF(\`removedAt\` IS NULL, CONCAT(\`releaseId\`, '|', \`jiraKey\`), NULL)
  ) VIRTUAL`,
      );
    }

    if (await indexExists("release_issues", "uk_release_issues_active")) {
      console.log("  [skip] uk_release_issues_active already exists");
    } else {
      await run(
        "UNIQUE KEY uk_release_issues_active",
        "ALTER TABLE `release_issues` ADD UNIQUE KEY `uk_release_issues_active` (`activeKey`)",
      );
    }

    console.log();
    if (APPLY) {
      console.log(`Done. ${executed} statement(s) executed.`);
    } else if (planned === 0) {
      console.log("Nothing to do — schema is already up to date.");
    } else {
      console.log(`Dry-run complete. ${planned} statement(s) would be executed.`);
      console.log("Re-run with --apply to commit these changes.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
