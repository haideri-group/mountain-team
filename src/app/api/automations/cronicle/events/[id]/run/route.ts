import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cronicleGet, isCronicleConfigured } from "@/lib/cronicle/client";
import { listTeamFlowEvents } from "@/lib/cronicle/discovery";

/**
 * POST /api/automations/cronicle/events/[id]/run
 *
 * Fires a one-off run of a Cronicle event. Admin-only.
 *
 * Constraints:
 *   - Event id MUST be one of the TeamFlow-category events discovered via
 *     `CRONICLE_TEAMFLOW_CATEGORY_ID`. An admin of this app can't use this
 *     endpoint to fire arbitrary homelab-wide Cronicle jobs — that would
 *     be privilege expansion beyond TeamFlow's scope.
 *   - Cronicle must be configured; otherwise we can't invoke anything.
 *
 * Implementation note: Cronicle's run_event API uses a POST shape but
 * our `cronicleGet` helper is GET-only. Calling `/api/app/run_event/v1`
 * with `?id=...` in the query string works for the instances we've
 * observed (Cronicle 0.9.74). If a future version rejects GET, switch to
 * a dedicated POST helper.
 */

interface CronicleRunResponse {
  code: number;
  ids?: string[];
  description?: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!isCronicleConfigured()) {
    return NextResponse.json(
      { error: "Cronicle is not configured on this server" },
      { status: 503 },
    );
  }

  const { id } = await params;

  // Whitelist check: the event must belong to the TeamFlow category.
  const events = await listTeamFlowEvents();
  const event = events.find((e) => e.id === id);
  if (!event) {
    return NextResponse.json(
      { error: "Event is not in the TeamFlow category or not found" },
      { status: 404 },
    );
  }

  const res = await cronicleGet<CronicleRunResponse>("/api/app/run_event/v1", {
    id,
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Cronicle call failed: ${res.error}` },
      { status: 502 },
    );
  }
  if (res.data.code !== 0) {
    return NextResponse.json(
      {
        error: `Cronicle rejected the trigger: ${res.data.description ?? "code=" + res.data.code}`,
      },
      { status: 502 },
    );
  }

  const jobIds = res.data.ids ?? [];
  return NextResponse.json({
    success: true,
    eventId: id,
    eventTitle: event.title,
    jobIds,
  });
}
