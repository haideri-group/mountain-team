/**
 * Phase 20 migration: add `issues.deploymentsSyncedAt` column + index,
 * extend `sync_logs.type` enum with `deployment_backfill`.
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent — checks
 * information_schema before each change.
 *
 * Usage:
 *   yarn tsx scripts/migrate-deployment-backfill.ts            # dry-run
 *   yarn tsx scripts/migrate-deployment-backfill.ts --apply    # execute
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

// Must match the enum declared in src/lib/db/schema.ts
const NEW_ENUM_VALUES = [
  "full",
  "incremental",
  "manual",
  "team_sync",
  "worklog_sync",
  "timedoctor_sync",
  "release_sync",
  "deployment_backfill",
];

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

    const getEnumValues = async (table: string, column: string): Promise<string[]> => {
      const [rows] = (await conn.query(
        `SELECT COLUMN_TYPE FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
        [schema, table, column],
      )) as [Array<{ COLUMN_TYPE: string }>, unknown];
      if (rows.length === 0) return [];
      const match = rows[0].COLUMN_TYPE.match(/^enum\((.*)\)$/i);
      if (!match) return [];
      return match[1]
        .split(",")
        .map((s) => s.trim().replace(/^'|'$/g, "").replace(/''/g, "'"));
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
        sql.trim().split("\n").forEach((line) => console.log(`      ${line}`));
      }
    };

    // ── 1. issues.deploymentsSyncedAt column ───────────────────────────
    if (await columnExists("issues", "deploymentsSyncedAt")) {
      console.log("  [skip] issues.deploymentsSyncedAt already exists");
    } else {
      await run(
        "issues.deploymentsSyncedAt column",
        "ALTER TABLE `issues` ADD COLUMN `deploymentsSyncedAt` timestamp NULL",
      );
    }

    // ── 2. idx_issues_deployments_synced_at index ──────────────────────
    if (await indexExists("issues", "idx_issues_deployments_synced_at")) {
      console.log("  [skip] idx_issues_deployments_synced_at already exists");
    } else {
      await run(
        "idx_issues_deployments_synced_at index",
        "ALTER TABLE `issues` ADD INDEX `idx_issues_deployments_synced_at` (`deploymentsSyncedAt`)",
      );
    }

    // ── 3. sync_logs.type enum extension ───────────────────────────────
    // MODIFY COLUMN replaces the entire enum definition, so we emit the
    // UNION of current values + new values. Listing only NEW_ENUM_VALUES
    // would silently drop any values the live DB has that aren't in our list.
    const currentEnum = await getEnumValues("sync_logs", "type");
    const missing = NEW_ENUM_VALUES.filter((v) => !currentEnum.includes(v));
    if (missing.length === 0) {
      console.log("  [skip] sync_logs.type enum already has deployment_backfill");
    } else {
      const merged = [...new Set([...currentEnum, ...NEW_ENUM_VALUES])];
      const quoted = merged.map((v) => `'${v}'`).join(", ");
      await run(
        `sync_logs.type enum (+${missing.length}: ${missing.join(", ")})`,
        `ALTER TABLE \`sync_logs\` MODIFY COLUMN \`type\` enum(${quoted}) NOT NULL`,
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
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
