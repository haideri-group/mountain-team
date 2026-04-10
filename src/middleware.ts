import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Public paths that do not require authentication
const publicPaths = ["/login", "/api/auth"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isPublicPath = publicPaths.some(path => 
    nextUrl.pathname.startsWith(path)
  );

  // Allow access to public paths without auth
  if (isPublicPath) {
    // If user is already logged in and trying to access /login, redirect to /overview
    if (isLoggedIn && nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/overview", nextUrl));
    }
    return NextResponse.next();
  }

  // Redirect unauthenticated users to /login
  if (!isLoggedIn && nextUrl.pathname !== "/") {
    const loginUrl = new URL("/login", nextUrl);
    // loginUrl.searchParams.set("callbackUrl", nextUrl.pathname); // Optional query forwarding
    return NextResponse.redirect(loginUrl);
  }

  // Root path forwards to /overview if logged in, otherwise /login
  if (nextUrl.pathname === "/") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/overview", nextUrl));
    } else {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
  }

  return NextResponse.next();
});

// Configure middleware to run on standard routes, skipping API/trpc, images, and static assets
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|assets).*)"],
};
