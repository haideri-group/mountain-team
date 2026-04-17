import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runTimeDoctorSync } from "@/lib/sync/timedoctor-sync";
import { isTimeDoctorConfigured } from "@/lib/timedoctor/client";

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

    const { logId, result } = await runTimeDoctorSync(days);

    return NextResponse.json({
      success: true,
      logId,
      usersMatched: result.usersMatched,
      entriesUpserted: result.entriesUpserted,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Time Doctor sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
