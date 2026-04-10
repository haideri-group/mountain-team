import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/api/auth", "/overview"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for auth session cookie (NextAuth stores session in this cookie)
  const sessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");
  const isLoggedIn = !!sessionCookie;

  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // Allow public paths without auth
  if (isPublicPath) {
    if (isLoggedIn && pathname === "/login") {
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login for protected routes
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Root path → overview
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|assets).*)"],
};
