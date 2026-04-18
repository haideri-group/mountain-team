import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/overview",
  "/issue",
  "/workload",
];

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Check for auth session cookie
  const sessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");
  const isLoggedIn = !!sessionCookie;

  // Root path → always redirect to overview
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // Let the post-reset success banner render even if a stale JWT cookie
  // is still present. The JWT will be invalidated within 60s via
  // passwordChangedAt; meanwhile the user needs to see confirmation and
  // sign in with their new password.
  const isResetSuccessRedirect =
    pathname === "/login" && searchParams.get("reset") === "success";

  // Allow public paths without auth
  if (isPublicPath) {
    if (
      isLoggedIn &&
      !isResetSuccessRedirect &&
      (pathname === "/login" || pathname === "/forgot-password")
    ) {
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login for protected routes
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|assets).*)"],
};
