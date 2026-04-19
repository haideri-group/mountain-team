/**
 * Diagnostic: prints the current GitHub API rate-limit state.
 *
 * Hits GitHub's `/rate_limit` endpoint, which is free (doesn't count
 * against any quota). Shows core limit, remaining calls, and when the
 * quota resets.
 *
 * Usage:
 *   yarn tsx scripts/github-rate-limit.ts
 */
import "dotenv/config";

interface RateLimitResponse {
  resources: {
    core: { limit: number; remaining: number; reset: number; used: number };
    search: { limit: number; remaining: number; reset: number; used: number };
    graphql: { limit: number; remaining: number; reset: number; used: number };
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN not set in .env");
    process.exit(1);
  }

  const res = await fetch("https://api.github.com/rate_limit", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "teamflow-diagnostic",
    },
  });

  if (!res.ok) {
    console.error(`GitHub API returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const data = (await res.json()) as RateLimitResponse;

  const format = (r: {
    limit: number;
    remaining: number;
    reset: number;
    used: number;
  }) => {
    const pct = r.limit > 0 ? Math.round((r.remaining / r.limit) * 100) : 0;
    const resetDate = new Date(r.reset * 1000);
    const nowMs = Date.now();
    const minsUntilReset = Math.max(0, Math.round((resetDate.getTime() - nowMs) / 60000));
    const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "░");
    return {
      text: `${r.remaining.toLocaleString().padStart(6)} / ${r.limit.toLocaleString().padEnd(6)} (${pct}%)`,
      bar,
      used: r.used.toLocaleString(),
      resetIn: `${minsUntilReset}m`,
      resetAt: resetDate.toLocaleString("en-GB", {
        timeZone: "Asia/Karachi",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      }),
    };
  };

  const core = format(data.resources.core);
  const search = format(data.resources.search);
  const graphql = format(data.resources.graphql);

  console.log(`\nGitHub API rate limit — ${new Date().toISOString()}\n`);
  console.log(`  core        ${core.bar}  ${core.text}`);
  console.log(`              used=${core.used}  resets in ${core.resetIn} (at ${core.resetAt} PKT)\n`);
  console.log(`  search      ${search.bar}  ${search.text}`);
  console.log(`              used=${search.used}  resets in ${search.resetIn}\n`);
  console.log(`  graphql     ${graphql.bar}  ${graphql.text}`);
  console.log(`              used=${graphql.used}  resets in ${graphql.resetIn}\n`);

  // Warn if core is getting low
  if (data.resources.core.remaining < 500) {
    console.log(`  ⚠️  core quota under 500 — deployment backfill circuit-breaker will trip at this level.`);
  } else if (data.resources.core.remaining < 1000) {
    console.log(`  ℹ️  core quota under 1000 — next deployment-backfill run would skip its pre-flight check.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
