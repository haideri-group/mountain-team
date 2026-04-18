"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, BarChart2 } from "lucide-react";
import { WorkloadSummary } from "./workload-summary";
import { WorkloadAlerts } from "./workload-alerts";
import { CapacityChart } from "./capacity-chart";

// ---- Types ----

interface WorkloadTask {
  jiraKey: string;
  title: string;
  status: string;
  storyPoints: number | null;
  type: string | null;
  boardKey: string;
  boardColor: string;
  weight: number;
}

interface WorkloadMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  teamName: string | null;
  capacity: number;
  status: "active" | "on_leave" | "departed";
  assignedCount: number;
  inProgressCount: number;
  activePoints: number;
  completedCount: number;
  percentage: number;
  level: "idle" | "under" | "optimal" | "high" | "over";
  tasks: WorkloadTask[];
  totalTaskCount: number;
  trend: { week: string; percentage: number }[];
  trendDirection: "up" | "down" | "steady";
  burnoutRisk: boolean;
  weeksOverCapacity: number;
}

interface WorkloadAlert {
  type: "over-capacity" | "idle" | "burnout-risk";
  memberId: string;
  memberName: string;
  avatarUrl: string | null;
  percentage: number;
  message: string;
}

interface WorkloadSummaryData {
  teamAverage: number;
  overCapacityCount: number;
  highLoadCount: number;
  optimalCount: number;
  underLoadCount: number;
  idleCount: number;
  burnoutRiskCount: number;
  totalActivePoints: number;
  totalCapacity: number;
}

interface WorkloadData {
  members: WorkloadMember[];
  summary: WorkloadSummaryData;
  alerts: WorkloadAlert[];
  teams: string[];
  selectedTeam?: string;
}

// ---- Segmented pills (same pattern as reports/overview) ----

function SegmentedPills({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider transition-all ${
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

// ---- Main Dashboard ----

export function WorkloadDashboard() {
  const [data, setData] = useState<WorkloadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>("");

  const fetchWorkload = useCallback(async (team: string) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (team) params.set("team", team);

      const res = await fetch(`/api/workload?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string })?.error || `HTTP ${res.status}`,
        );
      }
      const json: WorkloadData = await res.json();
      setData(json);

      // On first load, sync the switcher with what the API auto-selected
      if (!team && json.selectedTeam) {
        setSelectedTeam(json.selectedTeam);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — no team param, API defaults to first team
  useEffect(() => {
    fetchWorkload("");
  }, [fetchWorkload]);

  // Team change — fetch with the selected team (skip if it's the initial sync)
  const handleTeamChange = useCallback((team: string) => {
    setSelectedTeam(team);
    fetchWorkload(team);
  }, [fetchWorkload]);

  // ---- Initial loading (no data yet) ----

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-mono">
          Loading workload data...
        </span>
      </div>
    );
  }

  // ---- Error (no data) ----

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <BarChart2 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-destructive font-semibold">
          {error}
        </p>
        <button
          onClick={() => fetchWorkload(selectedTeam)}
          className="text-sm text-primary font-bold font-mono hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  // ---- Team switcher options ----

  const teamOptions: { value: string; label: string }[] = [
    { value: "All", label: "All" },
    ...(data.teams ?? []).map((t) => ({ value: t, label: t })),
  ];

  const showTeamSwitcher = (data.teams ?? []).length > 1;

  return (
    <div className="space-y-5">
      {/* Controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {showTeamSwitcher && (
            <SegmentedPills
              options={teamOptions}
              value={selectedTeam}
              onChange={handleTeamChange}
            />
          )}
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {data.members.length} member{data.members.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content with loading overlay for subsequent fetches */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 bg-background/60 z-10 flex items-center justify-center rounded-xl">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="space-y-5">
          {/* KPI Summary Strip */}
          <WorkloadSummary summary={data.summary} />

          {/* Alerts (only when present) */}
          <WorkloadAlerts alerts={data.alerts} />

          {/* Capacity Chart */}
          <CapacityChart members={data.members} />
        </div>
      </div>
    </div>
  );
}
