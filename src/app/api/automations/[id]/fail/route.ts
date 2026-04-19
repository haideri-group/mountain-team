import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { reclaimSingleRun } from "@/lib/sync/reclaim";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  let body: { reason?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // no body is fine
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? `Reclaimed via admin action by ${session.user.email ?? session.user.id ?? "admin"}: ${body.reason.trim().slice(0, 200)}`
      : `Reclaimed via admin action by ${session.user.email ?? session.user.id ?? "admin"}`;

  const result = await reclaimSingleRun({ id, reason });
  if (result.ok) return NextResponse.json({ success: true, id });

  if (result.reason === "not_found") {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }
  if (result.reason === "already_terminal") {
    return NextResponse.json(
      { error: "This run is already completed or failed" },
      { status: 409 },
    );
  }
  if (result.reason === "within_grace") {
    return NextResponse.json(
      {
        error:
          "This run started less than 2 minutes ago — wait a bit before marking it failed",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Unknown reclaim failure" }, { status: 500 });
}
