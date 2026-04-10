"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { MetricsStrip } from "./metrics-strip";
import { FilterBar } from "./filter-bar";
import { DevCard } from "./dev-card";

interface OverviewData {
  members: any[];
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

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/overview");
      if (!res.ok) throw new Error("Failed to load overview data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearAll = () => {
    setFilters(defaultFilters);
  };

  // Apply filters to members
  const filteredMembers = useMemo(() => {
    if (!data) return [];

    return data.members.filter((member) => {
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
          member.queuedIssues.some((i: any) => i.boardKey === filters.board) ||
          member.recentDone.some((i: any) => i.boardKey === filters.board);
        if (!hasIssueFromBoard) return false;
      }

      // Type filter — member has at least one visible issue of this type
      if (filters.type) {
        const hasType =
          member.currentIssue?.type === filters.type ||
          member.queuedIssues.some((i: any) => i.type === filters.type) ||
          member.recentDone.some((i: any) => i.type === filters.type);
        if (!hasType) return false;
      }

      // Priority filter
      if (filters.priority) {
        const hasPriority =
          member.currentIssue?.priority === filters.priority ||
          member.queuedIssues.some((i: any) => i.priority === filters.priority) ||
          member.recentDone.some((i: any) => i.priority === filters.priority);
        if (!hasPriority) return false;
      }

      // Status filter
      if (filters.status) {
        const hasStatus =
          member.currentIssue?.status === filters.status ||
          member.queuedIssues.some((i: any) => i.status === filters.status) ||
          member.recentDone.some((i: any) => i.status === filters.status);
        if (!hasStatus) return false;
      }

      return true;
    });
  }, [data, filters]);

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

      {/* Section Header + Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-mono">Team Members</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {filteredMembers.length} of {data.members.length} members
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
