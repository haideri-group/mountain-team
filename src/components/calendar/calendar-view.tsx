"use client";

import { useState, useEffect, useCallback } from "react";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  SlidersHorizontal,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CalendarGrid } from "./calendar-grid";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  issueKey: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  assigneeInitials: string;
  boardKey: string;
  boardColor: string;
  status: string;
  priority: string | null;
  type: string | null;
  startDate: string;
  endDate: string;
  isOverdue: boolean;
  teamName: string | null;
}

interface BoardOption {
  id: string;
  jiraKey: string;
  name: string;
  color: string | null;
}

interface MemberOption {
  id: string;
  displayName: string;
  teamName: string | null;
}

interface CalendarData {
  events: CalendarEvent[];
  boards: BoardOption[];
  members: MemberOption[];
  teams: string[];
}

interface Filters {
  board: string;
  member: string;
  status: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "ready_for_testing", label: "Ready for Testing" },
  { value: "ready_for_live", label: "Ready for Live" },
  { value: "done", label: "Done" },
];

const DEFAULT_FILTERS: Filters = { board: "", member: "", status: "" };

// ─── FilterSelect ─────────────────────────────────────────────────────────────

// FilterSelect imported from @/components/shared/filter-select

// ─── Main Component ───────────────────────────────────────────────────────────

export function CalendarView() {
  // First-of-month Date object
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Navigation helpers ───────────────────────────────────────────────────

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const year = currentMonth.getFullYear();
      const month = String(currentMonth.getMonth() + 1).padStart(2, "0");
      const monthParam = `${year}-${month}`;

      const params = new URLSearchParams({ month: monthParam });
      if (selectedTeam) params.set("team", selectedTeam);
      if (filters.board) params.set("board", filters.board);
      if (filters.member) params.set("member", filters.member);
      if (filters.status) params.set("status", filters.status);

      const res = await fetch(`/api/calendar?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load calendar data");
      const json: CalendarData = await res.json();
      setData(json);

      // Auto-select first team on initial load
      if (!selectedTeam && json.teams.length > 0) {
        setSelectedTeam(json.teams[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [currentMonth, selectedTeam, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Filter helpers ───────────────────────────────────────────────────────

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearAll = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const hasFilters = Object.values(filters).some((v) => v !== "");

  // ── Derived values ────────────────────────────────────────────────────────

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1; // 1-12
  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()].toUpperCase()} ${year}`;

  const isCurrentMonth =
    currentMonth.getMonth() === new Date().getMonth() &&
    currentMonth.getFullYear() === new Date().getFullYear();

  const boardOptions = [
    { value: "", label: "All Boards" },
    ...(data?.boards || []).map((b) => ({
      value: b.jiraKey,
      label: `${b.jiraKey} — ${b.name}`,
    })),
  ];

  const memberOptions = [
    { value: "", label: "All Members" },
    ...(data?.members || [])
      .filter((m) => !selectedTeam || m.teamName === selectedTeam)
      .map((m) => ({ value: m.id, label: m.displayName })),
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>

          <button
            onClick={goToToday}
            className={cn(
              "flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all",
              isCurrentMonth
                ? "bg-primary/10 text-primary"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Today
          </button>

          <button
            onClick={goToNextMonth}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>

          <h2 className="ml-1 text-lg font-bold font-mono tracking-wider text-foreground">
            {monthLabel}
          </h2>
        </div>

        {/* Team switcher */}
        {data && data.teams.length > 1 && (
          <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
            {data.teams.map((team) => (
              <button
                key={team}
                onClick={() => setSelectedTeam(team)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider transition-all",
                  selectedTeam === team
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {team}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Filters Row ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <FilterSelect
          value={filters.board}
          onChange={(v) => handleFilterChange("board", v)}
          options={boardOptions}
        />

        <FilterSelect
          value={filters.member}
          onChange={(v) => handleFilterChange("member", v)}
          options={memberOptions}
        />

        <FilterSelect
          value={filters.status}
          onChange={(v) => handleFilterChange("status", v)}
          options={STATUS_OPTIONS}
        />

        {hasFilters && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}

        {/* Event count badge */}
        {data && !loading && (
          <span className="ml-auto text-xs font-mono text-muted-foreground">
            {data.events.length} task{data.events.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Grid Area ────────────────────────────────────────────────────── */}
      <div className="relative">
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-card shadow-sm ring-1 ring-foreground/10">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs font-mono text-muted-foreground">Loading...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-card rounded-xl p-16 flex flex-col items-center gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={fetchData}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!error && !loading && data && data.events.length === 0 && (
          <div className="bg-card rounded-xl overflow-hidden">
            {/* Still render the grid shell for structural consistency */}
            <CalendarGrid year={year} month={month} events={[]} />
            <div className="py-10 text-center -mt-px">
              <p className="text-sm text-muted-foreground">
                No tasks scheduled for {MONTH_NAMES[currentMonth.getMonth()]} {year}.
              </p>
              {hasFilters && (
                <button
                  onClick={handleClearAll}
                  className="mt-2 text-sm font-semibold text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Calendar grid */}
        {!error && data && data.events.length > 0 && (
          <CalendarGrid year={year} month={month} events={data.events} />
        )}

        {/* Initial skeleton (no data yet, first load) */}
        {!error && !data && !loading && (
          <div className="bg-card rounded-xl p-16 text-center">
            <p className="text-sm text-muted-foreground">No data available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
