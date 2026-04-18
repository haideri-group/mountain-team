/**
 * Add three indexes on the `issues` table to accelerate the overview and
 * other assignee/board-scoped queries.
 *
 *   idx_issues_board             — WHERE boardId IN (...)     (overview, workload)
 *   idx_issues_assignee          — WHERE assigneeId = ?       (profile, per-member)
 *   idx_issues_status_completed  — composite: status filter + completedDate range
 *
 * Drizzle declares FKs for boardId / assigneeId but doesn't add explicit
 * indexes. MySQL's auto-FK-index behaviour is version-dependent so we pin
 * them here.
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent.
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

    const indexExists = async (table: string, index: string) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1",
        [schema, table, index],
      );
      return (rows as unknown[]).length > 0;
    };

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
        console.log(`      ${sql}`);
      }
    };

    const addIndex = async (indexName: string, columns: string) => {
      if (await indexExists("issues", indexName)) {
        console.log(`  [skip] ${indexName} already exists`);
        return;
      }
      await run(indexName, `ALTER TABLE \`issues\` ADD INDEX \`${indexName}\` (${columns})`);
    };

    await addIndex("idx_issues_board", "`boardId`");
    await addIndex("idx_issues_assignee", "`assigneeId`");
    await addIndex("idx_issues_status_completed", "`status`, `completedDate`");

    console.log();
    if (APPLY) {
      console.log(`Done. ${executed} statement(s) executed.`);
    } else if (planned === 0) {
      console.log("Nothing to do — all indexes already present.");
    } else {
      console.log(`Dry-run complete. ${planned} statement(s) would be executed.`);
      console.log("Re-run with --apply to commit these changes.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
