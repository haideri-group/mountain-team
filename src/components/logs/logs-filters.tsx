"use client";

import type { SyncLogType, SyncLogStatus, LogSource } from "@/lib/sync/logs-query";

export interface LogsFiltersValue {
  type: SyncLogType | "all";
  status: SyncLogStatus | "all";
  source: LogSource | "all";
  from: string;   // YYYY-MM-DD
  to: string;     // YYYY-MM-DD
}

const TYPE_OPTIONS: Array<{ value: LogsFiltersValue["type"]; label: string }> = [
  { value: "all", label: "All types" },
  { value: "team_sync", label: "Team Sync" },
  { value: "full", label: "Issue Sync (full)" },
  { value: "incremental", label: "Issue Sync (incremental)" },
  { value: "manual", label: "Issue Sync (manual)" },
  { value: "release_sync", label: "Release Sync" },
  { value: "worklog_sync", label: "Worklog Sync" },
  { value: "timedoctor_sync", label: "TimeDoctor Sync" },
  { value: "deployment_backfill", label: "Deployment Backfill" },
];

const STATUS_OPTIONS: Array<{ value: LogsFiltersValue["status"]; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const SOURCE_OPTIONS: Array<{ value: LogsFiltersValue["source"]; label: string }> = [
  { value: "all", label: "Any source" },
  { value: "cron", label: "Cron-triggered" },
  { value: "manual", label: "Manual" },
];

export function LogsFilters({
  value,
  onChange,
}: {
  value: LogsFiltersValue;
  onChange: (next: LogsFiltersValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.type}
        onChange={(e) => onChange({ ...value, type: e.target.value as LogsFiltersValue["type"] })}
        className="h-9 rounded-lg bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
      >
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={value.status}
        onChange={(e) => onChange({ ...value, status: e.target.value as LogsFiltersValue["status"] })}
        className="h-9 rounded-lg bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={value.source}
        onChange={(e) => onChange({ ...value, source: e.target.value as LogsFiltersValue["source"] })}
        className="h-9 rounded-lg bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
      >
        {SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input
        type="date"
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
        className="h-9 rounded-lg bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
        placeholder="From"
      />
      <input
        type="date"
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
        className="h-9 rounded-lg bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
        placeholder="To"
      />
    </div>
  );
}
