import type { NextAuthConfig } from "next-auth";
import { db } from "./lib/db/index";
import { users } from "./lib/db/schema";
import { eq } from "drizzle-orm";

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      // For Google OAuth: look up role from DB by email (user.role is undefined from Google)
      if (account?.provider === "google" && token.email) {
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, token.email))
          .limit(1);

        if (dbUser) {
          token.role = dbUser.role;
          token.id = dbUser.id;
        } else {
          // First-time Google sign-in: create user record as admin
          // (only the admin uses Google OAuth in this app)
          const id = `usr_${Date.now()}`;
          await db.insert(users).values({
            id,
            email: token.email,
            name: token.name || null,
            role: "admin",
            avatarUrl: (token.picture as string) || null,
          });
          token.role = "admin";
          token.id = id;
        }

        // Store Google OAuth tokens for directory API access
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token;
        token.googleTokenExpiry = account.expires_at
          ? account.expires_at * 1000
          : 0;
      }

      // Refresh Google access token if expired
      if (
        token.googleRefreshToken &&
        token.googleTokenExpiry &&
        Date.now() > (token.googleTokenExpiry as number) - 60000 // refresh 1 min before expiry
      ) {
        try {
          const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID || "",
              client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
              grant_type: "refresh_token",
              refresh_token: token.googleRefreshToken as string,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            token.googleAccessToken = data.access_token;
            if (data.expires_in) {
              token.googleTokenExpiry = Date.now() + data.expires_in * 1000;
            }
          }
        } catch {
          // Refresh failed — token may be revoked. Keep existing (expired) token.
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.role) session.user.role = token.role as string;
        if (token.id) session.user.id = token.id as string;
        if (token.googleAccessToken) {
          session.user.googleAccessToken = token.googleAccessToken as string;
        }
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
