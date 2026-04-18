import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const RESET_TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MINUTES = 30;

export function generateResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTES).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyTokenHash(plainToken: string, storedHash: string): boolean {
  if (!plainToken || !storedHash) return false;
  const incoming = hashToken(plainToken);
  if (incoming.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(incoming), Buffer.from(storedHash));
}

export function resetTokenExpiry(): Date {
  return new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}
