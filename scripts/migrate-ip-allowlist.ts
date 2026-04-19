/**
 * Phase 20.5 migration: create `ip_allowlist` table + seed bootstrap IPs.
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent — checks
 * information_schema before DDL; seeds only IPs that don't already exist.
 *
 * Usage:
 *   yarn tsx scripts/migrate-ip-allowlist.ts            # dry-run
 *   yarn tsx scripts/migrate-ip-allowlist.ts --apply    # execute
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

// Bootstrap IPs — seeded on first run so the team isn't locked out.
// Admins can add/remove from the Settings UI after deploy.
const SEED_IPS: Array<{ cidr: string; label: string | null }> = [
  { cidr: "115.186.149.242", label: null },
  { cidr: "182.191.91.226", label: null },
  { cidr: "59.103.26.251", label: null },
  { cidr: "110.93.204.124", label: null },
  { cidr: "195.171.9.180", label: null },
  { cidr: "110.93.204.122", label: null },
  { cidr: "127.0.0.1", label: "Localhost (IPv4)" },
  { cidr: "::1", label: "Localhost (IPv6)" },
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

    // ── 4. seed bootstrap IPs ─────────────────────────────────────────
    // In dry-run on a fresh DB, the table doesn't exist yet — skip the
    // SELECT. On --apply, the CREATE above has already run, so this works.
    const tableNowExists = APPLY || (await tableExists("ip_allowlist"));
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
