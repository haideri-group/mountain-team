/**
 * One-off idempotent script to bump Cronicle HTTP timeouts on TeamFlow
 * events. Default Cronicle timeout is 300s (5 min); a full Issue Sync
 * on 4,075 tickets (first deploy-prop pass, release reconciliation)
 * can exceed that, which makes Cronicle mark the job as timeout even
 * though our handler completed the sync successfully.
 *
 * Targets (by event's configured URL path):
 *   /api/cron/sync-issues       → 5400 s (90 min)
 *   everything else             → leave alone
 *
 * Safe by default: DRY-RUN unless --apply. Idempotent: if the current
 * timeout already matches the target, reports [skip] and doesn't fire
 * an update.
 *
 * Usage:
 *   yarn tsx scripts/cronicle-set-timeouts.ts          # dry-run
 *   yarn tsx scripts/cronicle-set-timeouts.ts --apply  # execute
 */
import "dotenv/config";
import { CRONICLE_REQUEST_TIMEOUT_MS } from "../src/lib/config";

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "DRY-RUN";

interface CronicleEvent {
  id: string;
  title: string;
  category: string;
  enabled: 0 | 1;
  timeout?: number;
  params: { url?: string; [k: string]: unknown };
}

interface GetScheduleResponse {
  code: number;
  rows?: CronicleEvent[];
  description?: string;
}

interface UpdateEventResponse {
  code: number;
  description?: string;
}

/** URL-path → target HTTP timeout (seconds). Only events whose
 *  `params.url` ends with one of these paths are touched. */
const TIMEOUT_BY_PATH: Record<string, number> = {
  "/api/cron/sync-issues": 5400, // 90 min
  // Add here if ever needed:
  // "/api/cron/sync-teams":       300,    // 5 min (leave)
  // "/api/cron/sync-releases":    300,
  // "/api/cron/sync-worklogs":    300,
  // "/api/cron/sync-timedoctor":  300,
  // "/api/cron/deployment-backfill": 3600, // 60 min (already bumped)
};

async function main() {
  const base = (process.env.CRONICLE_BASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.CRONICLE_API_KEY;
  const categoryId = process.env.CRONICLE_TEAMFLOW_CATEGORY_ID;
  if (!base || !apiKey) {
    console.error("CRONICLE_BASE_URL and CRONICLE_API_KEY must be set.");
    process.exit(1);
  }
  if (!categoryId) {
    console.error("CRONICLE_TEAMFLOW_CATEGORY_ID must be set.");
    process.exit(1);
  }

  console.log(`Cronicle: ${base}`);
  console.log(`Mode:     ${MODE}`);
  if (!APPLY) console.log("  (no updates will be sent — re-run with --apply)");
  console.log();

  // 1. Fetch the full schedule, filter to TeamFlow category.
  // Bounded by 10s — same budget the app's `cronicleGet` uses — so a
  // stalled Cronicle connection (TCP open, no response) fails fast
  // instead of hanging the operator's terminal.
  const schedRes = await fetch(`${base}/api/app/get_schedule/v1`, {
    headers: { "X-API-Key": apiKey },
    signal: AbortSignal.timeout(CRONICLE_REQUEST_TIMEOUT_MS),
  });
  if (!schedRes.ok) {
    console.error(`get_schedule failed: HTTP ${schedRes.status}`);
    process.exit(1);
  }
  const sched = (await schedRes.json()) as GetScheduleResponse;
  if (sched.code !== 0) {
    console.error(`get_schedule error: ${sched.description ?? "code " + sched.code}`);
    process.exit(1);
  }
  const teamflowEvents = (sched.rows ?? []).filter(
    (e) => e.category === categoryId,
  );
  console.log(`Found ${teamflowEvents.length} TeamFlow events.\n`);

  let changed = 0;
  let skipped = 0;
  let outOfScope = 0;

  for (const e of teamflowEvents) {
    const url = e.params?.url ?? "";
    const matchedPath = Object.keys(TIMEOUT_BY_PATH).find((p) =>
      url.endsWith(p),
    );
    if (!matchedPath) {
      console.log(
        `  [out-of-scope] ${e.title.padEnd(38)} url=${url}  (no target timeout configured)`,
      );
      outOfScope++;
      continue;
    }
    const target = TIMEOUT_BY_PATH[matchedPath];
    const current = typeof e.timeout === "number" ? e.timeout : 300;
    if (current === target) {
      console.log(
        `  [skip]         ${e.title.padEnd(38)} timeout=${current}s — already at target`,
      );
      skipped++;
      continue;
    }

    if (APPLY) {
      const updateRes = await fetch(`${base}/api/app/update_event/v1`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: e.id, timeout: target }),
        signal: AbortSignal.timeout(CRONICLE_REQUEST_TIMEOUT_MS),
      });
      if (!updateRes.ok) {
        console.error(
          `  [FAIL]         ${e.title} — HTTP ${updateRes.status}`,
        );
        continue;
      }
      const updateBody = (await updateRes.json()) as UpdateEventResponse;
      if (updateBody.code !== 0) {
        console.error(
          `  [FAIL]         ${e.title} — ${updateBody.description ?? "code " + updateBody.code}`,
        );
        continue;
      }
      console.log(
        `  [+]            ${e.title.padEnd(38)} timeout ${current}s → ${target}s`,
      );
    } else {
      console.log(
        `  [would apply]  ${e.title.padEnd(38)} timeout ${current}s → ${target}s`,
      );
    }
    changed++;
  }

  console.log();
  console.log(
    `Summary: ${changed} ${APPLY ? "updated" : "would update"} · ${skipped} already at target · ${outOfScope} out of scope`,
  );
  if (!APPLY && changed > 0) {
    console.log("Re-run with --apply to commit these changes.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
