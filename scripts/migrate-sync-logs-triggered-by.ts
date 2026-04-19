/**
 * Migration: add `triggeredBy` + `triggeredByUserId` columns to `sync_logs`
 * so the /automations admin page can show an honest "Source" — `cron`
 * vs `manual`, and for manual runs, show WHO triggered it (clickable
 * link to the member profile page when the user is also a team member).
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent — checks
 * information_schema before each ALTER.
 *
 * Usage:
 *   yarn tsx scripts/migrate-sync-logs-triggered-by.ts            # dry-run
 *   yarn tsx scripts/migrate-sync-logs-triggered-by.ts --apply    # execute
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [[{ schema }]] = (await conn.query(
      "SELECT DATABASE() AS `schema`",
    )) as [[{ schema: string }], unknown];

    console.log(`Target database: ${schema}`);
    console.log(`Mode: ${MODE}`);
    if (!APPLY)
      console.log("  (SQL below will NOT be executed — re-run with --apply)");
    console.log();

    const columnExists = async (table: string, column: string) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1",
        [schema, table, column],
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

    if (await columnExists("sync_logs", "triggeredBy")) {
      console.log("  [skip] sync_logs.triggeredBy already exists");
    } else {
      await run(
        "sync_logs.triggeredBy ENUM('cron','manual') NULL",
        "ALTER TABLE `sync_logs` ADD COLUMN `triggeredBy` ENUM('cron','manual') NULL AFTER `error`",
      );
    }

    if (await columnExists("sync_logs", "triggeredByUserId")) {
      console.log("  [skip] sync_logs.triggeredByUserId already exists");
    } else {
      await run(
        "sync_logs.triggeredByUserId VARCHAR(191) NULL",
        "ALTER TABLE `sync_logs` ADD COLUMN `triggeredByUserId` VARCHAR(191) NULL AFTER `triggeredBy`",
      );
    }

    console.log();
    if (APPLY) {
      console.log(`Done. ${executed} statement(s) executed.`);
    } else if (planned === 0) {
      console.log("Nothing to do — columns already up to date.");
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
