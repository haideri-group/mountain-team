/**
 * Phase 21 migration: add two composite indexes on `sync_logs` to support
 * the `/logs` admin page filters + summary queries.
 *
 *   idx_sync_logs_type_started   (type, startedAt)
 *   idx_sync_logs_status_started (status, startedAt)
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent — checks
 * information_schema before each ALTER.
 *
 * Usage:
 *   yarn tsx scripts/migrate-sync-logs-index.ts            # dry-run
 *   yarn tsx scripts/migrate-sync-logs-index.ts --apply    # execute
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

    if (await indexExists("sync_logs", "idx_sync_logs_type_started")) {
      console.log("  [skip] idx_sync_logs_type_started already exists");
    } else {
      await run(
        "idx_sync_logs_type_started (type, startedAt)",
        "ALTER TABLE `sync_logs` ADD INDEX `idx_sync_logs_type_started` (`type`, `startedAt`)",
      );
    }

    if (await indexExists("sync_logs", "idx_sync_logs_status_started")) {
      console.log("  [skip] idx_sync_logs_status_started already exists");
    } else {
      await run(
        "idx_sync_logs_status_started (status, startedAt)",
        "ALTER TABLE `sync_logs` ADD INDEX `idx_sync_logs_status_started` (`status`, `startedAt`)",
      );
    }

    console.log();
    if (APPLY) {
      console.log(`Done. ${executed} statement(s) executed.`);
    } else if (planned === 0) {
      console.log("Nothing to do — indexes already up to date.");
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
