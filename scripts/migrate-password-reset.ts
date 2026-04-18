/**
 * One-shot migration for the password reset feature (PR #36).
 *
 * Safe by default: runs in DRY-RUN mode and prints the SQL it WOULD
 * execute without touching the database. Pass --apply to actually run.
 *
 * Idempotent: each step checks information_schema first and skips if
 * the object already exists. Read-only queries (information_schema)
 * always run — only the mutating statements are gated by --apply.
 *
 * Applies:
 *   - users.passwordChangedAt TIMESTAMP NULL
 *   - password_reset_tokens table (+ PK, + unique on tokenHash)
 *   - 3 non-unique indexes on password_reset_tokens
 *   - FK password_reset_tokens.userId -> users.id
 *
 * Usage:
 *   yarn tsx scripts/migrate-password-reset.ts            # dry-run (default)
 *   yarn tsx scripts/migrate-password-reset.ts --apply    # execute
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

  const tableExists = async (table: string) => {
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
      [schema, table],
    );
    return (rows as unknown[]).length > 0;
  };

  const indexExists = async (table: string, indexName: string) => {
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1",
      [schema, table, indexName],
    );
    return (rows as unknown[]).length > 0;
  };

  const fkExists = async (table: string, constraintName: string) => {
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.table_constraints WHERE table_schema = ? AND table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY' LIMIT 1",
      [schema, table, constraintName],
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

  // 1. users.passwordChangedAt
  if (await columnExists("users", "passwordChangedAt")) {
    console.log("  [skip] users.passwordChangedAt already exists");
  } else {
    await run(
      "users.passwordChangedAt",
      "ALTER TABLE `users` ADD COLUMN `passwordChangedAt` timestamp NULL",
    );
  }

  // 2. password_reset_tokens table
  if (await tableExists("password_reset_tokens")) {
    console.log("  [skip] password_reset_tokens table already exists");
  } else {
    await run(
      "password_reset_tokens table",
      `CREATE TABLE \`password_reset_tokens\` (
  \`id\` varchar(191) NOT NULL,
  \`userId\` varchar(191) NOT NULL,
  \`tokenHash\` varchar(64) NOT NULL,
  \`expiresAt\` timestamp NOT NULL,
  \`usedAt\` timestamp NULL,
  \`requestedIp\` varchar(45) NULL,
  \`requestedAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`password_reset_tokens_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`password_reset_tokens_token_hash_idx\` UNIQUE(\`tokenHash\`)
)`,
    );
  }

  // 3. Foreign key
  if (await fkExists("password_reset_tokens", "password_reset_tokens_userId_users_id_fk")) {
    console.log("  [skip] FK password_reset_tokens_userId_users_id_fk already exists");
  } else {
    await run(
      "FK password_reset_tokens_userId_users_id_fk",
      "ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION",
    );
  }

  // 4. Non-unique indexes
  const indexes: [string, string][] = [
    ["password_reset_tokens_user_requested_at_idx", "`userId`,`requestedAt`"],
    ["password_reset_tokens_ip_requested_at_idx", "`requestedIp`,`requestedAt`"],
    ["password_reset_tokens_expires_at_idx", "`expiresAt`"],
  ];
  for (const [name, cols] of indexes) {
    if (await indexExists("password_reset_tokens", name)) {
      console.log(`  [skip] index ${name} already exists`);
    } else {
      await run(
        `index ${name}`,
        `CREATE INDEX \`${name}\` ON \`password_reset_tokens\` (${cols})`,
      );
    }
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
