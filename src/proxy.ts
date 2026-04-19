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
const ALWAYS_PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
];

// Paths that are guest-readable BUT gated by the IP allowlist when the
// visitor isn't logged in. All other paths already require login.
const GUEST_READABLE_PREFIXES = ["/overview", "/issue", "/workload"];

function isAlwaysPublic(pathname: string): boolean {
  return ALWAYS_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

function isGuestReadable(pathname: string): boolean {
  return GUEST_READABLE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
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
  if (isAlwaysPublic(pathname)) {
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
  if (isGuestReadable(pathname)) {
    if (isLoggedIn) return NextResponse.next();

    const clientIp = getClientIp(request);
    if (clientIp) {
      const allowlist = await getAllowlist();
      if (isIpAllowed(clientIp, allowlist)) return NextResponse.next();
    }

    // Unlisted guest → send to login with callback.
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|assets).*)"],
};
