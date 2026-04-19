import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listSyncLogs,
  type LogSource,
  type SyncLogStatus,
  type SyncLogType,
} from "@/lib/sync/logs-query";

const VALID_TYPES: ReadonlyArray<SyncLogType> = [
  "full",
  "incremental",
  "manual",
  "team_sync",
  "worklog_sync",
  "timedoctor_sync",
  "release_sync",
  "deployment_backfill",
];

const VALID_STATUSES: ReadonlyArray<SyncLogStatus> = [
  "running",
  "completed",
  "failed",
];

const VALID_SOURCES: ReadonlyArray<LogSource> = ["cron", "manual", "unknown"];

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : undefined;
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
    typeRaw && VALID_TYPES.includes(typeRaw as SyncLogType)
      ? (typeRaw as SyncLogType)
      : "all";
  const statusRaw = p.get("status");
  const status =
    statusRaw && VALID_STATUSES.includes(statusRaw as SyncLogStatus)
      ? (statusRaw as SyncLogStatus)
      : "all";
  const sourceRaw = p.get("source");
  const source =
    sourceRaw && VALID_SOURCES.includes(sourceRaw as LogSource)
      ? (sourceRaw as LogSource)
      : "all";

  // Default date range: last 7 days if neither from nor to provided.
  let from = parseDate(p.get("from"));
  const to = parseDate(p.get("to"));
  if (!from && !to) {
    from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  const result = await listSyncLogs({ page, pageSize, type, status, source, from, to });

  return NextResponse.json(result);
}
