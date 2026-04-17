import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runWorklogSync } from "@/lib/sync/worklog-sync";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const days = Math.max(1, Math.min(parseInt(url.searchParams.get("days") || "7", 10) || 7, 90));

    const { logId, result } = await runWorklogSync(days);

    return NextResponse.json({
      success: true,
      logId,
      issuesScanned: result.issuesScanned,
      worklogsUpserted: result.worklogsUpserted,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Worklog sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
