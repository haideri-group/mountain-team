/**
 * Adds the `orgJoinedDate` column to `team_members`.
 *
 * Stores the real organization start date fetched from Google Workspace
 * (People API `organizations.startDate`). Kept separate from the existing
 * `joinedDate`, which records when TeamFlow first synced the member.
 *
 * Safe by default: runs in DRY-RUN mode. Pass --apply to execute.
 *
 * Idempotent: checks information_schema.columns before adding.
 *
 * Usage:
 *   yarn tsx scripts/migrate-org-joined-date.ts            # dry-run (default)
 *   yarn tsx scripts/migrate-org-joined-date.ts --apply    # execute
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
      sql
        .trim()
        .split("\n")
        .forEach((line) => console.log(`      ${line}`));
    }
  };

  if (await columnExists("team_members", "orgJoinedDate")) {
    console.log("  [skip] team_members.orgJoinedDate already exists");
  } else {
    await run(
      "add team_members.orgJoinedDate",
      "ALTER TABLE `team_members` ADD COLUMN `orgJoinedDate` varchar(50) NULL AFTER `joinedDate`",
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
