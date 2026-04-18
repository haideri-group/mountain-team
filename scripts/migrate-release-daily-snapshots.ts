/**
 * Phase 19-B migration: create release_daily_snapshots table.
 *
 * Safe by default: DRY-RUN unless --apply is passed.
 * Idempotent: skips if the table already exists.
 * No backfill — burndown data starts accumulating from the first cron run.
 *
 * Usage:
 *   yarn tsx scripts/migrate-release-daily-snapshots.ts            # dry-run
 *   yarn tsx scripts/migrate-release-daily-snapshots.ts --apply    # execute
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [[{ schema }]] = (await conn.query("SELECT DATABASE() AS `schema`")) as [
    [{ schema: string }],
    unknown,
  ];

  console.log(`Target database: ${schema}`);
  console.log(`Mode: ${MODE}`);
  if (!APPLY) {
    console.log("  (SQL below will NOT be executed — re-run with --apply to commit changes)");
  }
  console.log();

  const tableExists = async (table: string) => {
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
      [schema, table],
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
      sql
        .trim()
        .split("\n")
        .forEach((line) => console.log(`      ${line}`));
    }
  };

  if (await tableExists("release_daily_snapshots")) {
    console.log("  [skip] release_daily_snapshots table already exists");
  } else {
    await run(
      "release_daily_snapshots table",
      `CREATE TABLE \`release_daily_snapshots\` (
  \`id\` varchar(191) NOT NULL,
  \`releaseId\` varchar(191) NOT NULL,
  \`date\` varchar(50) NOT NULL,
  \`done\` int NULL DEFAULT 0,
  \`inProgress\` int NULL DEFAULT 0,
  \`toDo\` int NULL DEFAULT 0,
  \`staging\` int NULL DEFAULT 0,
  \`production\` int NULL DEFAULT 0,
  \`createdAt\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`release_daily_snapshots_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`release_daily_snapshots_release_fk\` FOREIGN KEY (\`releaseId\`) REFERENCES \`jira_releases\`(\`id\`),
  INDEX \`idx_release_daily_snapshots_release_date\` (\`releaseId\`, \`date\`)
)`,
    );
  }

  await conn.end();

  console.log();
  if (APPLY) {
    console.log(`Done. ${executed} statement(s) executed.`);
  } else if (planned === 0) {
    console.log("Nothing to do — schema is already up to date.");
  } else {
    console.log(`Dry-run complete. ${planned} statement(s) would be executed.`);
    console.log("Re-run with --apply to commit these changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
