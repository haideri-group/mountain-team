import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// PATCH /api/boards/:id — Update board (toggle tracking, edit details)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    await db.update(boards).set(body).where(eq(boards.id, id));

    const [updated] = await db.select().from(boards).where(eq(boards.id, id)).limit(1);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update board:", error);
    return NextResponse.json({ error: "Failed to update board" }, { status: 500 });
  }
}

// DELETE /api/boards/:id — Remove board
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.delete(boards).where(eq(boards.id, id));
    return NextResponse.json({ message: "Board deleted" });
  } catch (error) {
    console.error("Failed to delete board:", error);
    return NextResponse.json({ error: "Failed to delete board" }, { status: 500 });
  }
}
