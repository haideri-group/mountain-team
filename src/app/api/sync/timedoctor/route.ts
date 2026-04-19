import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runTimeDoctorSync } from "@/lib/sync/timedoctor-sync";
import { isTimeDoctorConfigured } from "@/lib/timedoctor/client";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";
import { stampTriggeredBy } from "@/lib/sync/triggers";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isTimeDoctorConfigured()) {
      return NextResponse.json({ success: true, skipped: true, reason: "Time Doctor not configured" });
    }

    const url = new URL(request.url);
    const days = Math.max(1, Math.min(parseInt(url.searchParams.get("days") || "7", 10) || 7, 90));

    if (!tryAcquireSyncLock("timedoctor_sync")) {
      const lock = getActiveLock("timedoctor_sync");
      return NextResponse.json(
        {
          error: "A Time Doctor sync is already in progress",
          runningSince: lock?.startedAt.toISOString() ?? null,
        },
        { status: 409 },
      );
    }

    try {
      const { logId, result } = await runTimeDoctorSync(days);
      await stampTriggeredBy(logId, "manual", session.user.id ?? null);

      return NextResponse.json({
        success: true,
        logId,
        usersMatched: result.usersMatched,
        entriesUpserted: result.entriesUpserted,
        errors: result.errors,
      });
    } finally {
      releaseSyncLock("timedoctor_sync");
    }
  } catch (error) {
    console.error("Time Doctor sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
