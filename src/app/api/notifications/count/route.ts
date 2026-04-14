import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, and, gte, ne, count } from "drizzle-orm";
import { auth } from "@/auth";

// GET /api/notifications/count — Lightweight unread count for badge
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = session.user.role === "admin";
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const conditions = [
      eq(notifications.isRead, false),
      gte(notifications.createdAt, thirtyDaysAgo),
    ];

    // Non-admins should not count admin-only notifications
    if (!isAdmin) {
      conditions.push(ne(notifications.type, "user_joined"));
      conditions.push(ne(notifications.type, "overdue"));
    }

    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(...conditions));

    return NextResponse.json({ count: result.count });
  } catch (error) {
    console.error("Failed to fetch notification count:", error);
    return NextResponse.json({ count: 0 });
  }
}
