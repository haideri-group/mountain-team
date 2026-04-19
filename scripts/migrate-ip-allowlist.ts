/**
 * Phase 20.5 migration: create `ip_allowlist` table + seed bootstrap IPs.
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent — checks
 * information_schema before DDL; seeds only IPs that don't already exist.
 *
 * Usage:
 *   yarn tsx scripts/migrate-ip-allowlist.ts            # dry-run
 *   yarn tsx scripts/migrate-ip-allowlist.ts --apply    # execute
 *
 * Bootstrap IPs:
 *   By default this only seeds 127.0.0.1 + ::1 (localhost). Team-specific
 *   IPs should NOT be hardcoded in source. For a fresh deploy that needs
 *   additional bootstrap entries, set BOOTSTRAP_IP_ALLOWLIST as a JSON
 *   array before running --apply, e.g.
 *
 *     BOOTSTRAP_IP_ALLOWLIST='[
 *       {"cidr":"203.0.113.0/24","label":"Office"},
 *       {"cidr":"198.51.100.5","label":"VPN exit"}
 *     ]' yarn tsx scripts/migrate-ip-allowlist.ts --apply
 *
 *   After bootstrap, admins manage the allowlist via Settings → IP
 *   Allowlist. Re-running the migration does not remove existing rows.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";
import { normalizeCidr } from "../src/lib/ip/match";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

interface SeedRow {
  cidr: string;
  label: string | null;
}

// Default bootstrap: just localhost so dev environments work immediately.
// Prod-specific IPs come from the BOOTSTRAP_IP_ALLOWLIST env var below.
// Each entry passes through normalizeCidr at construction so DEFAULT_SEED
// stores the same canonical form the POST route + env parser produce.
// Without this step, "127.0.0.1" (raw) and "127.0.0.1/32" (canonical)
// would coexist in the DB — UNIQUE-OK but logically duplicate.
const DEFAULT_SEED: SeedRow[] = (
  [
    { cidr: "127.0.0.1", label: "Localhost (IPv4)" },
    { cidr: "::1", label: "Localhost (IPv6)" },
  ] as SeedRow[]
).map((s) => {
  const normalized = normalizeCidr(s.cidr);
  if (!normalized) throw new Error(`DEFAULT_SEED invalid cidr: ${s.cidr}`);
  return { cidr: normalized, label: s.label };
});

function parseEnvBootstrap(raw: string | undefined): SeedRow[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "BOOTSTRAP_IP_ALLOWLIST must be valid JSON (array of {cidr, label?})",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("BOOTSTRAP_IP_ALLOWLIST must be a JSON array");
  }
  const out: SeedRow[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`BOOTSTRAP_IP_ALLOWLIST entry must be an object: ${JSON.stringify(entry)}`);
    }
    const rec = entry as { cidr?: unknown; label?: unknown };
    if (typeof rec.cidr !== "string") {
      throw new Error(`BOOTSTRAP_IP_ALLOWLIST entry missing string cidr: ${JSON.stringify(entry)}`);
    }
    const normalized = normalizeCidr(rec.cidr);
    if (!normalized) {
      throw new Error(`BOOTSTRAP_IP_ALLOWLIST invalid cidr: ${rec.cidr}`);
    }
    let label: string | null = null;
    if (rec.label !== undefined && rec.label !== null) {
      if (typeof rec.label !== "string") {
        throw new Error(`BOOTSTRAP_IP_ALLOWLIST label must be a string: ${JSON.stringify(entry)}`);
      }
      const trimmed = rec.label.trim();
      if (trimmed.length > 255) {
        throw new Error(`BOOTSTRAP_IP_ALLOWLIST label too long (>255 chars): ${trimmed.slice(0, 40)}…`);
      }
      label = trimmed.length > 0 ? trimmed : null;
    }
    out.push({ cidr: normalized, label });
  }
  return out;
}

const SEED_IPS: SeedRow[] = [
  ...DEFAULT_SEED,
  ...parseEnvBootstrap(process.env.BOOTSTRAP_IP_ALLOWLIST),
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

    const tableExists = async (table: string) => {
      const [rows] = await conn.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
        [schema, table],
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

    let planned = 0;
    let executed = 0;
    const run = async (label: string, sql: string, params: unknown[] = []) => {
      planned += 1;
      if (APPLY) {
        await conn.query(sql, params);
        executed += 1;
        console.log(`  [+] ${label}`);
      } else {
        console.log(`  [would apply] ${label}`);
      }
    };

    // ── 1. ip_allowlist table ─────────────────────────────────────────
    if (await tableExists("ip_allowlist")) {
      console.log("  [skip] ip_allowlist table already exists");
    } else {
      await run(
        "create ip_allowlist table",
        `CREATE TABLE \`ip_allowlist\` (
           \`id\` varchar(191) NOT NULL,
           \`cidr\` varchar(64) NOT NULL,
           \`label\` varchar(255),
           \`enabled\` boolean NOT NULL DEFAULT TRUE,
           \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP,
           \`createdBy\` varchar(191),
           PRIMARY KEY (\`id\`),
           UNIQUE KEY \`uidx_ip_allowlist_cidr\` (\`cidr\`),
           CONSTRAINT \`ip_allowlist_createdBy_users_id_fk\`
             FOREIGN KEY (\`createdBy\`) REFERENCES \`users\`(\`id\`)
         )`,
      );
    }

    // ── 2. unique index on cidr (idempotent for pre-existing deploys) ──
    if (await indexExists("ip_allowlist", "uidx_ip_allowlist_cidr")) {
      console.log("  [skip] uidx_ip_allowlist_cidr already exists");
    } else {
      // Pre-flight: if there are duplicate CIDRs in the current table,
      // adding UNIQUE will fail. Report them and abort so the admin can
      // resolve manually. Rare in practice (POST route already guards
      // against dupes at the app layer) but worth catching.
      if (await tableExists("ip_allowlist")) {
        const [dupes] = (await conn.query(
          "SELECT cidr, COUNT(*) AS c FROM ip_allowlist GROUP BY cidr HAVING c > 1",
        )) as [Array<{ cidr: string; c: number }>, unknown];
        if (dupes.length > 0) {
          console.error("  [abort] duplicate CIDRs exist — resolve before adding UNIQUE index:");
          for (const d of dupes) console.error(`          ${d.cidr} (${d.c} rows)`);
          throw new Error(
            "Cannot add UNIQUE index on ip_allowlist.cidr while duplicates exist",
          );
        }
      }
      await run(
        "uidx_ip_allowlist_cidr unique index",
        "ALTER TABLE `ip_allowlist` ADD UNIQUE INDEX `uidx_ip_allowlist_cidr` (`cidr`)",
      );
    }

    // ── 3. enabled index ──────────────────────────────────────────────
    if (await indexExists("ip_allowlist", "idx_ip_allowlist_enabled")) {
      console.log("  [skip] idx_ip_allowlist_enabled already exists");
    } else {
      await run(
        "idx_ip_allowlist_enabled index",
        "ALTER TABLE `ip_allowlist` ADD INDEX `idx_ip_allowlist_enabled` (`enabled`)",
      );
    }

    // ── 4. canonicalize any non-canonical cidr rows ───────────────────
    // Earlier versions of normalizeCidr preserved user input shape, so
    // "127.0.0.1" was stored raw. Now every form converges to canonical
    // CIDR ("127.0.0.1/32"). Update any pre-existing raw rows in place
    // so old and new inserts share one key space. UPDATE IGNORE silently
    // skips rows whose canonical form already exists — that's the only
    // realistic conflict here and the right behavior (keep the canonical
    // row, drop the dupe).
    const tableNowExists = APPLY || (await tableExists("ip_allowlist"));
    if (tableNowExists) {
      const [raw] = (await conn.query(
        "SELECT id, cidr FROM ip_allowlist WHERE cidr NOT LIKE '%/%'",
      )) as [Array<{ id: string; cidr: string }>, unknown];
      if (raw.length === 0) {
        console.log("  [skip] no non-canonical cidr rows to update");
      } else {
        for (const row of raw) {
          const canonical = normalizeCidr(row.cidr);
          if (!canonical || canonical === row.cidr) continue;
          await run(
            `canonicalize cidr: ${row.cidr} → ${canonical}`,
            "UPDATE IGNORE `ip_allowlist` SET `cidr` = ? WHERE `id` = ?",
            [canonical, row.id],
          );
        }
      }
    }

    // ── 5. seed bootstrap IPs ─────────────────────────────────────────
    // In dry-run on a fresh DB, the table doesn't exist yet — skip the
    // SELECT. On --apply, the CREATE above has already run, so this works.
    const existing = new Set<string>();
    if (tableNowExists) {
      const [existingRows] = (await conn.query(
        "SELECT cidr FROM ip_allowlist",
      )) as [Array<{ cidr: string }>, unknown];
      for (const r of existingRows) existing.add(r.cidr);
    }

    const toInsert = SEED_IPS.filter((s) => !existing.has(s.cidr));
    if (toInsert.length === 0) {
      console.log("  [skip] all bootstrap IPs already seeded");
    } else {
      for (const seed of toInsert) {
        await run(
          `seed ip_allowlist row: ${seed.cidr}${seed.label ? ` (${seed.label})` : ""}`,
          "INSERT INTO `ip_allowlist` (`id`, `cidr`, `label`, `enabled`) VALUES (?, ?, ?, TRUE)",
          [`ipallow_${randomUUID().replace(/-/g, "").slice(0, 20)}`, seed.cidr, seed.label],
        );
      }
    }

    console.log();
    if (APPLY) {
      console.log(`Done. ${executed} statement(s) executed.`);
    } else if (planned === 0) {
      console.log("Nothing to do — schema + seeds already up to date.");
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
