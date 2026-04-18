import { lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { passwordResetTokens } from "@/lib/db/schema";

export async function cleanupExpiredResetTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, cutoff));
  const toDelete = Number(countRow?.count ?? 0);
  if (toDelete > 0) {
    await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, cutoff));
  }
  return toDelete;
}
