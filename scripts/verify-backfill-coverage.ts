/**
 * Read-only: reconciles the coverage numbers the Settings panel shows
 * against what's actually in the DB. Flags mismatches between:
 *   - "synced" (`deploymentsSyncedAt IS NOT NULL`) = the Settings bar
 *   - issues that actually have `>= 1 deployment row`
 *   - issues that are done/closed AND fully-covered per brand-resolver
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const q = async (sql: string): Promise<number> => {
      const [rows] = (await conn.query(sql)) as [Array<{ n: number }>, unknown];
      return Number(rows[0]?.n ?? 0);
    };

    const totalTracked = await q(`
      SELECT COUNT(*) AS n FROM issues i
      JOIN boards b ON b.id = i.boardId
      WHERE b.isTracked = 1
    `);

    const syncedCount = await q(`
      SELECT COUNT(*) AS n FROM issues i
      JOIN boards b ON b.id = i.boardId
      WHERE b.isTracked = 1 AND i.deploymentsSyncedAt IS NOT NULL
    `);

    const unsyncedCount = await q(`
      SELECT COUNT(*) AS n FROM issues i
      JOIN boards b ON b.id = i.boardId
      WHERE b.isTracked = 1 AND i.deploymentsSyncedAt IS NULL
    `);

    const withAnyDeployment = await q(`
      SELECT COUNT(DISTINCT i.id) AS n FROM issues i
      JOIN boards b ON b.id = i.boardId
      WHERE b.isTracked = 1
        AND EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey)
    `);

    const syncedButNoDeployment = await q(`
      SELECT COUNT(*) AS n FROM issues i
      JOIN boards b ON b.id = i.boardId
      WHERE b.isTracked = 1
        AND i.deploymentsSyncedAt IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey)
    `);

    const unsyncedButHasDeployment = await q(`
      SELECT COUNT(*) AS n FROM issues i
      JOIN boards b ON b.id = i.boardId
      WHERE b.isTracked = 1
        AND i.deploymentsSyncedAt IS NULL
        AND EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey)
    `);

    const [[{ depRows }]] = (await conn.query(
      `SELECT COUNT(*) AS depRows FROM deployments`,
    )) as [Array<{ depRows: number }>, unknown];

    const pct = (num: number) =>
      totalTracked > 0 ? ((num / totalTracked) * 100).toFixed(1) + "%" : "—";

    console.log("Settings-panel view:");
    console.log(`  total tracked issues  : ${totalTracked}`);
    console.log(`  synced (stamped)      : ${syncedCount}  (${pct(syncedCount)})`);
    console.log(`  unsynced              : ${unsyncedCount}`);
    console.log();
    console.log("Actual deployment data:");
    console.log(`  issues with >=1 deploy: ${withAnyDeployment}  (${pct(withAnyDeployment)})`);
    console.log(`  total deployment rows : ${Number(depRows)}`);
    console.log();
    console.log("Discrepancies:");
    console.log(
      `  stamped but zero rows  : ${syncedButNoDeployment}  ← backfill stamped \"checked\" but found nothing (genuinely no PRs, OR dev-status returned empty)`,
    );
    console.log(
      `  unstamped but has rows : ${unsyncedButHasDeployment}  ← pre-existing deployments from webhook/per-issue sync that the backfill hasn't processed yet`,
    );
    console.log();
    console.log("Interpretation:");
    console.log(`  The bar shows \"${syncedCount}/${totalTracked} synced\" = ${pct(syncedCount)}.`);
    console.log(`  That's 'issues touched by the backfill (or per-issue sync, or selector bulk-stamp)',`);
    console.log(`  NOT 'issues that have deployment data in the deployments table'.`);
    if (withAnyDeployment !== syncedCount) {
      console.log();
      console.log(
        `  ${syncedCount - withAnyDeployment} of the ${syncedCount} 'synced' issues have NO deployment rows.`,
      );
      console.log(
        `  ${unsyncedButHasDeployment} of the ${unsyncedCount} 'unsynced' issues DO have deployment rows.`,
      );
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
