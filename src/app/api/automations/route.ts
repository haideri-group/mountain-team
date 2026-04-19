import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listSyncLogs,
  VALID_LOG_SOURCES,
  VALID_SYNC_LOG_STATUSES,
  VALID_SYNC_LOG_TYPES,
  type LogSource,
  type SyncLogStatus,
  type SyncLogType,
} from "@/lib/sync/logs-query";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a query-string date. If the value is a bare `YYYY-MM-DD` (as
 *  produced by `<input type="date">`) and `endOfDay` is set, push it to
 *  23:59:59.999 UTC so the filter is inclusive of the selected day —
 *  otherwise `to=2026-04-21` would exclude every run from midnight
 *  onwards on the 21st. */
function parseDate(raw: string | null, endOfDay = false): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return undefined;
  if (endOfDay && DATE_ONLY.test(raw)) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const p = url.searchParams;
  const page = Math.max(1, Number.parseInt(p.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(p.get("pageSize") ?? "50", 10) || 50),
  );

  const typeRaw = p.get("type");
  const type =
    typeRaw && VALID_SYNC_LOG_TYPES.includes(typeRaw as SyncLogType)
      ? (typeRaw as SyncLogType)
      : "all";
  const statusRaw = p.get("status");
  const status =
    statusRaw &&
    VALID_SYNC_LOG_STATUSES.includes(statusRaw as SyncLogStatus)
      ? (statusRaw as SyncLogStatus)
      : "all";
  const sourceRaw = p.get("source");
  const source =
    sourceRaw && VALID_LOG_SOURCES.includes(sourceRaw as LogSource)
      ? (sourceRaw as LogSource)
      : "all";

  // Default date range: last 7 days if neither from nor to provided.
  let from = parseDate(p.get("from"));
  const to = parseDate(p.get("to"), /* endOfDay */ true);
  if (!from && !to) {
    from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  const result = await listSyncLogs({ page, pageSize, type, status, source, from, to });

  return NextResponse.json(result);
}
