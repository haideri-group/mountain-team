/**
 * Phase 19-C migration:
 *   1. Extend notifications.type enum with 5 release_* values
 *   2. Add notifications.relatedReleaseId (FK → jira_releases)
 *   3. Create release_checklist_items table
 *
 * Safe by default: DRY-RUN unless --apply is passed.
 * Idempotent: every step checks current state before mutating.
 *
 * Usage:
 *   yarn tsx scripts/migrate-phase-c.ts            # dry-run
 *   yarn tsx scripts/migrate-phase-c.ts --apply    # execute
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

const NEW_ENUM_VALUES = [
  "aging",
  "overdue",
  "capacity",
  "completed",
  "unblocked",
  "deployed",
  "user_joined",
  "release_overdue",
  "release_ready",
  "release_deployed",
  "release_scope_changed",
  "release_stale",
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [[{ schema }]] = (await conn.query("SELECT DATABASE() AS `schema`")) as [
    [{ schema: string }],
    unknown,
  ];

  console.log(`Target database: ${schema}`);
  console.log(`Mode: ${MODE}`);
  if (!APPLY) console.log("  (SQL below will NOT be executed — re-run with --apply)");
  console.log();

  const tableExists = async (table: string) => {
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
      [schema, table],
    );
    return (rows as unknown[]).length > 0;
  };

  const columnExists = async (table: string, column: string) => {
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1",
      [schema, table, column],
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
    // enum('a','b','c') → ['a','b','c']
    const match = rows[0].COLUMN_TYPE.match(/^enum\((.*)\)$/i);
    if (!match) return [];
    return match[1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, "").replace(/''/g, "'"));
  };

  const constraintExists = async (table: string, name: string) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = ? AND table_name = ? AND constraint_name = ? LIMIT 1`,
      [schema, table, name],
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

  // ── 1. notifications.type enum ─────────────────────────────────────────
  const currentEnum = await getEnumValues("notifications", "type");
  const missing = NEW_ENUM_VALUES.filter((v) => !currentEnum.includes(v));
  if (missing.length === 0) {
    console.log("  [skip] notifications.type enum already has all release_* values");
  } else {
    const quoted = NEW_ENUM_VALUES.map((v) => `'${v}'`).join(", ");
    await run(
      `notifications.type enum (+${missing.length}: ${missing.join(", ")})`,
      `ALTER TABLE \`notifications\` MODIFY COLUMN \`type\` enum(${quoted}) NOT NULL`,
    );
  }

  // ── 2. notifications.relatedReleaseId column + FK ──────────────────────
  if (await columnExists("notifications", "relatedReleaseId")) {
    console.log("  [skip] notifications.relatedReleaseId already exists");
  } else {
    await run(
      "notifications.relatedReleaseId column",
      "ALTER TABLE `notifications` ADD COLUMN `relatedReleaseId` varchar(191) NULL",
    );
  }
  if (await constraintExists("notifications", "notifications_release_fk")) {
    console.log("  [skip] notifications_release_fk already exists");
  } else {
    await run(
      "notifications.relatedReleaseId FK",
      "ALTER TABLE `notifications` ADD CONSTRAINT `notifications_release_fk` FOREIGN KEY (`relatedReleaseId`) REFERENCES `jira_releases`(`id`)",
    );
  }

  // ── 3. release_checklist_items table ───────────────────────────────────
  if (await tableExists("release_checklist_items")) {
    console.log("  [skip] release_checklist_items table already exists");
  } else {
    await run(
      "release_checklist_items table",
      `CREATE TABLE \`release_checklist_items\` (
  \`id\` varchar(191) NOT NULL,
  \`releaseId\` varchar(191) NOT NULL,
  \`label\` varchar(255) NOT NULL,
  \`isComplete\` boolean NOT NULL DEFAULT false,
  \`completedBy\` varchar(191) NULL,
  \`completedAt\` timestamp NULL,
  \`sortOrder\` int NOT NULL DEFAULT 0,
  \`createdAt\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`release_checklist_items_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`release_checklist_items_release_fk\` FOREIGN KEY (\`releaseId\`) REFERENCES \`jira_releases\`(\`id\`),
  CONSTRAINT \`release_checklist_items_user_fk\` FOREIGN KEY (\`completedBy\`) REFERENCES \`users\`(\`id\`),
  INDEX \`idx_release_checklist_release\` (\`releaseId\`)
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
