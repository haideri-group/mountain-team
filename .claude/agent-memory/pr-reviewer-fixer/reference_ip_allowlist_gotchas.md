---
name: ip_allowlist_gotchas
description: Design decisions and invariants baked into the Phase 20.5 IP allowlist — helps judge future PRs that touch proxy.ts, ip/**, or the ip_allowlist table.
type: reference
---

The IP allowlist gates guest access to `/overview`, `/issue/[key]`,
`/workload` and their GET APIs. Landed in PR #52 (SHAs `4cf4d7e` →
`5768ee9` on `feat/ip-allowlist`). Non-obvious points worth knowing
when reviewing follow-up work:

### Cache invariants (`src/lib/ip/allowlist-cache.ts`)

- Single process-wide cache. Railway hobby is single-instance, so no
  pub/sub. If the project ever scales out, add an invalidation channel.
- `generation` counter exists specifically to close a race where a DB
  read in flight at the moment an admin mutates the list can't
  repopulate stale CIDRs for the full TTL after invalidation. **Do not
  remove** — CodeRabbit and CodeAnt both flagged this, and the fix is
  deliberate.

### Gate shape (`src/lib/ip/gate.ts`, `src/proxy.ts`)

- Both proxy.ts and gate.ts wrap `getAllowlist()` in try/catch and fail
  closed (redirect to /login / return 401). A DB blip must never
  surface as a 500 on public endpoints.
- Proxy session detection is cookie-presence only (cheap, no JWT
  verify). An attacker forging an `authjs.session-token` cookie bypasses
  the proxy redirect but gets a real `auth()` check at the API layer.
  If future review asks to tighten the proxy itself, note that every
  API gate already does the real auth call.

### Matcher exclusions (`proxy.ts` config.matcher)

- `/((?!api|_next|favicon.ico|assets).*)`. Because `/api/*` is
  excluded here, the `/api/auth` entry in `ALWAYS_PUBLIC_PREFIXES` was
  dead code and was removed in `0ec261e`. Any `/api/*` path listed
  there is a smell — API routes gate themselves with
  `requirePublicOrSession()` or explicit session checks.

### IP resolution (`src/lib/ip/resolve.ts`)

- Trust chain CF-Connecting-IP → x-real-ip → leftmost x-forwarded-for.
- Each source is normalized into a temp and only returned when
  non-null — a blank header must not short-circuit the fallback chain.
- Handles `[::1]:1234`, `1.2.3.4:5678`, and strips IPv6 zone ids.
- `CF-Connecting-IP` is the canonical source on the current deploy
  (Cloudflare in front). If Cloudflare is ever removed, delete that
  line so clients can't spoof it.

### CIDR matching (`src/lib/ip/match.ts`)

- `parseRule` unmaps v4-mapped IPv6 rules (`::ffff:1.2.3.0/120` →
  `1.2.3.0/24`) so they match IPv4 client addresses. `isIpAllowed`
  does the symmetric unmap on the client side. This symmetry is
  load-bearing — if either side regresses, half the rules silently
  stop matching.

### DB schema + migration

- `ip_allowlist.cidr` has UNIQUE index `uidx_ip_allowlist_cidr` as of
  commit `40f82af`. POST returns 409 on ER_DUP_ENTRY. Drizzle schema
  and migration script declare it together.
- Migration pre-flights for existing duplicates before adding the
  UNIQUE index. The ALTER is idempotent but would fail mid-flight on
  dupes, so the script aborts with a duplicate report instead.
- The 8 seed IPs (home/office + localhost) are baked into
  `scripts/migrate-ip-allowlist.ts`. Not secret, but not ideal for a
  public repo either — if a future PR wants to move them to an env
  var, that's a reasonable cleanup.

### Cookie names

- `authjs.session-token` (dev) and `__Secure-authjs.session-token`
  (prod). Both checked.
