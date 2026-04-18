import { db } from "@/lib/db";
import { passwordResetTokens } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

const MAX_PER_USER_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 10;

export async function checkResetRateLimit(
  userId: string | null,
  ip: string | null,
): Promise<{ allowed: boolean; reason?: "user" | "ip" }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  if (userId) {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          gte(passwordResetTokens.requestedAt, oneHourAgo),
        ),
      );
    if ((row?.count ?? 0) >= MAX_PER_USER_PER_HOUR) {
      return { allowed: false, reason: "user" };
    }
  }

  if (ip) {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.requestedIp, ip),
          gte(passwordResetTokens.requestedAt, oneHourAgo),
        ),
      );
    if ((row?.count ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return { allowed: false, reason: "ip" };
    }
  }

  return { allowed: true };
}

export async function getRequestIp(): Promise<string | null> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return h.get("x-real-ip") ?? null;
}
