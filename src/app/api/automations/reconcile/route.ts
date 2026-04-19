import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { reconcileRunningSyncLogs } from "@/lib/sync/reconcile";

/**
 * POST /api/automations/reconcile
 *
 * Walks every `sync_logs` row currently `status='running'` and, for
 * each one whose correlated Cronicle job is terminal (success / error /
 * timeout) AND has been terminal for > 2 min, marks the row as `failed`.
 * Resolves the "Cronicle says timed out, app says running" contradiction
 * without requiring admins to reclaim manually.
 *
 * Called on /automations page mount and on every SSE sync_log event to
 * keep app + Cronicle state aligned. Admin-only.
 */
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const result = await reconcileRunningSyncLogs();
  return NextResponse.json(result);
}
