"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { MetricsStrip } from "./metrics-strip";
import { FilterBar } from "./filter-bar";
import { DevCard, type DevCardMember } from "./dev-card";

// The /api/overview response returns DevCardMember-shaped rows with an extra
// `teamName` field layered on top (used for team-filter rendering here;
// DevCard itself doesn't render it).
type OverviewMember = DevCardMember & { teamName: string | null };

interface OverviewData {
  members: OverviewMember[];
  metrics: {
    teamMembers: number;
    activeIssues: number;
    inProgress: number;
    overdueTasks: number;
    overdueChange: number;
  };
  boards: { id: string; jiraKey: string; name: string; color: string | null }[];
}

const defaultFilters = {
  board: "",
  availability: "",
  type: "",
  priority: "",
  status: "",
};

export function OverviewDashboard({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [selectedTeam, setSelectedTeam] = useState<string>("");

  // Stable across renders so the refresh button (`onClick={fetchData}`) gets
  // a consistent reference. Uses a functional setter for selectedTeam so
  // we don't need it in the dependency array — that would cause a re-fetch
  // on every team-filter change, which is wrong.
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/overview");
      if (!res.ok) throw new Error("Failed to load overview data");
      const json = await res.json();
      setData(json);
      // Auto-select first team if not already selected (functional update
      // so we read prev without depending on selectedTeam in closure).
      if (json.members) {
        const teams = [...new Set(
          json.members
            .map((m: { teamName: string | null }) => m.teamName)
            .filter(Boolean) as string[],
        )].sort();
        if (teams.length > 0) setSelectedTeam((prev) => prev || teams[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearAll = () => {
    setFilters(defaultFilters);
  };

  // Derive available teams from data
  const availableTeams = useMemo(() => {
    if (!data) return [];
    return [...new Set(
      data.members
        .map((m) => m.teamName)
        .filter((t): t is string => !!t),
    )].sort();
  }, [data]);

  // Apply filters to members
  const filteredMembers = useMemo(() => {
    if (!data) return [];

    return data.members.filter((member) => {
      // Team filter (required -- show only selected team)
      if (selectedTeam && member.teamName !== selectedTeam) return false;

      // Availability filter (default: hide departed)
      if (filters.availability) {
        if (member.status !== filters.availability) return false;
      } else {
        // Default: hide departed
        if (member.status === "departed") return false;
      }

      // Board filter — check if member has any issues from the selected board
      if (filters.board) {
        const hasIssueFromBoard =
          member.currentIssue?.boardKey === filters.board ||
          member.queuedIssues.some((i) => i.boardKey === filters.board) ||
          member.recentDone.some((i) => i.boardKey === filters.board);
        if (!hasIssueFromBoard) return false;
      }

      // Type filter — member has at least one visible issue of this type
      if (filters.type) {
        const hasType =
          member.currentIssue?.type === filters.type ||
          member.queuedIssues.some((i) => i.type === filters.type) ||
          member.recentDone.some((i) => i.type === filters.type);
        if (!hasType) return false;
      }

      // Priority filter
      if (filters.priority) {
        const hasPriority =
          member.currentIssue?.priority === filters.priority ||
          member.queuedIssues.some((i) => i.priority === filters.priority) ||
          member.recentDone.some((i) => i.priority === filters.priority);
        if (!hasPriority) return false;
      }

      // Status filter
      if (filters.status) {
        const hasStatus =
          member.currentIssue?.status === filters.status ||
          member.queuedIssues.some((i) => i.status === filters.status) ||
          member.recentDone.some((i) => i.status === filters.status);
        if (!hasStatus) return false;
      }

      return true;
    });
  }, [data, filters, selectedTeam]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Loading team overview...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <p className="text-sm text-destructive">{error || "Failed to load data"}</p>
        <button
          onClick={fetchData}
          className="text-sm text-primary font-semibold hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Strip */}
      <MetricsStrip metrics={data.metrics} />

      {/* Team Switcher + Section Header + Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {availableTeams.length > 1 ? (
              <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
                {availableTeams.map((team) => (
                  <button
                    key={team}
                    onClick={() => setSelectedTeam(team)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider transition-all ${
                      selectedTeam === team
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {team}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="text-lg font-bold font-mono">
                {selectedTeam || "Team Members"}
              </h2>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {filteredMembers.length} members
          </span>
        </div>

        <FilterBar
          boards={data.boards}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearAll={handleClearAll}
          isAdmin={isAdmin}
        />
      </div>

      {/* Developer Card Grid */}
      {filteredMembers.length === 0 ? (
        <div className="bg-card rounded-xl p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No team members match the current filters.
          </p>
          <button
            onClick={handleClearAll}
            className="text-sm text-primary font-semibold hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredMembers.map((member) => (
            <DevCard key={member.id} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}
