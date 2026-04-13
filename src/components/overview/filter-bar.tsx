"use client";

import { SlidersHorizontal, X, RefreshCw } from "lucide-react";

interface BoardOption {
  id: string;
  jiraKey: string;
  name: string;
  color: string | null;
}

interface FilterBarProps {
  boards: BoardOption[];
  filters: {
    board: string;
    availability: string;
    type: string;
    priority: string;
    status: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
  isAdmin: boolean;
  onSyncNow?: () => void;
  syncing?: boolean;
}

const availabilityOptions = [
  { value: "", label: "All Availability" },
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "departed", label: "Departed" },
];

const typeOptions = [
  { value: "", label: "All Types" },
  { value: "bug", label: "Bug" },
  { value: "story", label: "Story" },
  { value: "cms_change", label: "CMS Change" },
  { value: "enhancement", label: "Enhancement" },
  { value: "task", label: "Task" },
];

const priorityOptions = [
  { value: "", label: "All Priorities" },
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
];

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "todo", label: "To Do" },
  { value: "on_hold", label: "On Hold" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "ready_for_testing", label: "Ready for Testing" },
  { value: "ready_for_live", label: "Ready for Live" },
  { value: "done", label: "Done" },
];

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 px-3 rounded-lg bg-muted/30 text-sm font-mono text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all pr-8"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({
  boards,
  filters,
  onFilterChange,
  onClearAll,
  isAdmin,
  onSyncNow,
  syncing,
}: FilterBarProps) {
  const hasFilters = Object.values(filters).some((v) => v !== "");

  const boardOptions = [
    { value: "", label: "All Boards" },
    ...boards.map((b) => ({ value: b.jiraKey, label: `${b.jiraKey} — ${b.name}` })),
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />

      <FilterSelect
        value={filters.board}
        onChange={(v) => onFilterChange("board", v)}
        options={boardOptions}
      />
      <FilterSelect
        value={filters.availability}
        onChange={(v) => onFilterChange("availability", v)}
        options={availabilityOptions}
      />
      <FilterSelect
        value={filters.type}
        onChange={(v) => onFilterChange("type", v)}
        options={typeOptions}
      />
      <FilterSelect
        value={filters.priority}
        onChange={(v) => onFilterChange("priority", v)}
        options={priorityOptions}
      />
      <FilterSelect
        value={filters.status}
        onChange={(v) => onFilterChange("status", v)}
        options={statusOptions}
      />

      {hasFilters && (
        <button
          onClick={onClearAll}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}

      {isAdmin && onSyncNow && (
        <button
          onClick={onSyncNow}
          disabled={syncing}
          className="ml-auto flex items-center gap-2 px-4 h-9 rounded-lg text-xs font-bold font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          Sync Now
        </button>
      )}
    </div>
  );
}
