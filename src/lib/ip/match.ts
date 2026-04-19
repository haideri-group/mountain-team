import ipaddr from "ipaddr.js";

/**
 * Parse a CIDR-or-single-IP rule into an ipaddr.js range.
 * Returns null if the input isn't a valid address/range.
 *
 * Accepted forms:
 *   "203.0.113.5"          — single IPv4 (treated as /32)
 *   "203.0.113.0/24"       — IPv4 range
 *   "::1"                  — single IPv6 (treated as /128)
 *   "2001:db8::/32"        — IPv6 range
 */
function parseRule(
  rule: string,
): { addr: ipaddr.IPv4 | ipaddr.IPv6; prefix: number } | null {
  const trimmed = rule.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.includes("/")) {
      const [addr, prefix] = ipaddr.parseCIDR(trimmed);
      return { addr, prefix };
    }
    const addr = ipaddr.parse(trimmed);
    return { addr, prefix: addr.kind() === "ipv4" ? 32 : 128 };
  } catch {
    return null;
  }
}

/**
 * True if `ip` (a raw client IP string) falls inside any of the `rules`.
 * Handles v4, v6, CIDR ranges, and v4-mapped-in-v6 (`::ffff:1.2.3.4`)
 * by unmapping before the kind comparison.
 *
 * Silently ignores invalid rules — treat this as a "none matched" outcome
 * rather than propagating the parse error. The admin UI validates input
 * before write, so invalid rules at runtime would mean a schema drift.
 */
export function isIpAllowed(ip: string, rules: string[]): boolean {
  if (!ip || rules.length === 0) return false;

  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    return false;
  }

  // Unmap v4-in-v6 (::ffff:1.2.3.4) so it compares against IPv4 rules.
  const clientAddr =
    parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()
      ? (parsed as ipaddr.IPv6).toIPv4Address()
      : parsed;

  const clientKind = clientAddr.kind();

  for (const rule of rules) {
    const parsedRule = parseRule(rule);
    if (!parsedRule) continue;
    if (parsedRule.addr.kind() !== clientKind) continue;
    try {
      if (clientAddr.match([parsedRule.addr, parsedRule.prefix])) return true;
    } catch {
      // Defensive — match() throws on cross-kind which we already skipped
      continue;
    }
  }
  return false;
}

/**
 * Validate + normalize a CIDR-or-single-IP input for storage.
 * Returns the normalized string or null if invalid.
 * Examples of normalization:
 *   "::1"             → "::1"
 *   "001.002.003.004" → "1.2.3.4"
 *   "2001:db8::/32"   → "2001:db8::/32"
 */
export function normalizeCidr(input: string): string | null {
  const rule = parseRule(input);
  if (!rule) return null;
  const addrStr = rule.addr.toString();
  const isFullSingle =
    (rule.addr.kind() === "ipv4" && rule.prefix === 32) ||
    (rule.addr.kind() === "ipv6" && rule.prefix === 128);
  return isFullSingle && !input.includes("/")
    ? addrStr
    : `${addrStr}/${rule.prefix}`;
}
