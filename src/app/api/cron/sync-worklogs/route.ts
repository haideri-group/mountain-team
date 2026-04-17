import { NextResponse } from "next/server";
import { runWorklogSync } from "@/lib/sync/worklog-sync";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { logId, result } = await runWorklogSync(7);

    return NextResponse.json({
      success: true,
      logId,
      issuesScanned: result.issuesScanned,
      worklogsUpserted: result.worklogsUpserted,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Cron worklog sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
