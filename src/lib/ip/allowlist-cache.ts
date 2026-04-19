import { db } from "@/lib/db";
import { ipAllowlist } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * 60s in-memory cache of enabled allowlist CIDRs. Every page + public-API
 * request reads this; hitting the DB each time would make every navigation
 * slower. Invalidated explicitly from the admin CRUD routes so mutations
 * take effect immediately.
 *
 * Railway hobby is single-instance, so one process-wide cache is fine.
 * On multi-instance deploys, a pub/sub invalidation channel would be
 * needed — not in scope here.
 */

const TTL_MS = 60 * 1000;

let cache: { cidrs: string[]; expiresAt: number } | null = null;
let inFlight: Promise<string[]> | null = null;
// Monotonic generation counter bumped on every invalidation. Any load that
// was started before the bump must NOT write its result back — otherwise a
// DB read racing an admin mutation could repopulate the cache with stale
// CIDRs for the full TTL, violating the "takes effect immediately" contract.
let generation = 0;

export async function getAllowlist(): Promise<string[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.cidrs;
  if (inFlight) return inFlight;

  const requestGeneration = generation;
  inFlight = (async () => {
    try {
      const rows = await db
        .select({ cidr: ipAllowlist.cidr })
        .from(ipAllowlist)
        .where(eq(ipAllowlist.enabled, true));
      const cidrs = rows.map((r) => r.cidr);
      // Only cache if no invalidation happened while we were reading.
      if (requestGeneration === generation) {
        cache = { cidrs, expiresAt: Date.now() + TTL_MS };
      }
      return cidrs;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function invalidateAllowlistCache(): void {
  cache = null;
  generation += 1;
  // Dropping `inFlight` is intentional: the promise keeps resolving for
  // existing callers (they'll just see pre-mutation data for THEIR request),
  // but the next getAllowlist() after invalidation starts a fresh read
  // instead of awaiting the stale one.
  inFlight = null;
}
