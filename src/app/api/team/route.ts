import { db } from "@/lib/db";
import { team_members } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

// GET /api/team — List all team members
export async function GET() {
  try {
    const members = await db
      .select()
      .from(team_members)
      .orderBy(desc(team_members.createdAt));

    return NextResponse.json(members);
  } catch (error) {
    console.error("Failed to fetch team members:", error);
    return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 });
  }
}

// POST /api/team — Add a new team member
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { displayName, email, role, status, jiraAccountId, joinedDate, capacity, color } = body;

    if (!displayName || !jiraAccountId) {
      return NextResponse.json(
        { error: "displayName and jiraAccountId are required" },
        { status: 400 },
      );
    }

    const id = `tm_${Date.now()}`;

    await db.insert(team_members).values({
      id,
      displayName,
      email: email || null,
      role: role || null,
      status: status || "active",
      jiraAccountId,
      joinedDate: joinedDate || new Date().toISOString().split("T")[0],
      capacity: capacity ?? 10,
      color: color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`,
    });

    return NextResponse.json({ id, message: "Member added successfully" }, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to add team member:", error);
    const message =
      error instanceof Error && error.message.includes("Duplicate")
        ? "A member with this JIRA Account ID already exists"
        : "Failed to add team member";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
