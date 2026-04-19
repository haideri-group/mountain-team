/**
 * Phase 20 diagnostic: reports deployment-backfill coverage across tracked
 * issues. Read-only — safe to run anytime (no writes, no external API calls).
 *
 * Usage:
 *   yarn tsx scripts/diagnose-backfill-progress.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [[total]] = (await conn.query(
      `SELECT COUNT(*) AS n FROM issues i
       JOIN boards b ON b.id = i.boardId
       WHERE b.isTracked = 1`,
    )) as [Array<{ n: number }>, unknown];

    const [[synced]] = (await conn.query(
      `SELECT COUNT(*) AS n FROM issues i
       JOIN boards b ON b.id = i.boardId
       WHERE b.isTracked = 1 AND i.deploymentsSyncedAt IS NOT NULL`,
    )) as [Array<{ n: number }>, unknown];

    const [[unsynced]] = (await conn.query(
      `SELECT COUNT(*) AS n FROM issues i
       JOIN boards b ON b.id = i.boardId
       WHERE b.isTracked = 1 AND i.deploymentsSyncedAt IS NULL`,
    )) as [Array<{ n: number }>, unknown];

    const [[withDeployments]] = (await conn.query(
      `SELECT COUNT(DISTINCT i.id) AS n FROM issues i
       JOIN boards b ON b.id = i.boardId
       WHERE b.isTracked = 1
         AND EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey)`,
    )) as [Array<{ n: number }>, unknown];

    const [byStatus] = (await conn.query(
      `SELECT i.status,
              COUNT(*) AS total,
              SUM(CASE WHEN i.deploymentsSyncedAt IS NOT NULL THEN 1 ELSE 0 END) AS synced,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM deployments d WHERE d.jiraKey = i.jiraKey) THEN 1 ELSE 0 END) AS withDeployments
       FROM issues i
       JOIN boards b ON b.id = i.boardId
       WHERE b.isTracked = 1
       GROUP BY i.status
       ORDER BY total DESC`,
    )) as [
      Array<{ status: string; total: number; synced: number; withDeployments: number }>,
      unknown,
    ];

    const [recentRuns] = (await conn.query(
      `SELECT id, status, startedAt, completedAt, issueCount, error
       FROM sync_logs
       WHERE type = 'deployment_backfill'
       ORDER BY startedAt DESC
       LIMIT 5`,
    )) as [
      Array<{
        id: string;
        status: string;
        startedAt: Date | null;
        completedAt: Date | null;
        issueCount: number | null;
        error: string | null;
      }>,
      unknown,
    ];

    const totalN = Number(total.n);
    const syncedN = Number(synced.n);
    const unsyncedN = Number(unsynced.n);
    const withDepN = Number(withDeployments.n);
    const pct = totalN > 0 ? ((syncedN / totalN) * 100).toFixed(1) : "0.0";
    const depPct = totalN > 0 ? ((withDepN / totalN) * 100).toFixed(1) : "0.0";

    console.log("── Deployment backfill progress ──────────────────────────────");
    console.log(`  Tracked issues:      ${totalN}`);
    console.log(`  Synced:              ${syncedN} (${pct}%)`);
    console.log(`  Unsynced (queued):   ${unsyncedN}`);
    console.log(`  With ≥1 deployment:  ${withDepN} (${depPct}%)`);
    console.log();

    console.log("── By status ─────────────────────────────────────────────────");
    console.log(
      "  status".padEnd(20) +
        "total".padStart(8) +
        "synced".padStart(10) +
        "hasDep".padStart(10),
    );
    for (const r of byStatus) {
      console.log(
        `  ${r.status.padEnd(18)}` +
          `${String(r.total).padStart(8)}` +
          `${String(r.synced).padStart(10)}` +
          `${String(r.withDeployments).padStart(10)}`,
      );
    }
    console.log();

    console.log("── Recent backfill runs ──────────────────────────────────────");
    if (recentRuns.length === 0) {
      console.log("  (none)");
    } else {
      for (const r of recentRuns) {
        const start = r.startedAt ? new Date(r.startedAt).toISOString() : "—";
        const issueN = r.issueCount ?? 0;
        console.log(
          `  ${start}  ${r.status.padEnd(10)}  issues=${issueN}` +
            (r.error ? `  err=${r.error.slice(0, 60)}` : ""),
        );
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
