import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getTeamFlowSchedule,
  projectEventPublic,
} from "@/lib/cronicle/discovery";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    // `getTeamFlowSchedule` distinguishes genuine-empty-category from
    // Cronicle-unreachable: we pass `unavailable` straight through so
    // the UI can show the right banner ("0 jobs" vs "scheduler down").
    const { events, unavailable, reason } = await getTeamFlowSchedule();
    const projected = await Promise.all(events.map((e) => projectEventPublic(e)));
    return NextResponse.json({
      events: projected,
      unavailable,
      ...(reason ? { reason } : {}),
    });
  } catch (err) {
    console.warn(
      "[logs] cronicle events route failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({
      events: [],
      unavailable: true,
      reason: "cronicle_fetch_failed",
    });
  }
}
