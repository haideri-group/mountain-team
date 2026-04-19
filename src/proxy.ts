import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/ip/resolve";
import { isIpAllowed } from "@/lib/ip/match";
import { getAllowlist } from "@/lib/ip/allowlist-cache";

/**
 * Page-level proxy (Next.js 16 convention — replaces middleware.ts).
 * Only handles page navigations; API routes are excluded via `config.matcher`
 * and are gated separately by `requirePublicOrSession()` in each route.
 */

// Paths that are always reachable, regardless of session or IP. Auth-related
// flows must stay open so admins from unlisted IPs can still sign in.
// NOTE: `/api/*` is excluded by `config.matcher` below, so API routes
// (including `/api/auth/*`) never hit this proxy — their own handlers
// gate access via `requirePublicOrSession()` or session checks.
const ALWAYS_PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
];

// Paths that are guest-readable BUT gated by the IP allowlist when the
// visitor isn't logged in. All other paths already require login.
const GUEST_READABLE_PREFIXES = ["/overview", "/issue", "/workload"];

// Exact match OR prefix-followed-by-slash — prevents "/login" from
// matching "/loginhack" or similar lookalike paths.
function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Check for auth session cookie (cheap — no JWT verify here).
  const sessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");
  const isLoggedIn = !!sessionCookie;

  // Root → redirect to /overview (the landing page).
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  // Let the post-reset success banner render even if a stale JWT cookie
  // is still present (JWT invalidates within 60s via passwordChangedAt).
  const isResetSuccessRedirect =
    pathname === "/login" && searchParams.get("reset") === "success";

  // Auth + reset flows are always reachable.
  if (matchesPrefix(pathname, ALWAYS_PUBLIC_PREFIXES)) {
    if (
      isLoggedIn &&
      !isResetSuccessRedirect &&
      (pathname === "/login" || pathname === "/forgot-password")
    ) {
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    return NextResponse.next();
  }

  // Guest-readable pages (overview, issue detail, workload): allowed if
  // logged in OR the client IP matches an allowlist rule.
  if (matchesPrefix(pathname, GUEST_READABLE_PREFIXES)) {
    if (isLoggedIn) return NextResponse.next();

    const clientIp = getClientIp(request);
    if (clientIp) {
      try {
        const allowlist = await getAllowlist();
        if (isIpAllowed(clientIp, allowlist)) return NextResponse.next();
      } catch (err) {
        // Fail closed on DB lookup failure — redirect unlisted guests
        // to login instead of showing a 500. Admins can still sign in
        // via the auth endpoints which are exempt from this check.
        console.warn(
          "IP allowlist lookup failed — falling back to redirect:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // Unlisted guest (or lookup failed) → send to login with callback.
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Everything else requires a session.
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude all API routes, all Next.js internals (_next/*), the favicon
  // and /assets. API routes enforce via `requirePublicOrSession()`; Next
  // internals (data, static, image, manifest, HMR) should never hit the
  // proxy — letting them fall through would 302 them to /login on unlisted
  // IPs and break client-side hydration.
  matcher: ["/((?!api|_next|favicon.ico|assets).*)"],
};
