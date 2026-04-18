/**
 * Add a composite index `(environment, deployedAt)` to the deployments table.
 *
 * The existing `idx_deployments_jirakey_env` has `jiraKey` as its leading
 * column, so MySQL cannot use it for queries that filter only on
 * `environment` and order by `deployedAt` — notably the mismatches pass in
 * `/api/deployments` and the site-overview batched fetch. Those queries
 * currently fall back to full-table scan + filesort, which scales linearly
 * with the deployments table size.
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent — skips if present.
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
        sql.trim().split("\n").forEach((line) => console.log(`      ${line}`));
      }
    };

    if (await indexExists("deployments", "idx_deployments_env_deployed_at")) {
      console.log("  [skip] idx_deployments_env_deployed_at already exists");
    } else {
      await run(
        "idx_deployments_env_deployed_at composite index",
        "ALTER TABLE `deployments` ADD INDEX `idx_deployments_env_deployed_at` (`environment`, `deployedAt`)",
      );
    }

    console.log();
    if (APPLY) {
      console.log(`Done. ${executed} statement(s) executed.`);
    } else if (planned === 0) {
      console.log("Nothing to do — index already present.");
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
