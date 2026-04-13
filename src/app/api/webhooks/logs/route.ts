import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";

// GET /api/webhooks/logs — View recent webhook delivery logs (admin only)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const logs = await db.execute(
      sql`SELECT id, source, event, result, receivedAt FROM webhook_logs ORDER BY receivedAt DESC LIMIT 50`,
    );

    return NextResponse.json(logs[0]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch logs" },
      { status: 500 },
    );
  }
}
