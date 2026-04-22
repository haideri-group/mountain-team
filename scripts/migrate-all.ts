#!/usr/bin/env tsx
/**
 * Migration orchestrator.
 *
 *   yarn db:migrate:plan      — dry-run; lists pending migrations, no writes
 *   yarn db:migrate:apply     — applies pending migrations
 *
 * Behavior:
 *  - Discovers every `scripts/migrate-*.ts` (excluding this file) in filename
 *    order (so name them with a sortable prefix, e.g. `migrate-m1-*.ts`).
 *  - Tracks applied migrations in the `_migrations` table (auto-created on
 *    first run). A migration already recorded is skipped.
 *  - Takes a MySQL advisory lock via `GET_LOCK('teamflow_migrations', 30)`
 *    so two parallel deploys never race. Released in finally.
 *  - Each migration script is invoked via `tsx <file> --apply`. Scripts must
 *    be idempotent (check information_schema before each change) — see the
 *    existing `scripts/migrate-*.ts` in the repo for the template.
 *  - Destructive migrations (any script whose filename contains "destructive"
 *    or whose first-line JSDoc comment contains `@destructive`) are refused
 *    unless the env var `ALLOW_DESTRUCTIVE_MIGRATIONS=true` is set at runtime.
 *  - Non-zero exit on any failure; successful migrations already applied are
 *    NOT rolled back (idempotent scripts mean re-running is safe after a fix).
 */

import "dotenv/config";
import { createConnection } from "mysql2/promise";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "true";
const LOCK_KEY = "teamflow_migrations";
const LOCK_TIMEOUT_SECONDS = 30;

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PREFIX = "migrate-";
const MIGRATION_EXT = ".ts";
const ORCHESTRATOR_NAME = "migrate-all.ts";

function discoverMigrations(): { name: string; path: string; checksum: string; destructive: boolean }[] {
  return readdirSync(scriptsDir)
    .filter((f) => f.startsWith(MIGRATION_PREFIX) && f.endsWith(MIGRATION_EXT) && f !== ORCHESTRATOR_NAME)
    .sort()
    .map((f) => {
      const full = join(scriptsDir, f);
      if (!statSync(full).isFile()) throw new Error(`Not a file: ${full}`);
      const source = readFileSync(full, "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const firstBlock = source.split("\n").slice(0, 20).join("\n");
      const destructive = /@destructive\b/.test(firstBlock) || f.includes("destructive");
      return { name: f, path: full, checksum, destructive };
    });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");

  const conn = await createConnection(url);

  // Ensure tracking table exists — always safe to run.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name      VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum  CHAR(64)     NOT NULL,
      appliedAt TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Serialize against other deploys.
  const [lockRows] = (await conn.query("SELECT GET_LOCK(?, ?) AS got", [LOCK_KEY, LOCK_TIMEOUT_SECONDS])) as [
    { got: number }[],
    unknown,
  ];
  if (lockRows[0]?.got !== 1) {
    console.error(`Could not acquire advisory lock '${LOCK_KEY}' within ${LOCK_TIMEOUT_SECONDS}s. Is another deploy running?`);
    process.exit(2);
  }

  try {
    const [appliedRows] = (await conn.query("SELECT name, checksum FROM _migrations")) as [
      { name: string; checksum: string }[],
      unknown,
    ];
    const applied = new Map(appliedRows.map((r) => [r.name, r.checksum]));

    const all = discoverMigrations();
    const pending = all.filter((m) => !applied.has(m.name));
    const drifted = all.filter((m) => applied.has(m.name) && applied.get(m.name) !== m.checksum);

    // Report
    console.log(`Discovered ${all.length} migration script(s). ${applied.size} already applied.`);
    if (drifted.length > 0) {
      console.warn("\n⚠  Drift detected — these scripts differ from the version that was applied:");
      for (const d of drifted) console.warn(`   • ${d.name}`);
      console.warn("   Either the script was edited after apply (bad) or the checksum changed for a harmless reason.\n");
    }
    if (pending.length === 0) {
      console.log("Nothing to do — no pending migrations.");
      return;
    }

    console.log(`\nPending (${pending.length}):`);
    for (const m of pending) console.log(`   • ${m.name}${m.destructive ? "  [DESTRUCTIVE]" : ""}`);

    if (!APPLY) {
      console.log("\nDry-run only. Re-run with --apply to execute.");
      return;
    }

    // Destructive guard
    const blockedDestructive = pending.filter((m) => m.destructive && !ALLOW_DESTRUCTIVE);
    if (blockedDestructive.length > 0) {
      console.error("\n✗ Refusing to apply destructive migration(s):");
      for (const m of blockedDestructive) console.error(`   • ${m.name}`);
      console.error("\nSet ALLOW_DESTRUCTIVE_MIGRATIONS=true for this deploy window to permit.");
      process.exit(3);
    }

    for (const m of pending) {
      console.log(`\n▶ Applying ${m.name} ...`);
      const res = spawnSync("tsx", [m.path, "--apply"], {
        stdio: "inherit",
        env: process.env,
      });
      if (res.status !== 0) {
        console.error(`\n✗ ${m.name} exited with code ${res.status}. Halting.`);
        process.exit(res.status ?? 1);
      }
      await conn.query(
        "INSERT INTO _migrations (name, checksum) VALUES (?, ?)",
        [m.name, m.checksum],
      );
      console.log(`✓ ${m.name} recorded in _migrations.`);
    }

    console.log(`\nApplied ${pending.length} migration(s) successfully.`);
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [LOCK_KEY]);
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
