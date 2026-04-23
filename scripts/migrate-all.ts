#!/usr/bin/env tsx
/**
 * Migration orchestrator.
 *
 *   yarn db:migrate:plan      — dry-run; lists pending migrations, no writes
 *   yarn db:migrate:apply     — applies pending migrations
 *
 * Deploy-time invocation: the staging workflow runs this script DIRECTLY via
 * `tsx scripts/migrate-all.ts --apply`, not through the yarn alias, because
 * the runtime Docker image doesn't ship yarn.lock. If you add a pre-step to
 * the `db:migrate:apply` package.json script, it will NOT fire during staging
 * deploys — either move the logic into this file, or also update
 * `.github/workflows/deploy-staging.yml`.
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
const BASELINE = process.argv.includes("--baseline");
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

  // Fail fast on contradictory flags — otherwise baseline silently wins
  // over apply, which would hide operator mistakes in deploy scripts.
  if (APPLY && BASELINE) {
    throw Object.assign(
      new Error("Use either --apply or --baseline, not both."),
      { exitCode: 2 },
    );
  }

  const conn = await createConnection(url);
  let lockAcquired = false;

  try {
    // Ensure tracking table exists — always safe to run.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name      VARCHAR(255) NOT NULL PRIMARY KEY,
        checksum  CHAR(64)     NOT NULL,
        appliedAt TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Acquire the advisory lock BEFORE any _migrations writes (baseline or
    // apply), so a `--baseline` run cannot race a concurrent `--apply` and
    // mark migrations as applied while the apply is mid-execution.
    const [lockRows] = (await conn.query("SELECT GET_LOCK(?, ?) AS got", [LOCK_KEY, LOCK_TIMEOUT_SECONDS])) as [
      { got: number }[],
      unknown,
    ];
    if (lockRows[0]?.got !== 1) {
      throw Object.assign(
        new Error(`Could not acquire advisory lock '${LOCK_KEY}' within ${LOCK_TIMEOUT_SECONDS}s. Is another deploy running?`),
        { exitCode: 2 },
      );
    }
    lockAcquired = true;

    // --baseline mode: record every currently-present migration as applied
    // WITHOUT running any of them. Intended for seeding a staging DB whose
    // schema was restored from a prod dump — the historical migrations are
    // already reflected on disk, so re-running them would be wasteful at best
    // and unsafe at worst (one of them imports `../src/lib/ip/match`, which
    // isn't in the runtime image — see Dockerfile). After baseline, only NEW
    // migrations added to scripts/ going forward will execute.
    if (BASELINE) {
      const all = discoverMigrations();
      let inserted = 0;
      let alreadyPresent = 0;
      for (const m of all) {
        const [res] = (await conn.query(
          "INSERT IGNORE INTO _migrations (name, checksum) VALUES (?, ?)",
          [m.name, m.checksum],
        )) as [{ affectedRows: number }, unknown];
        if (res.affectedRows > 0) inserted += 1;
        else alreadyPresent += 1;
      }
      console.log(`Baseline complete: ${inserted} migration(s) recorded as applied, ${alreadyPresent} already present.`);
      console.log("No migration scripts were executed. Future runs of --apply will only execute migrations added AFTER this baseline.");
      return;
    }

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
      throw Object.assign(new Error("Destructive migration blocked"), { exitCode: 3 });
    }

    for (const m of pending) {
      console.log(`\n▶ Applying ${m.name} ...`);
      const res = spawnSync("tsx", [m.path, "--apply"], {
        stdio: "inherit",
        env: process.env,
      });
      if (res.status !== 0) {
        console.error(`\n✗ ${m.name} exited with code ${res.status}. Halting.`);
        throw Object.assign(new Error(`Migration ${m.name} failed`), { exitCode: res.status ?? 1 });
      }
      await conn.query(
        "INSERT INTO _migrations (name, checksum) VALUES (?, ?)",
        [m.name, m.checksum],
      );
      console.log(`✓ ${m.name} recorded in _migrations.`);
    }

    console.log(`\nApplied ${pending.length} migration(s) successfully.`);
  } finally {
    // Release the lock only if we actually acquired it, and don't let a
    // RELEASE_LOCK failure skip conn.end() — nested try/finally guarantees
    // the connection always closes.
    try {
      if (lockAcquired) {
        await conn.query("SELECT RELEASE_LOCK(?)", [LOCK_KEY]);
      }
    } catch (err) {
      console.warn(`[warn] RELEASE_LOCK failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await conn.end();
    }
  }
}

main().catch((err: Error & { exitCode?: number }) => {
  console.error(err);
  process.exit(err.exitCode ?? 1);
});
