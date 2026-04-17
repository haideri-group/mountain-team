import { NextResponse } from "next/server";
import { runTimeDoctorSync } from "@/lib/sync/timedoctor-sync";
import { isTimeDoctorConfigured } from "@/lib/timedoctor/client";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isTimeDoctorConfigured()) {
      return NextResponse.json({ success: true, skipped: true, reason: "Time Doctor not configured" });
    }

    const { logId, result } = await runTimeDoctorSync(7);

    return NextResponse.json({
      success: true,
      logId,
      usersMatched: result.usersMatched,
      entriesUpserted: result.entriesUpserted,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Cron Time Doctor sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
