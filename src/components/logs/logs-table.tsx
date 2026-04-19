"use client";

import Link from "next/link";
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
  triggeredByUser: {
    userId: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    memberId: string | null;
  } | null;
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

/** Source cell — `cron`, `manual (Name)` (with profile link when the
 *  triggering admin is a team member), or plain `unknown` for legacy
 *  rows. Clicking the name navigates to `/members/:id` without opening
 *  the drawer (stopPropagation). */
function SourceCell({ row }: { row: LogRow }) {
  if (row.source === "manual" && row.triggeredByUser) {
    const u = row.triggeredByUser;
    const label = u.name || u.email || "manual";
    if (u.memberId) {
      return (
        <span className="inline-flex items-center gap-1 normal-case tracking-normal">
          manual (
          <Link
            href={`/members/${u.memberId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[#ff8400] hover:underline font-sans font-normal text-xs lowercase-none"
          >
            {label}
          </Link>
          )
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 normal-case tracking-normal">
        manual ({label})
      </span>
    );
  }
  return <>{row.source}</>;
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
        <div
          key={row.id}
          role="button"
          tabIndex={0}
          onClick={() => onRowClick(row.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(row.id);
            }
          }}
          className="w-full grid grid-cols-[1fr_1fr] md:grid-cols-[1.5fr_2fr_1fr_1fr_2fr_auto] gap-3 px-5 py-3 items-center text-left hover:bg-muted/30 transition-colors cursor-pointer focus:outline-none focus:bg-muted/30"
        >
          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
            {formatStarted(row.startedAt)}
          </span>
          <span className="text-sm truncate">{TYPE_LABELS[row.type] ?? row.type}</span>
          <span className="hidden md:inline text-xs font-mono">{formatDuration(row.durationMs)}</span>
          <span className="hidden md:inline text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <SourceCell row={row} />
          </span>
          <span className="hidden md:inline text-xs truncate text-muted-foreground">
            {formatDetails(row)}
          </span>
          <StatusPill status={row.status} />
        </div>
      ))}
    </div>
  );
}
