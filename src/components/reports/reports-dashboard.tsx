"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, BarChart3 } from "lucide-react";
import { FilterSelect } from "@/components/shared/filter-select";

import { MetricsSummary } from "./metrics-summary";
import { VelocityChart } from "./velocity-chart";
import { BoardDistribution } from "./board-distribution";
import { TaskTypeBreakdown } from "./task-type-breakdown";
import { DeadlineCompliance } from "./deadline-compliance";
import { DeveloperRanking } from "./developer-ranking";
import { WeeklyPulse } from "./weekly-pulse";
import { TurnaroundChart } from "./turnaround-chart";
import { CmsVsDev } from "./cms-vs-dev";
import { DeveloperHeatmap } from "./developer-heatmap";
import { BoardHealth } from "./board-health";
import { PendingReleases } from "./pending-releases";
import { TeamTimeTracking } from "./team-time-tracking";

// ---- Types ----

interface BoardOption {
  jiraKey: string;
  name: string;
  color: string;
}

interface ReportsData {
  metrics: {
    tasksCompleted: number;
    tasksCompletedChange: number;
    avgCycleTime: number;
    avgCycleTimeChange: number;
    deadlinesMissed: number;
    deadlinesMissedPct: number;
    onTimePercentage: number;
    onTimeChange: number;
  };
  velocity: { period: string; prodCount: number; projectCount: number; total: number }[];
  boardDistribution: { name: string; key: string; count: number; color: string }[];
  taskTypeBreakdown: { type: string; count: number; percentage: number; color: string }[];
  deadlineCompliance: {
    met: number;
    missed: number;
    breakdown: { label: string; count: number }[];
  };
  developerRanking: {
    memberId: string;
    memberName: string;
    memberInitials: string;
    avatarUrl?: string | null;
    doneCount: number;
    missedCount: number;
    onTimePercentage: number;
    avgCycleTime: number;
    trend: "up" | "down" | "steady";
  }[];
  weeklyPulse: { week: string; created: number; completed: number }[];
  turnaround: {
    label: string;
    count: number;
    color: string;
    tasks?: {
      id: string;
      jiraKey: string;
      title: string;
      status: string;
      assigneeName: string;
      boardKey: string;
      boardColor: string;
      cycleTime: number | null;
      completedDate: string | null;
    }[];
  }[];
  cmsVsDev: { period: string; cms: number; dev: number }[];
  heatmap: {
    members: { id: string; name: string }[];
    months: string[];
    cells: { member: string; memberId: string; month: string; count: number; level: "high" | "medium" | "low" | "minimal"; tasks: { jiraKey: string; title: string; type: string | null; storyPoints: number | null; completedDate: string | null; cycleTime: number | null; boardKey: string; boardColor: string }[] }[];
  };
  boardHealth: {
    boardKey: string;
    boardName: string;
    color: string;
    active: number;
    blocked: number;
    overdue: number;
    done: number;
  }[];
  missedDeadlineTasks: {
    id: string;
    jiraKey: string;
    title: string;
    status: string;
    assigneeName: string;
    boardKey: string;
    boardColor: string;
    dueDate: string | null;
    completedDate: string | null;
    daysLate: number;
  }[];
  teams: string[];
  boards: BoardOption[];
}

// ---- Period options ----

const PERIOD_OPTIONS = [
  { value: "last-month", label: "Last Month" },
  { value: "last-3-months", label: "Last 3 Months" },
  { value: "last-6-months", label: "Last 6 Months" },
] as const;

type Period = (typeof PERIOD_OPTIONS)[number]["value"];

// ---- Segmented pill button ----

function SegmentedPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider transition-all ${
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---- Board select dropdown (uses shared FilterSelect) ----

function BoardSelect({
  boards,
  value,
  onChange,
}: {
  boards: BoardOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const options = [
    { value: "", label: "All Boards" },
    ...boards.map((b) => ({ value: b.jiraKey, label: `${b.jiraKey} — ${b.name}` })),
  ];
  return <FilterSelect value={value} onChange={onChange} options={options} />;
}

// ---- Section divider ----

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold font-mono uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
      <div className="flex-1 h-px bg-muted/40" />
    </div>
  );
}

