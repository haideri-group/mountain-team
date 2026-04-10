import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

// GET /api/boards — List all boards
export async function GET() {
  try {
    const allBoards = await db.select().from(boards).orderBy(desc(boards.createdAt));
    return NextResponse.json(allBoards);
  } catch (error) {
    console.error("Failed to fetch boards:", error);
    return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
  }
}

// POST /api/boards — Add a new board/project
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jiraKey, name, color, description, isTracked } = body;

    if (!jiraKey || !name) {
      return NextResponse.json({ error: "jiraKey and name are required" }, { status: 400 });
    }

    const id = `brd_${Date.now()}`;

    await db.insert(boards).values({
      id,
      jiraKey: jiraKey.toUpperCase(),
      name,
      color: color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`,
      description: description || null,
      isTracked: isTracked ?? true,
    });

    return NextResponse.json({ id, message: "Board added successfully" }, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to add board:", error);
    const message =
      error instanceof Error && error.message.includes("Duplicate")
        ? "A board with this JIRA key already exists"
        : "Failed to add board";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
