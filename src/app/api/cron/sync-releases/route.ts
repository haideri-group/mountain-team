import { NextResponse } from "next/server";
import { runReleaseSync } from "@/lib/sync/release-sync";
import { generateReleaseNotifications } from "@/lib/notifications/release-generator";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { logId, result } = await runReleaseSync();

    // Fire release-scoped notifications after the sync so state transitions
    // (e.g., released=true flipped in JIRA) propagate immediately.
    let notifCounts: Awaited<ReturnType<typeof generateReleaseNotifications>> | null = null;
    try {
      notifCounts = await generateReleaseNotifications();
    } catch (err) {
      console.error("Release notification generation failed (non-fatal):", err);
    }

    return NextResponse.json({
      success: true,
      logId,
      versionsUpserted: result.versionsUpserted,
      projectsScanned: result.projectsScanned,
      errors: result.errors,
      notifications: notifCounts,
    });
  } catch (error) {
    console.error("Cron release sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
