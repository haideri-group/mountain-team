import { NextResponse } from "next/server";
import { runReleaseSync } from "@/lib/sync/release-sync";
import { generateReleaseNotifications } from "@/lib/notifications/release-generator";
import { sanitizeErrorText } from "@/lib/jira/client";
import {
  getActiveLock,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "@/lib/sync/concurrency";
import { consumePendingManual, stampTriggeredBy } from "@/lib/sync/triggers";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.SYNC_SECRET;

    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!tryAcquireSyncLock("release_sync")) {
      const lock = getActiveLock("release_sync");
      return NextResponse.json({
        success: true,
        deferred: true,
        reason: "already_running",
        runningSince: lock?.startedAt.toISOString() ?? null,
      });
    }

    try {
      const pending = consumePendingManual("release_sync");
      const { logId, result } = await runReleaseSync();
      await stampTriggeredBy(
        logId,
        pending ? "manual" : "cron",
        pending?.userId ?? null,
      );

      // Fire release-scoped notifications after the sync so state transitions
      // (e.g., released=true flipped in JIRA) propagate immediately.
      let notifCounts: Awaited<ReturnType<typeof generateReleaseNotifications>> | null = null;
      try {
        notifCounts = await generateReleaseNotifications();
      } catch (err) {
        // Sanitize — the generator touches release/issue rows whose paths may
        // echo upstream JIRA tokens when SQL driver errors bubble up.
        console.error(
          "Release notification generation failed (non-fatal):",
          sanitizeErrorText(err instanceof Error ? err.message : String(err)),
        );
      }

      return NextResponse.json({
        success: true,
        logId,
        versionsUpserted: result.versionsUpserted,
        projectsScanned: result.projectsScanned,
        errors: result.errors,
        notifications: notifCounts,
      });
    } finally {
      releaseSyncLock("release_sync");
    }
  } catch (error) {
    // Log the sanitized detail server-side for debugging, but never return
    // it to the caller. Even after JIRA-token redaction, exception messages
    // can leak implementation details (table names, SQL fragments, internals)
    // that don't belong in an HTTP response body.
    const message = sanitizeErrorText(error instanceof Error ? error.message : "Sync failed");
    console.error("Cron release sync failed:", message);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
