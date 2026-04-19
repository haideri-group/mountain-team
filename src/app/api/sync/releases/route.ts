import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runReleaseSync } from "@/lib/sync/release-sync";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";

export async function POST() {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!tryAcquireSyncLock("release_sync")) {
      const lock = getActiveLock("release_sync");
      return NextResponse.json(
        {
          error: "A release sync is already in progress",
          runningSince: lock?.startedAt.toISOString() ?? null,
        },
        { status: 409 },
      );
    }

    try {
      const { logId, result } = await runReleaseSync({
        triggeredBy: "manual",
        triggeredByUserId: session.user.id ?? null,
      });

      return NextResponse.json({
        success: true,
        logId,
        versionsUpserted: result.versionsUpserted,
        projectsScanned: result.projectsScanned,
        errors: result.errors,
      });
    } finally {
      releaseSyncLock("release_sync");
    }
  } catch (error) {
    console.error("Release sync failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
