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

export async function getAllowlist(): Promise<string[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.cidrs;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const rows = await db
        .select({ cidr: ipAllowlist.cidr })
        .from(ipAllowlist)
        .where(eq(ipAllowlist.enabled, true));
      const cidrs = rows.map((r) => r.cidr);
      cache = { cidrs, expiresAt: Date.now() + TTL_MS };
      return cidrs;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function invalidateAllowlistCache(): void {
  cache = null;
}
