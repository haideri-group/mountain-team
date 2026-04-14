import type { NextAuthConfig } from "next-auth";
import { db } from "./lib/db/index";
import { users, notifications } from "./lib/db/schema";
import { eq } from "drizzle-orm";

const SUPER_ADMIN_EMAIL = "syed.haider@ki5.co.uk";

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user?.email;
      if (!email) return true;

      const [dbUser] = await db
        .select({ isActive: users.isActive, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // First-time sign-in — allow (user will be created in jwt callback)
      if (!dbUser) return true;

      // Super-admin is never blocked
      if (email === SUPER_ADMIN_EMAIL) {
        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.email, email));
        return true;
      }

      // Block deactivated users
      if (!dbUser.isActive) {
        return "/login?error=AccountDeactivated";
      }

      // Update lastLoginAt on successful sign-in
      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.email, email));

      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }

      // For Google OAuth: look up role from DB by email
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
          // First-time Google sign-in: create user record
          const isSuperAdmin = token.email === SUPER_ADMIN_EMAIL;
          const id = `usr_${Date.now()}`;
          const role = isSuperAdmin ? "admin" : "user";

          await db.insert(users).values({
            id,
            email: token.email,
            name: token.name || null,
            role,
            avatarUrl: (token.picture as string) || null,
            authProvider: "google",
            lastLoginAt: new Date(),
          });
          token.role = role;
          token.id = id;

          // Notify admins about new user
          try {
            await db.insert(notifications).values({
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: "user_joined",
              title: "New user signed in",
              message: `${token.name || token.email} joined TeamFlow. Default role: ${role}.${!isSuperAdmin ? " Change their role from the Users page." : ""}`,
              isRead: false,
            });
          } catch { /* non-fatal */ }
        }

        // Store Google OAuth tokens for directory API access
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token;
        token.googleTokenExpiry = account.expires_at
          ? account.expires_at * 1000
          : 0;
      }

      // Periodic DB check: re-validate isActive + role from DB
      // Cached for 60 seconds to avoid overwhelming the connection pool
      // Deactivated users lose access within 60 seconds, role changes take effect within 60 seconds
      if (token.id && !account) {
        const lastCheck = (token._lastDbCheck as number) || 0;
        const now = Date.now();
        if (now - lastCheck > 60_000) { // check every 60 seconds
          try {
            const [dbUser] = await db
              .select({ role: users.role, isActive: users.isActive })
              .from(users)
              .where(eq(users.id, token.id as string))
              .limit(1);

            if (dbUser) {
              if (token.email === SUPER_ADMIN_EMAIL) {
                token.role = "admin";
              } else if (!dbUser.isActive) {
                return {} as typeof token;
              } else {
                token.role = dbUser.role;
              }
            }
            token._lastDbCheck = now;
          } catch {
            // DB connection failed — keep existing token data, retry next time
          }
        }
      }

      // Refresh Google access token if expired
      if (
        token.googleRefreshToken &&
        token.googleTokenExpiry &&
        Date.now() > (token.googleTokenExpiry as number) - 60000
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
          // Refresh failed — keep existing token
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