// ---- Main component ----

export function ReportsDashboard() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("last-6-months");
  const [selectedBoard, setSelectedBoard] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedTeam && selectedTeam !== "All") params.set("team", selectedTeam);

      if (selectedBoard) params.set("board", selectedBoard);
      params.set("period", selectedPeriod);

      const res = await fetch(`/api/reports?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);

      // Auto-select first team on first load
      if (!selectedTeam && json.teams?.length > 0) {
        setSelectedTeam(json.teams[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [selectedTeam, selectedPeriod, selectedBoard]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Loading ----

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-mono">
          Loading reports...
        </span>
      </div>
    );
  }

  // ---- Error ----

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-destructive font-semibold">
          {error || "Failed to load reports"}
        </p>
        <button
          onClick={fetchData}
          className="text-sm text-primary font-bold font-mono hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // ---- Build team switcher options ----

  const teamOptions: { value: string; label: string }[] = [
    { value: "All", label: "All" },
    ...(data.teams ?? []).map((t) => ({ value: t, label: t })),
  ];

  const showTeamSwitcher = (data.teams ?? []).length > 1;

  return (
    <div className="space-y-8">
      {/* ── Controls bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Team switcher */}
        {showTeamSwitcher && (
          <SegmentedPills
            options={teamOptions}
            value={selectedTeam}
            onChange={(v) => setSelectedTeam(v)}
          />
        )}

        {/* Period picker */}
        <SegmentedPills
          options={[...PERIOD_OPTIONS]}
          value={selectedPeriod}
          onChange={(v) => setSelectedPeriod(v)}
        />

        {/* Board filter */}
        {data.boards && data.boards.length > 0 && (
          <BoardSelect
            boards={data.boards}
            value={selectedBoard}
            onChange={setSelectedBoard}
          />
        )}
      </div>

      {/* ── KPI strip ── */}
      <MetricsSummary metrics={data.metrics} missedDeadlineTasks={data.missedDeadlineTasks} />

      {/* ── Velocity + Board distribution ── */}
      <div>
        <SectionLabel>Velocity & Distribution</SectionLabel>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <VelocityChart data={data.velocity} />
          </div>
          <div className="lg:col-span-1">
            <BoardDistribution data={data.boardDistribution} />
          </div>
        </div>
      </div>

      {/* ── Task types + Deadline compliance ── */}
      <div>
        <SectionLabel>Task Types & Deadlines</SectionLabel>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <TaskTypeBreakdown data={data.taskTypeBreakdown} />
          </div>
          <div className="lg:col-span-1">
            <DeadlineCompliance data={data.deadlineCompliance} />
          </div>
        </div>
      </div>

      {/* ── Developer ranking ── */}
      <div>
        <SectionLabel>Developer Performance</SectionLabel>
        <div className="mt-4">
          <DeveloperRanking data={data.developerRanking} />
        </div>
      </div>

      {/* ── Team Time Tracking ── */}
      <div>
        <SectionLabel>Time Tracking</SectionLabel>
        <div className="mt-4">
          <TeamTimeTracking team={selectedTeam && selectedTeam !== "All" ? selectedTeam : undefined} />
        </div>
      </div>

      {/* ── Weekly pulse + Turnaround ── */}
      <div>
        <SectionLabel>Activity & Turnaround</SectionLabel>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <WeeklyPulse data={data.weeklyPulse} />
          <TurnaroundChart data={data.turnaround} />
        </div>
      </div>

      {/* ── CMS vs Dev + Board Health ── */}
      <div>
        <SectionLabel>Task Mix & Board Health</SectionLabel>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CmsVsDev data={data.cmsVsDev} />
          <BoardHealth data={data.boardHealth} />
        </div>
      </div>

      {/* ── Developer heatmap ── */}
      <div>
        <SectionLabel>Activity Heatmap</SectionLabel>
        <div className="mt-4">
          <DeveloperHeatmap data={data.heatmap} />
        </div>
      </div>

      {/* ── Pending Releases (self-fetching, only renders if data exists) ── */}
      <PendingReleases />
    </div>
  );
}
