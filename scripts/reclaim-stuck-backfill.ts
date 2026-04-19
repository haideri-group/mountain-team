/**
 * One-off reclaim: mark any `running` deployment_backfill sync_logs row as
 * `failed` so the next cron invocation can start cleanly.
 *
 * Needed when Cronicle's HTTP timeout (or any other disconnect) killed the
 * client-side connection while the app kept processing, leaving an orphan
 * `running` row that the in-process concurrency guard keeps honoring for
 * up to 6h. Bumping Cronicle's timeout prevents recurrence; this script
 * clears the residue from earlier runs.
 *
 * Safe: only touches rows whose `status = 'running'` AND age is past a
 * small grace window (default 2 min — enough that we don't accidentally
 * squash a legitimately-in-progress run).
 *
 * Usage:
 *   yarn tsx scripts/reclaim-stuck-backfill.ts            # dry-run
 *   yarn tsx scripts/reclaim-stuck-backfill.ts --apply    # execute
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const GRACE_MS = 2 * 60 * 1000; // 2 min

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const cutoff = new Date(Date.now() - GRACE_MS);
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
    console.log(`Grace window: ${GRACE_MS / 1000}s (cutoff ${cutoff.toISOString()})`);
    console.log();

    const [rows] = (await conn.query(
      `SELECT id, startedAt, completedAt, issueCount, error
         FROM sync_logs
        WHERE type = 'deployment_backfill'
          AND status = 'running'
          AND startedAt < ?
        ORDER BY startedAt DESC`,
      [cutoff],
    )) as [
      Array<{
        id: string;
        startedAt: Date | null;
        completedAt: Date | null;
        issueCount: number | null;
        error: string | null;
      }>,
      unknown,
    ];

    if (rows.length === 0) {
      console.log("No stuck running rows outside the grace window. Nothing to do.");
      return;
    }

    console.log(`Found ${rows.length} stuck row(s):`);
    for (const r of rows) {
      const started = r.startedAt ? new Date(r.startedAt).toISOString() : "—";
      const ageMin = r.startedAt
        ? Math.round((Date.now() - new Date(r.startedAt).getTime()) / 60000)
        : 0;
      console.log(`  ${r.id}  started=${started}  ageMin=${ageMin}  issueCount=${r.issueCount ?? 0}`);
    }
    console.log();

    if (!APPLY) {
      console.log("Dry-run. Re-run with --apply to mark these rows as failed.");
      return;
    }

    const [result] = (await conn.query(
      `UPDATE sync_logs
          SET status = 'failed',
              completedAt = NOW(),
              error = COALESCE(error, 'Reclaimed by reclaim-stuck-backfill.ts — client timed out mid-run')
        WHERE type = 'deployment_backfill'
          AND status = 'running'
          AND startedAt < ?`,
      [cutoff],
    )) as [{ affectedRows: number }, unknown];

    console.log(`Reclaimed ${result.affectedRows} row(s). Next cron trigger can proceed.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
