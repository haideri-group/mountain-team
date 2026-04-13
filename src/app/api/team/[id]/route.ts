import { db } from "@/lib/db";
import { team_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withResolvedAvatar } from "@/lib/db/helpers";

// GET /api/team/:id — Get single member
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const [member] = await db.select().from(team_members).where(eq(team_members.id, id)).limit(1);

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json(withResolvedAvatar(member));
  } catch (error) {
    console.error("Failed to fetch member:", error);
    return NextResponse.json({ error: "Failed to fetch member" }, { status: 500 });
  }
}

// PATCH /api/team/:id — Update admin-managed fields (role, capacity, color, status active/on_leave)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Guard: departed status can only be set by sync
    if (body.status === "departed") {
      return NextResponse.json(
        { error: "Departed status can only be set by team sync" },
        { status: 400 },
      );
    }

    await db.update(team_members).set(body).where(eq(team_members.id, id));

    const [updated] = await db
      .select()
      .from(team_members)
      .where(eq(team_members.id, id))
      .limit(1);

    return NextResponse.json(withResolvedAvatar(updated));
  } catch (error) {
    console.error("Failed to update member:", error);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}
