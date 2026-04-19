/**
 * Resolve the true client IP from a Next.js request.
 *
 * Trust chain (highest → lowest):
 *   1. `CF-Connecting-IP` — set by Cloudflare edge; cannot be spoofed
 *      unless the attacker bypasses Cloudflare entirely (which Railway
 *      origin lock + Cloudflare SSL make difficult).
 *   2. `x-real-ip` — set by Railway's proxy from the leftmost XFF entry.
 *   3. `x-forwarded-for` — fall back to the leftmost entry, which is the
 *      original client IP inserted by the first trusted hop.
 *
 * If none of these are present or parseable we return null — the caller
 * must treat that as "unlisted" (fail closed).
 *
 * NOTE: if Cloudflare is removed from the chain, delete the CF-Connecting-IP
 * line. Never trust `x-forwarded-for` at face value if the app is reachable
 * directly from the internet — clients can spoof it.
 */
export function getClientIp(request: Request): string | null {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return normalize(cfIp);

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return normalize(realIp);

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const leftmost = xff.split(",")[0]?.trim();
    if (leftmost) return normalize(leftmost);
  }

  return null;
}

function normalize(ip: string): string | null {
  const trimmed = ip.trim();
  if (!trimmed) return null;
  // Strip optional IPv6 zone id (e.g. "fe80::1%eth0") — ipaddr.js rejects it
  const noZone = trimmed.split("%")[0];
  // Strip optional port ("[::1]:1234" or "1.2.3.4:5678")
  if (noZone.startsWith("[")) {
    const end = noZone.indexOf("]");
    return end > 0 ? noZone.slice(1, end) : noZone;
  }
  // IPv4 with port: strip everything after the first colon IF it's a plain v4
  // (IPv6 addresses always contain multiple colons, so count to disambiguate)
  if ((noZone.match(/:/g) ?? []).length === 1 && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(noZone)) {
    return noZone.split(":")[0];
  }
  return noZone;
}
