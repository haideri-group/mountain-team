import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCronicleConfigured } from "@/lib/cronicle/client";
import {
  listTeamFlowEvents,
  projectEventPublic,
} from "@/lib/cronicle/discovery";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!isCronicleConfigured()) {
    return NextResponse.json({
      events: [],
      unavailable: true,
      reason: "cronicle_not_configured",
    });
  }

  try {
    const events = await listTeamFlowEvents();
    if (events.length === 0) {
      return NextResponse.json({
        events: [],
        // Could be an actual "no events in category" OR a soft failure.
        // `listTeamFlowEvents` swallows errors and returns []; from outside
        // we don't know which, so we set unavailable=false and let the UI
        // state render a neutral empty message.
        unavailable: false,
      });
    }
    const projected = await Promise.all(events.map((e) => projectEventPublic(e)));
    return NextResponse.json({ events: projected, unavailable: false });
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
