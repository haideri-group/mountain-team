/**
 * Run `recordReleaseDailySnapshots` once to seed today's row for every
 * non-archived release. Normally this fires as a post-sync hook; this
 * script lets us seed without waiting for the next cron run.
 *
 * Read-only on JIRA. Writes only to `release_daily_snapshots`. Idempotent.
 */
import "dotenv/config";
import { recordReleaseDailySnapshots } from "../src/lib/releases/snapshots";

async function main() {
  const { rowsUpserted } = await recordReleaseDailySnapshots();
  console.log(`Upserted ${rowsUpserted} release snapshot row(s) for today.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
