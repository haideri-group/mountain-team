/**
 * Migration: add `progressProcessed` + `progressTotal` columns to
 * `sync_logs` so the /automations progress bar + ETA work across
 * processes.
 *
 * Why: progress counts today live in process-local in-memory
 * singletons (issue-sync, team-sync, deployment-backfill). When the
 * backfill runs on prod and an admin views /automations on dev, dev's
 * singleton is empty for that logId → no counts → indeterminate bar,
 * no ETA. Persisting the counts in the DB during the run lets any
 * process read them back.
 *
 * ⚠️  ROLLOUT ORDER — read before deploying:
 *   This migration MUST land BEFORE (or simultaneously with) the app
 *   code that reads/writes these columns. Drizzle emits explicit column
 *   lists — a code-first rollout will fail every sync with MySQL
 *   `Unknown column 'progressProcessed' in 'field list'` and take
 *   down every `/api/cron/*` route.
 *
 *   Deploy order for Railway:
 *     1. Run this script against prod with `--apply` FIRST.
 *     2. Then push/deploy the app code.
 *   (General rule: see `CLAUDE.md` → "Schema Changes".)
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent — checks
 * information_schema before each ALTER. Columns are NULL-able so the
 * migration is non-disruptive to in-flight syncs (existing queries
 * don't reference the new columns yet).
 *
 * Usage:
 *   yarn tsx scripts/migrate-sync-logs-progress.ts            # dry-run
 *   yarn tsx scripts/migrate-sync-logs-progress.ts --apply    # execute
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

    console.log(`Target: ${schema}  mode: ${MODE}`);
    if (!APPLY) console.log("  (no ALTERs will be executed — re-run with --apply)\n");

    const columnExists = async (column: string) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'sync_logs' AND column_name = ? LIMIT 1",
        [schema, column],
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

    if (await columnExists("progressProcessed")) {
      console.log("  [skip] sync_logs.progressProcessed already exists");
    } else {
      await run(
        "sync_logs.progressProcessed INT NULL",
        "ALTER TABLE `sync_logs` ADD COLUMN `progressProcessed` INT NULL AFTER `issueCount`",
      );
    }

    if (await columnExists("progressTotal")) {
      console.log("  [skip] sync_logs.progressTotal already exists");
    } else {
      await run(
        "sync_logs.progressTotal INT NULL",
        "ALTER TABLE `sync_logs` ADD COLUMN `progressTotal` INT NULL AFTER `progressProcessed`",
      );
    }

    console.log();
    if (APPLY) {
      console.log(`Done. ${executed} ALTER(s) executed.`);
    } else if (planned === 0) {
      console.log("Nothing to do — columns already up to date.");
    } else {
      console.log(`Dry-run complete. ${planned} ALTER(s) would be executed.`);
      console.log("Re-run with --apply to commit these changes.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
