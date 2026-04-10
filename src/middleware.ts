import { auth } from "@/auth";
import { NextResponse } from "next/server";

const publicPaths = ["/login", "/api/auth"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isPublicPath = publicPaths.some((path) =>
    nextUrl.pathname.startsWith(path),
  );

  if (isPublicPath) {
    if (isLoggedIn && nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/overview", nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/overview", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|assets).*)"],
};
