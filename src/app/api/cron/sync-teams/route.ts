import { NextResponse } from "next/server";
import { runTeamSync } from "@/lib/sync/team-sync";

export async function GET(request: Request) {
  try {
    // Verify secret for cron auth (Vercel uses CRON_SECRET, we also accept SYNC_SECRET)
    const authHeader = request.headers.get("authorization");
    const expectedSecret =
      process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (
      !expectedSecret ||
      authHeader !== `Bearer ${expectedSecret}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { logId, result } = await runTeamSync();

    return NextResponse.json({
      success: true,
      logId,
      added: result.added,
      departed: result.departed,
      updated: result.updated,
      rejoined: result.rejoined,
      unchanged: result.unchanged,
      total: result.total,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Cron team sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
