"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKFLOW_STAGES } from "@/types";

interface StatusMapping {
  id: string;
  jiraStatusName: string;
  workflowStage: string;
  statusCategory: string | null;
  isAutoMapped: boolean;
  createdAt: string | null;
}

const stageLabels: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  on_hold: "On Hold",
  in_progress: "In Progress",
  in_review: "In Review",
  ready_for_testing: "Ready for Testing",
  ready_for_live: "Ready for Live",
  rolling_out: "Rolling Out",
  post_live_testing: "Post Live Testing",
  done: "Done",
  closed: "Closed",
};

const stageColors: Record<string, string> = {
  backlog: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  todo: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  on_hold: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  in_review: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  ready_for_testing: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  ready_for_live: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  rolling_out: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
  post_live_testing: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export function StatusMappingManager() {
  const [mappings, setMappings] = useState<StatusMapping[]>([]);
  const [autoMappedCount, setAutoMappedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAutoOnly, setShowAutoOnly] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  const fetchMappings = async () => {
    try {
      const res = await fetch("/api/status-mappings");
      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings);
        setAutoMappedCount(data.autoMappedCount);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleStageChange = async (mapping: StatusMapping, newStage: string) => {
    setUpdatingId(mapping.id);
    try {
      const res = await fetch("/api/status-mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mapping.id, workflowStage: newStage }),
      });
      if (res.ok) {
        fetchMappings();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleApply = async (mapping: StatusMapping) => {
    setApplyingId(mapping.id);
    setApplyResult(null);
    try {
      const res = await fetch("/api/status-mappings/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappingId: mapping.id }),
      });
      const data = await res.json();
      setApplyResult(data.message || `Updated ${data.affected} issues`);
      fetchMappings(); // Refresh to clear Auto badge
    } catch {
      setApplyResult("Failed to apply");
    } finally {
      setApplyingId(null);
    }
  };

  const filtered = mappings.filter((m) => {
    if (showAutoOnly && !m.isAutoMapped) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        m.jiraStatusName.toLowerCase().includes(q) ||
        m.workflowStage.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold font-mono">Status Mappings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Map JIRA status names to workflow stages. Badges show the JIRA name, calculations use the stage.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {autoMappedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {autoMappedCount} unreviewed
              </span>
            )}
            <span className="text-xs text-muted-foreground font-mono">
              {mappings.length} total
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search JIRA status names..."
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
          <button
            onClick={() => setShowAutoOnly(!showAutoOnly)}
            className={cn(
              "h-9 px-4 rounded-lg text-xs font-bold font-mono uppercase tracking-wider transition-all",
              showAutoOnly
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                : "bg-muted/30 text-muted-foreground hover:text-foreground",
            )}
          >
            {showAutoOnly ? "Show All" : "Auto-mapped Only"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/20">
                <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  JIRA Status
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[200px]">
                  Workflow Stage
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[100px]">
                  Category
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[100px]">
                  Source
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[100px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No status mappings found{search ? ` matching "${search}"` : ""}.
                  </td>
                </tr>
              )}
              {filtered.map((mapping) => (
                <tr
                  key={mapping.id}
                  className={cn(
                    "border-t border-border/30 hover:bg-muted/5 transition-colors",
                    mapping.isAutoMapped && "bg-amber-50/30 dark:bg-amber-950/10",
                  )}
                >
                  {/* JIRA Status Name */}
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono uppercase tracking-wide",
                        stageColors[mapping.workflowStage] || stageColors.todo,
                      )}
                    >
                      {mapping.jiraStatusName}
                    </span>
                  </td>

                  {/* Workflow Stage dropdown */}
                  <td className="px-5 py-3">
                    <select
                      value={mapping.workflowStage}
                      onChange={(e) => handleStageChange(mapping, e.target.value)}
                      disabled={updatingId === mapping.id}
                      className="h-8 px-3 rounded-lg bg-muted/30 text-xs font-mono appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 pr-7 disabled:opacity-50"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 6px center",
                      }}
                    >
                      {WORKFLOW_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stageLabels[stage] || stage}
                        </option>
                      ))}
                    </select>
                    {updatingId === mapping.id && (
                      <Loader2 className="inline h-3 w-3 animate-spin ml-2 text-muted-foreground" />
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-5 py-3">
                    <span className="text-xs font-mono text-muted-foreground">
                      {mapping.statusCategory || "—"}
                    </span>
                  </td>

                  {/* Source */}
                  <td className="px-5 py-3">
                    {mapping.isAutoMapped ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Auto
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        <Check className="h-2.5 w-2.5" />
                        Reviewed
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleApply(mapping)}
                      disabled={applyingId === mapping.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                      title="Apply this mapping to all existing issues with this JIRA status"
                    >
                      {applyingId === mapping.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Apply result */}
      {applyResult && (
        <div className="px-5 py-3 border-t border-border/30">
          <p className="text-xs text-muted-foreground">{applyResult}</p>
        </div>
      )}
    </div>
  );
}
