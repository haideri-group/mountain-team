import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./lib/db/index";
import { users } from "./lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Extend NextAuth types to include 'role' in User and Session
declare module "next-auth" {
  interface User {
    id?: string;
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      googleAccessToken?: string;
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/directory.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email);
        const password = String(credentials.password);

        const userRows = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        const user = userRows[0];

        if (!user || !user.hashedPassword) {
          return null;
        }

        // Block deactivated users
        if (!user.isActive) {
          return null;
        }

        const passwordsMatch = await bcrypt.compare(password, user.hashedPassword);

        if (passwordsMatch) {
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        }

        return null; // Invalid credentials
      },
    }),
  ]
});
