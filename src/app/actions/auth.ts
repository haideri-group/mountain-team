"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import {
  generateResetToken,
  hashToken,
  resetTokenExpiry,
  RESET_TOKEN_TTL_MINUTES,
} from "@/lib/auth/tokens";
import { checkResetRateLimit, getRequestIp } from "@/lib/auth/rate-limit";
import { sendMail, isMailConfigured } from "@/lib/email/client";
import { passwordResetEmail } from "@/lib/email/templates/password-reset";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/auth/password-rules";

export async function authenticate(prevState: string | undefined, formData: FormData) {
  try {
    const data = Object.fromEntries(formData);
    await signIn("credentials", { ...data, redirectTo: "/overview" });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}

export async function loginWithGoogle() {
  await signIn("google", { redirectTo: "/overview" });
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("authjs.session-token");
  cookieStore.delete("__Secure-authjs.session-token");
  cookieStore.delete("next-auth.session-token");
  cookieStore.delete("__Secure-next-auth.session-token");

  await signOut({ redirectTo: "/login" });
}

// ---------- Password reset: request ----------

export type RequestPasswordResetState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const emailSchema = z.string().trim().toLowerCase().email().max(191);

export async function requestPasswordReset(
  _prev: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const rawEmail = formData.get("email");
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { status: "error", message: "Please enter a valid email address." };
  }
  const email = parsed.data;
  const ip = await getRequestIp();

  // IP rate limit check (before any DB user lookup to avoid enumeration timing)
  const ipLimit = await checkResetRateLimit(null, ip);
  if (!ipLimit.allowed) {
    console.warn(`[password-reset] IP rate limit hit: ${ip}`);
    return { status: "sent", email };
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        hashedPassword: users.hashedPassword,
        authProvider: users.authProvider,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const eligible =
      !!user &&
      user.isActive &&
      user.authProvider === "credentials" &&
      !!user.hashedPassword;

    if (!eligible || !user) {
      // Silent success — prevents account enumeration
      return { status: "sent", email };
    }

    const userLimit = await checkResetRateLimit(user.id, null);
    if (!userLimit.allowed) {
      console.warn(`[password-reset] user rate limit hit: ${user.id}`);
      return { status: "sent", email };
    }

    const plain = generateResetToken();
    const tokenHash = hashToken(plain);
    const expiresAt = resetTokenExpiry();

    await db.insert(passwordResetTokens).values({
      id: `prt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: user.id,
      tokenHash,
      expiresAt,
      requestedIp: ip,
    });

    if (isMailConfigured()) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL;
      if (!appUrl) {
        console.error("[password-reset] Missing app URL (NEXT_PUBLIC_APP_URL/NEXTAUTH_URL) — email NOT sent.");
        return { status: "sent", email };
      }
      const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${plain}`;
      const template = passwordResetEmail({
        recipientName: user.name,
        resetUrl,
        expiryMinutes: RESET_TOKEN_TTL_MINUTES,
      });
      try {
        await sendMail({ to: user.email, ...template });
      } catch (err) {
        console.error("[password-reset] sendMail failed:", err instanceof Error ? err.message : err);
      }
    } else {
      console.warn("[password-reset] SMTP not configured — email NOT sent.");
    }

    return { status: "sent", email };
  } catch (err) {
    console.error("[password-reset] requestPasswordReset error:", err instanceof Error ? err.message : err);
    return { status: "sent", email };
  }
}

// ---------- Password reset: validate token (used by reset-password page) ----------

export type TokenValidation =
  | { valid: true; userId: string; email: string; name: string | null }
  | { valid: false };

export async function validateResetToken(token: string | undefined | null): Promise<TokenValidation> {
  if (!token || typeof token !== "string" || token.length < 20) return { valid: false };

  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return { valid: false };

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  if (!user || !user.isActive) return { valid: false };
  return { valid: true, userId: user.id, email: user.email, name: user.name };
}

// ---------- Password reset: submit new password ----------

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; message: string };

const resetSchema = z
  .object({
    token: z.string().min(20).max(256),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export async function resetPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { status: "error", message };
  }
  const { token, password } = parsed.data;

  const validation = await validateResetToken(token);
  if (!validation.valid) {
    return {
      status: "error",
      message: "This reset link is invalid or has expired. Please request a new one.",
    };
  }

  try {
    const now = new Date();
    const tokenHash = hashToken(token);

    // Atomically consume the token — guarded by usedAt IS NULL so concurrent
    // submissions of the same token can never both succeed.
    const consumeResult = await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
        ),
      );
    const affected =
      (consumeResult as { affectedRows?: number; rowsAffected?: number }).affectedRows ??
      (consumeResult as { affectedRows?: number; rowsAffected?: number }).rowsAffected ??
      0;
    if (affected !== 1) {
      return {
        status: "error",
        message: "This reset link is invalid or has expired. Please request a new one.",
      };
    }

    const hashed = await bcrypt.hash(password, 12);

    await db
      .update(users)
      .set({ hashedPassword: hashed, passwordChangedAt: now })
      .where(eq(users.id, validation.userId));

    // Invalidate any other outstanding tokens for this user
    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, validation.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );

  } catch (err) {
    console.error("[password-reset] resetPassword error:", err instanceof Error ? err.message : err);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  redirect("/login?reset=success");
}

