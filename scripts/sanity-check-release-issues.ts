/**
 * Read-only sanity check after the Phase 19-A migration. Prints counts only,
 * never mutates. Safe to run any time.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const q = async <T,>(sql: string): Promise<T[]> => {
    const [rows] = await conn.query(sql);
    return rows as T[];
  };

  const [{ c: riActive }] = await q<{ c: number }>(
    "SELECT COUNT(*) AS c FROM release_issues WHERE removedAt IS NULL",
  );
  const [{ c: riRemoved }] = await q<{ c: number }>(
    "SELECT COUNT(*) AS c FROM release_issues WHERE removedAt IS NOT NULL",
  );
  const [{ c: issuesWithFv }] = await q<{ c: number }>(
    "SELECT COUNT(*) AS c FROM issues WHERE fixVersions IS NOT NULL AND fixVersions != '[]' AND fixVersions != ''",
  );
  const [{ c: releases }] = await q<{ c: number }>(
    "SELECT COUNT(*) AS c FROM jira_releases WHERE archived = 0",
  );
  const [{ c: syncedReleases }] = await q<{ c: number }>(
    "SELECT COUNT(*) AS c FROM jira_releases WHERE lastSyncedAt IS NOT NULL",
  );
  const [{ c: ownedReleases }] = await q<{ c: number }>(
    "SELECT COUNT(*) AS c FROM jira_releases WHERE ownerUserId IS NOT NULL",
  );

  console.log("Phase 19-A post-migration state");
  console.log("──────────────────────────────────────");
  console.log(`release_issues (active):          ${riActive}`);
  console.log(`release_issues (removed/audit):   ${riRemoved}`);
  console.log(`issues with fixVersions:          ${issuesWithFv}`);
  console.log(`jira_releases (unarchived):       ${releases}`);
  console.log(`  ├─ with lastSyncedAt stamped:   ${syncedReleases}`);
  console.log(`  └─ with owner assigned:         ${ownedReleases}`);
  console.log();

  // Top 5 releases by active membership count
  const topReleases = await q<{ name: string; projectKey: string; c: number }>(
    `SELECT r.name, r.projectKey, COUNT(ri.id) AS c
     FROM jira_releases r
     LEFT JOIN release_issues ri ON ri.releaseId = r.id AND ri.removedAt IS NULL
     WHERE r.archived = 0
     GROUP BY r.id
     ORDER BY c DESC
     LIMIT 5`,
  );
  console.log("Top 5 releases by active issue count:");
  for (const r of topReleases) {
    console.log(`  ${r.projectKey}  ${r.name.padEnd(30)} ${r.c} issues`);
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
