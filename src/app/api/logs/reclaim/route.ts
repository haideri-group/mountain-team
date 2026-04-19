import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { reclaimStuckRuns } from "@/lib/sync/reclaim";
import type { SyncLogType } from "@/lib/sync/logs-query";

const VALID_TYPES: ReadonlyArray<SyncLogType> = [
  "full",
  "incremental",
  "manual",
  "team_sync",
  "worklog_sync",
  "timedoctor_sync",
  "release_sync",
  "deployment_backfill",
];

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: { type?: unknown; graceMs?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  let type: SyncLogType | undefined = undefined;
  if (typeof body.type === "string") {
    if (!VALID_TYPES.includes(body.type as SyncLogType)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    type = body.type as SyncLogType;
  }

  let graceMs: number | undefined = undefined;
  if (typeof body.graceMs === "number" && Number.isFinite(body.graceMs)) {
    graceMs = Math.max(60_000, body.graceMs); // never allow less than 1 min
  }

  const reason = `Bulk reclaim via admin action by ${session.user.email ?? session.user.id ?? "admin"}`;
  const result = await reclaimStuckRuns({ type, graceMs, reason });
  return NextResponse.json(result);
}
