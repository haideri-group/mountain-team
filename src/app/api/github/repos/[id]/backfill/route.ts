import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { backfillDeployments } from "@/lib/github/backfill";

// POST /api/github/repos/:id/backfill — Backfill deployment history
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await backfillDeployments(id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Backfill failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backfill failed" },
      { status: 500 },
    );
  }
}
