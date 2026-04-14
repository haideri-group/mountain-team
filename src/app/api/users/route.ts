import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/auth";
import { desc, like, or, and, eq, count } from "drizzle-orm";

// GET /api/users — Paginated user list (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get("pageSize") || "20", 10)));
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") || "";
    const status = searchParams.get("status") || "";

    // Build WHERE conditions
    const conditions = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(like(users.name, pattern), like(users.email, pattern)));
    }

    if (role && role !== "all") {
      conditions.push(eq(users.role, role as "admin" | "user"));
    }

    if (status === "active") {
      conditions.push(eq(users.isActive, true));
    } else if (status === "deactivated") {
      conditions.push(eq(users.isActive, false));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count (filtered)
    const [countResult] = await db
      .select({ total: count() })
      .from(users)
      .where(where);

    // Paginated results
    const userListRaw = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
        authProvider: users.authProvider,
        hashedPassword: users.hashedPassword,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Don't expose hashedPassword — just indicate auth methods
    const userList = userListRaw.map(({ hashedPassword, ...rest }) => ({
      ...rest,
      hasPassword: !!hashedPassword,
      isGoogleOAuth: rest.authProvider === "google",
    }));

    // Metrics (unfiltered)
    const allUsers = await db
      .select({ role: users.role, isActive: users.isActive })
      .from(users);

    const metrics = {
      total: allUsers.length,
      admins: allUsers.filter((u) => u.role === "admin").length,
      regularUsers: allUsers.filter((u) => u.role === "user").length,
      deactivated: allUsers.filter((u) => !u.isActive).length,
    };

    return NextResponse.json({
      users: userList,
      totalCount: countResult.total,
      metrics,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.total / pageSize),
    });
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch users" },
      { status: 500 },
    );
  }
}
