/**
 * Diagnostic: how many DB rows would be skipped vs fetched by the
 * `JIRA_SYNC_ARCHIVE_AGE_DAYS` filter on the next bulk sync.
 *
 * Pure read — no writes, no JIRA API calls. Counts from the `issues`
 * table using the same predicate the JQL will use:
 *
 *   skipped  = status IN (done, closed) AND updated < NOW() - N days
 *              AND board is already populated
 *   fetched  = the rest (live, recent-terminal, or in an exempt board)
 *
 * Usage:
 *   yarn tsx scripts/count-archivable.ts
 *   JIRA_SYNC_ARCHIVE_AGE_DAYS=180 yarn tsx scripts/count-archivable.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

interface BoardRow {
  id: string;
  jiraKey: string;
  total: number;
  archivable: number;
}

async function main() {
  const days = Math.max(
    0,
    Math.floor(Number(process.env.JIRA_SYNC_ARCHIVE_AGE_DAYS ?? 365) || 0),
  );
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    console.log(`Archive filter threshold: ${days} days`);
    console.log(`Archive filter: ${days > 0 ? "ON" : "OFF (JIRA_SYNC_ARCHIVE_AGE_DAYS=0)"}\n`);

    // Per-board totals + "would-skip" count. `status` here is our
    // app-side enum; `done` and `closed` are our terminal set.
    const [rows] = (await conn.query(
      `SELECT
         b.id AS id,
         b.jiraKey AS jiraKey,
         COUNT(i.id) AS total,
         SUM(
           CASE
             WHEN i.status IN ('done','closed')
               AND i.jiraUpdatedAt IS NOT NULL
               AND i.jiraUpdatedAt < NOW() - INTERVAL ? DAY
             THEN 1 ELSE 0
           END
         ) AS archivable
       FROM boards b
       LEFT JOIN issues i ON i.boardId = b.id
       WHERE b.isTracked = 1
       GROUP BY b.id, b.jiraKey
       ORDER BY b.jiraKey`,
      [days],
    )) as [BoardRow[], unknown];

    let totalAll = 0;
    let totalSkipped = 0;
    let totalFetched = 0;

    console.log("Per-board impact:");
    for (const r of rows) {
      const total = Number(r.total) || 0;
      const archivable = Number(r.archivable) || 0;
      const exempt = total === 0;
      const skipped = exempt ? 0 : archivable;
      const fetched = total - skipped;
      totalAll += total;
      totalSkipped += skipped;
      totalFetched += fetched;

      const label = r.jiraKey.padEnd(12);
      if (exempt) {
        console.log(`  ${label}  total=${String(total).padStart(4)}  (auto-exempt — never synced)`);
      } else if (days <= 0) {
        console.log(`  ${label}  total=${String(total).padStart(4)}  (filter off — all fetched)`);
      } else {
        console.log(
          `  ${label}  total=${String(total).padStart(4)}  ` +
            `would-skip=${String(skipped).padStart(4)}  ` +
            `would-fetch=${String(fetched).padStart(4)}`,
        );
      }
    }

    console.log();
    console.log(`Totals:`);
    console.log(`  ${totalAll.toLocaleString().padStart(6)} tickets in DB`);
    console.log(`  ${totalSkipped.toLocaleString().padStart(6)} would be skipped (old+terminal, in populated boards)`);
    console.log(`  ${totalFetched.toLocaleString().padStart(6)} would be fetched (live, recent, or in exempt boards)`);

    // API-call estimate — JIRA pages at 100 issues each.
    const pageSize = 100;
    console.log();
    console.log(
      `Full sync with filter OFF → ${totalAll.toLocaleString()} tickets / ~${Math.ceil(totalAll / pageSize)} paginated API calls.`,
    );
    if (days > 0) {
      console.log(
        `Full sync with filter ON  → ${totalFetched.toLocaleString()} tickets / ~${Math.ceil(totalFetched / pageSize)} paginated API calls.`,
      );
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
