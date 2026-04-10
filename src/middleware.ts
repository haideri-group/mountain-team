import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

export const { auth: middleware } = NextAuth(authConfig);

const publicPaths = ["/login", "/api/auth"];

export default middleware((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isPublicPath = publicPaths.some(path => 
    nextUrl.pathname.startsWith(path)
  );

  // Allow access to public paths without auth
  if (isPublicPath) {
    if (isLoggedIn && nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/overview", nextUrl));
    }
    return NextResponse.next();
  }

  // Redirect unauthenticated users
  if (!isLoggedIn && nextUrl.pathname !== "/") {
    const loginUrl = new URL("/login", nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  // Root path handling
  if (nextUrl.pathname === "/") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/overview", nextUrl));
    } else {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|assets).*)"],
};
