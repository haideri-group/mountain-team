import { NextResponse } from "next/server";
import { cleanupExpiredResetTokens } from "@/app/actions/auth";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "");
  const expected = process.env.SYNC_SECRET;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await cleanupExpiredResetTokens();
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error("[cron:cleanup-password-tokens]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "cleanup_failed" }, { status: 500 });
  }
}
