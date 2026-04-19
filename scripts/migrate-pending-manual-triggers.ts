/**
 * Migration: create `pending_manual_triggers` table. Stores short-lived
 * "next run of this family is a manual trigger by user X" records.
 *
 * Why: the in-memory `globalThis`-cached marker map works only within a
 * single Node process. The Run Now button sets the marker on the dev
 * server, but Cronicle fires the HTTP request against the production
 * URL — a different process with an empty marker map. Prod's cron
 * handler saw no mark and stamped `triggeredBy=cron`.
 *
 * DB-backed markers are cross-process by design. One row per sync
 * family, UPSERTed on set, atomically consumed + deleted on read.
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent.
 *
 * Usage:
 *   yarn tsx scripts/migrate-pending-manual-triggers.ts          # dry-run
 *   yarn tsx scripts/migrate-pending-manual-triggers.ts --apply  # execute
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
    if (!APPLY) console.log("  (SQL below will NOT be executed — re-run with --apply)\n");

    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
      [schema, "pending_manual_triggers"],
    );
    if ((rows as unknown[]).length > 0) {
      console.log("  [skip] pending_manual_triggers already exists");
      return;
    }

    const sql = `CREATE TABLE \`pending_manual_triggers\` (
  \`family\` VARCHAR(32) NOT NULL,
  \`userId\` VARCHAR(191) NULL,
  \`expiresAt\` DATETIME NOT NULL,
  PRIMARY KEY (\`family\`),
  INDEX \`idx_pmt_expires\` (\`expiresAt\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

    if (APPLY) {
      await conn.query(sql);
      console.log("  [+] created pending_manual_triggers");
    } else {
      console.log("  [would apply]");
      console.log(sql);
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
