import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications, team_members } from "@/lib/db/schema";
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

    if (isAdmin) {
      // Admin sees all unread notifications
      const [result] = await db
        .select({ count: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.isRead, false),
            gte(notifications.createdAt, thirtyDaysAgo),
          ),
        );
      return NextResponse.json({ count: result.count });
    }

    // Non-admin: fetch unread notifications then filter
    const unread = await db
      .select({
        type: notifications.type,
        relatedMemberId: notifications.relatedMemberId,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.isRead, false),
          gte(notifications.createdAt, thirtyDaysAgo),
          ne(notifications.type, "user_joined"),
          ne(notifications.type, "overdue"),
        ),
      );

    // Find user's team member ID for aging scoping
    let userMemberId: string | null = null;
    if (session.user.email) {
      const [member] = await db
        .select({ id: team_members.id })
        .from(team_members)
        .where(eq(team_members.email, session.user.email))
        .limit(1);
      userMemberId = member?.id ?? null;
    }

    // Filter aging to only user's own tasks
    const filtered = unread.filter((n) => {
      if (n.type === "aging") {
        return userMemberId && n.relatedMemberId === userMemberId;
      }
      return true;
    });

    return NextResponse.json({ count: filtered.length });
  } catch (error) {
    console.error("Failed to fetch notification count:", error);
    return NextResponse.json({ count: 0 });
  }
}
