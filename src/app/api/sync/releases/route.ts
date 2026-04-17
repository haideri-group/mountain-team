import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runReleaseSync } from "@/lib/sync/release-sync";

export async function POST() {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { logId, result } = await runReleaseSync();

    return NextResponse.json({
      success: true,
      logId,
      versionsUpserted: result.versionsUpserted,
      projectsScanned: result.projectsScanned,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Release sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
