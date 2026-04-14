import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/auth";
import { eq, and, count } from "drizzle-orm";

const SUPER_ADMIN_EMAIL = "syed.haider@ki5.co.uk";

// PATCH /api/users/:id — Update role or isActive (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Fetch target user
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Super-admin protection
    if (targetUser.email === SUPER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "Cannot modify the system owner" },
        { status: 400 },
      );
    }

    // Validate and whitelist fields
    const updates: Record<string, unknown> = {};

    if (body.role !== undefined) {
      if (!["admin", "user"].includes(body.role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      updates.role = body.role;
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json({ error: "Invalid isActive value" }, { status: 400 });
      }
      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Cannot deactivate yourself
    if (updates.isActive === false && id === session.user.id) {
      return NextResponse.json(
        { error: "Cannot deactivate your own account" },
        { status: 400 },
      );
    }

    // Last active admin protection
    const isRemovingAdmin =
      (targetUser.role === "admin" && updates.isActive === false) ||
      (targetUser.role === "admin" && updates.role === "user");

    if (isRemovingAdmin) {
      const [adminCount] = await db
        .select({ total: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true)));

      if (adminCount.total <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last active admin" },
          { status: 400 },
        );
      }
    }

    // Apply update
    await db.update(users).set(updates).where(eq(users.id, id));

    // Return updated user
    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 500 },
    );
  }
}
