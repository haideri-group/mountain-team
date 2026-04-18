/**
 * Creates the `webhook_logs` table if missing.
 *
 * Safe by default: runs in DRY-RUN mode and prints the SQL it WOULD
 * execute without touching the database. Pass --apply to actually run.
 *
 * Idempotent: checks information_schema before creating. On the live
 * Railway DB this will always report [skip] (the table already exists
 * with 27k+ rows). It's here for fresh environments (new clones,
 * local dev DBs) where the table doesn't exist yet.
 *
 * Usage:
 *   yarn tsx scripts/migrate-webhook-logs.ts            # dry-run (default)
 *   yarn tsx scripts/migrate-webhook-logs.ts --apply    # execute
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }

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

  if (await tableExists("webhook_logs")) {
    console.log("  [skip] webhook_logs table already exists");
  } else {
    await run(
      "webhook_logs table",
      `CREATE TABLE \`webhook_logs\` (
  \`id\` varchar(191) NOT NULL,
  \`source\` varchar(50) NOT NULL,
  \`event\` varchar(100) NULL,
  \`payload\` text NULL,
  \`result\` varchar(500) NULL,
  \`receivedAt\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`webhook_logs_id\` PRIMARY KEY(\`id\`)
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
