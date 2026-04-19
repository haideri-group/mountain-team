"use client";

import { StatusPill } from "./status-pill";
import { APP_TIMEZONE } from "@/lib/config";

export interface LogRow {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  issueCount: number;
  memberCount: number;
  source: "cron" | "manual" | "unknown";
  errorPreview: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  team_sync: "Team Sync",
  full: "Issue Sync (full)",
  incremental: "Issue Sync (incremental)",
  manual: "Issue Sync (manual)",
  release_sync: "Release Sync",
  worklog_sync: "Worklog Sync",
  timedoctor_sync: "TimeDoctor Sync",
  deployment_backfill: "Deployment Backfill",
};

function formatStarted(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleString("en-GB", {
    timeZone: APP_TIMEZONE,
    hour12: true,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = m / 60;
  return `${h.toFixed(1)}h`;
}

function formatDetails(row: LogRow): string {
  if (row.status === "running") return "in progress";
  if (row.status === "failed") return row.errorPreview ?? "failed";
  if (row.type === "team_sync") return `${row.memberCount} members`;
  if (row.issueCount > 0) return `${row.issueCount} issues`;
  return "—";
}

export function LogsTable({
  rows,
  loading,
  onRowClick,
}: {
  rows: LogRow[];
  loading: boolean;
  onRowClick: (id: string) => void;
}) {
  return (
    <div className="rounded-xl bg-card overflow-hidden">
      <div className="hidden md:grid grid-cols-[1.5fr_2fr_1fr_1fr_2fr_auto] gap-3 px-5 py-2.5 text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground bg-muted/30">
        <span>Started</span>
        <span>Type</span>
        <span>Duration</span>
        <span>Source</span>
        <span>Details</span>
        <span>Status</span>
      </div>

      {loading && rows.length === 0 && (
        <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
      )}
      {!loading && rows.length === 0 && (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No runs match the current filters.
        </div>
      )}

      {rows.map((row) => (
        <button
          key={row.id}
          onClick={() => onRowClick(row.id)}
          className="w-full grid grid-cols-[1fr_1fr] md:grid-cols-[1.5fr_2fr_1fr_1fr_2fr_auto] gap-3 px-5 py-3 items-center text-left hover:bg-muted/30 transition-colors"
        >
          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
            {formatStarted(row.startedAt)}
          </span>
          <span className="text-sm truncate">{TYPE_LABELS[row.type] ?? row.type}</span>
          <span className="hidden md:inline text-xs font-mono">{formatDuration(row.durationMs)}</span>
          <span className="hidden md:inline text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {row.source}
          </span>
          <span className="hidden md:inline text-xs truncate text-muted-foreground">
            {formatDetails(row)}
          </span>
          <StatusPill status={row.status} />
        </button>
      ))}
    </div>
  );
}
