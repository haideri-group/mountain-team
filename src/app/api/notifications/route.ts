import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifications, issues, team_members, jiraReleases } from "@/lib/db/schema";
import { desc, eq, and, gte, ne } from "drizzle-orm";
import { auth } from "@/auth";
import { withResolvedAvatar } from "@/lib/db/helpers";

// GET /api/notifications — List notifications (last 30 days)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = session.user.role === "admin";
    const { searchParams } = request.nextUrl;
    const typeFilter = searchParams.get("type") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const conditions = [gte(notifications.createdAt, thirtyDaysAgo)];

    // Non-admins: hide admin-only types entirely
    if (!isAdmin) {
      conditions.push(ne(notifications.type, "user_joined"));
      conditions.push(ne(notifications.type, "capacity"));
      // Release-scoped notifications are team-lead oriented. Individual
      // developers don't need "release overdue" in their tray.
      conditions.push(ne(notifications.type, "release_overdue"));
      conditions.push(ne(notifications.type, "release_ready"));
      conditions.push(ne(notifications.type, "release_deployed"));
      conditions.push(ne(notifications.type, "release_scope_changed"));
      conditions.push(ne(notifications.type, "release_stale"));
    }

    // For non-admin users: find their team_member ID to scope aging notifications
    let userMemberId: string | null = null;
    if (!isAdmin && session.user.email) {
      const [member] = await db
        .select({ id: team_members.id })
        .from(team_members)
        .where(eq(team_members.email, session.user.email))
        .limit(1);
      userMemberId = member?.id ?? null;
    }

    if (typeFilter) {
      conditions.push(
        eq(
          notifications.type,
          typeFilter as
            | "aging"
            | "overdue"
            | "capacity"
            | "completed"
            | "unblocked"
            | "deployed"
            | "user_joined"
            | "release_overdue"
            | "release_ready"
            | "release_deployed"
            | "release_scope_changed"
            | "release_stale",
        ),
      );
    }

    let result = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(isAdmin ? limit : limit * 2); // fetch extra for non-admins since we filter below

    // Non-admins: only see notifications for their own assigned tasks
    if (!isAdmin) {
      result = result.filter((n) => {
        return userMemberId && n.relatedMemberId === userMemberId;
      }).slice(0, limit);
    }

    // Enrich with related issue/member/release data
    const enriched = await Promise.all(
      result.map(async (notif) => {
        let relatedIssue = null;
        let relatedMember = null;
        let relatedRelease: { id: string; name: string; projectKey: string } | null = null;

        if (notif.relatedIssueId) {
          const [issue] = await db
            .select({ jiraKey: issues.jiraKey, title: issues.title, status: issues.status })
            .from(issues)
            .where(eq(issues.id, notif.relatedIssueId))
            .limit(1);
          relatedIssue = issue || null;
        }

        if (notif.relatedMemberId) {
          const [member] = await db
            .select({ displayName: team_members.displayName, avatarUrl: team_members.avatarUrl })
            .from(team_members)
            .where(eq(team_members.id, notif.relatedMemberId))
            .limit(1);
          relatedMember = member ? withResolvedAvatar(member) : null;
        }

        if (notif.relatedReleaseId) {
          const [release] = await db
            .select({ id: jiraReleases.id, name: jiraReleases.name, projectKey: jiraReleases.projectKey })
            .from(jiraReleases)
            .where(eq(jiraReleases.id, notif.relatedReleaseId))
            .limit(1);
          relatedRelease = release || null;
        }

        return { ...notif, relatedIssue, relatedMember, relatedRelease };
      }),
    );

    // Count unread
    const unreadCount = result.filter((n) => !n.isRead).length;

    return NextResponse.json({ notifications: enriched, unreadCount });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}

// PATCH /api/notifications — Mark all as read
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (body.action === "mark-all-read") {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.isRead, false));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Failed to update notifications:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 },
    );
  }
}
