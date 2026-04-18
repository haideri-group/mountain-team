/**
 * Phase 19-A migration: create release_issues junction table + two new
 * columns on jira_releases (lastSyncedAt, ownerUserId), then backfill
 * release_issues from the existing issues.fixVersions JSON.
 *
 * Safe by default: DRY-RUN unless --apply is passed.
 * Idempotent: checks information_schema before adding anything; backfill
 * uses INSERT IGNORE so re-runs don't create duplicates.
 *
 * Usage:
 *   yarn tsx scripts/migrate-release-issues.ts            # dry-run
 *   yarn tsx scripts/migrate-release-issues.ts --apply    # execute
 */
import "dotenv/config";
import crypto from "crypto";
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

  const constraintExists = async (table: string, name: string) => {
    const [rows] = await conn.query(
      "SELECT 1 FROM information_schema.table_constraints WHERE table_schema = ? AND table_name = ? AND constraint_name = ? LIMIT 1",
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
      sql
        .trim()
        .split("\n")
        .forEach((line) => console.log(`      ${line}`));
    }
  };

  // ── 1. release_issues table ────────────────────────────────────────────
  if (await tableExists("release_issues")) {
    console.log("  [skip] release_issues table already exists");
  } else {
    await run(
      "release_issues table",
      `CREATE TABLE \`release_issues\` (
  \`id\` varchar(191) NOT NULL,
  \`releaseId\` varchar(191) NOT NULL,
  \`jiraKey\` varchar(50) NOT NULL,
  \`addedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`removedAt\` timestamp NULL,
  CONSTRAINT \`release_issues_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`release_issues_release_fk\` FOREIGN KEY (\`releaseId\`) REFERENCES \`jira_releases\`(\`id\`),
  INDEX \`idx_release_issues_release_key\` (\`releaseId\`, \`jiraKey\`),
  INDEX \`idx_release_issues_jirakey\` (\`jiraKey\`)
)`,
    );
  }

  // ── 2. jira_releases.lastSyncedAt ──────────────────────────────────────
  if (await columnExists("jira_releases", "lastSyncedAt")) {
    console.log("  [skip] jira_releases.lastSyncedAt already exists");
  } else {
    await run(
      "jira_releases.lastSyncedAt column",
      "ALTER TABLE `jira_releases` ADD COLUMN `lastSyncedAt` timestamp NULL",
    );
  }

  // ── 3. jira_releases.ownerUserId ───────────────────────────────────────
  // Column and FK are checked INDEPENDENTLY. If a previous partial run added
  // the column but crashed before the FK, collapsing them into one
  // conditional branch would silently skip the FK forever.
  if (await columnExists("jira_releases", "ownerUserId")) {
    console.log("  [skip] jira_releases.ownerUserId column already exists");
  } else {
    await run(
      "jira_releases.ownerUserId column",
      "ALTER TABLE `jira_releases` ADD COLUMN `ownerUserId` varchar(191) NULL",
    );
  }
  if (await constraintExists("jira_releases", "jira_releases_owner_fk")) {
    console.log("  [skip] jira_releases_owner_fk already exists");
  } else {
    await run(
      "jira_releases.ownerUserId FK",
      "ALTER TABLE `jira_releases` ADD CONSTRAINT `jira_releases_owner_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`)",
    );
  }

  // ── 4. Backfill release_issues from issues.fixVersions ─────────────────
  // Only attempt after structure is in place (skipped entirely in dry-run
  // since the table may not exist yet).
  console.log();
  if (!APPLY) {
    console.log("  [would backfill] release_issues from issues.fixVersions JSON");
    console.log("      (queries issues with non-empty fixVersions, joins on jira_releases.name + projectKey)");
  } else if (await tableExists("release_issues")) {
    console.log("Backfilling release_issues from existing issues...");

    // Load issues with fixVersions + their board's projectKey.
    const [issueRows] = (await conn.query(
      `SELECT i.jiraKey, i.fixVersions, b.jiraKey AS projectKey
       FROM issues i
       JOIN boards b ON i.boardId = b.id
       WHERE i.fixVersions IS NOT NULL AND i.fixVersions != '[]' AND i.fixVersions != ''`,
    )) as [Array<{ jiraKey: string; fixVersions: string; projectKey: string }>, unknown];

    // Load all releases keyed by projectKey + name for O(1) lookup.
    const [releaseRows] = (await conn.query(
      "SELECT id, projectKey, name FROM jira_releases WHERE archived = 0",
    )) as [Array<{ id: string; projectKey: string; name: string }>, unknown];

    const releaseMap = new Map<string, string>();
    for (const r of releaseRows) {
      releaseMap.set(`${r.projectKey}:${r.name}`, r.id);
    }

    let inserted = 0;
    let skippedMissing = 0;
    let skippedBadJson = 0;

    for (const row of issueRows) {
      let versionNames: string[];
      try {
        versionNames = JSON.parse(row.fixVersions);
        if (!Array.isArray(versionNames)) {
          skippedBadJson += 1;
          continue;
        }
      } catch {
        skippedBadJson += 1;
        continue;
      }

      for (const name of versionNames) {
        const releaseId = releaseMap.get(`${row.projectKey}:${name}`);
        if (!releaseId) {
          skippedMissing += 1;
          continue;
        }
        const id = `ri_${crypto.randomBytes(8).toString("hex")}`;
        const [result] = (await conn.query(
          `INSERT IGNORE INTO release_issues (id, releaseId, jiraKey, addedAt, removedAt)
           SELECT ?, ?, ?, CURRENT_TIMESTAMP, NULL
           FROM DUAL
           WHERE NOT EXISTS (
             SELECT 1 FROM release_issues
             WHERE releaseId = ? AND jiraKey = ? AND removedAt IS NULL
           )`,
          [id, releaseId, row.jiraKey, releaseId, row.jiraKey],
        )) as [{ affectedRows: number }, unknown];
        if (result.affectedRows > 0) inserted += 1;
      }
    }

    console.log(`  [+] Backfilled ${inserted} release_issues rows`);
    if (skippedMissing > 0) {
      console.log(`  [!] Skipped ${skippedMissing} entries: release not found (stale fixVersion name?)`);
    }
    if (skippedBadJson > 0) {
      console.log(`  [!] Skipped ${skippedBadJson} entries: fixVersions JSON parse failed`);
    }
  }

  await conn.end();

  console.log();
  if (APPLY) {
    console.log(`Done. ${executed} schema statement(s) executed + backfill complete.`);
  } else if (planned === 0) {
    console.log("Nothing to do — schema is already up to date.");
    console.log("Backfill is only performed in --apply mode.");
  } else {
    console.log(`Dry-run complete. ${planned} statement(s) would be executed.`);
    console.log("Re-run with --apply to commit these changes and backfill.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
