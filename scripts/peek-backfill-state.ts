/**
 * Read-only peek at the most recent deployment_backfill sync_logs rows.
 * Tells us if a run is currently in progress, how old it is, etc.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = (await conn.query(
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

    if (rows.length === 0) {
      console.log("No deployment_backfill sync_logs rows.");
      return;
    }

    console.log(`Last ${rows.length} deployment_backfill runs (newest first):`);
    for (const r of rows) {
      const started = r.startedAt ? new Date(r.startedAt).toISOString() : "—";
      const completed = r.completedAt ? new Date(r.completedAt).toISOString() : "—";
      const ageSec = r.startedAt
        ? Math.round((Date.now() - new Date(r.startedAt).getTime()) / 1000)
        : 0;
      console.log(
        `  ${r.id}  status=${r.status}  age=${ageSec}s  issues=${r.issueCount ?? 0}`,
      );
      console.log(`    started=${started}  completed=${completed}`);
      if (r.error) console.log(`    error=${r.error.slice(0, 120)}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
