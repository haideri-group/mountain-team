"use client";

import { useState, useEffect } from "react";
import { ChartInfo } from "./chart-info";
import { X } from "lucide-react";
import Link from "next/link";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";

interface HeatmapMember {
  id: string;
  name: string;
}

interface HeatmapTask {
  jiraKey: string;
  title: string;
  type: string | null;
  storyPoints: number | null;
  completedDate: string | null;
  cycleTime: number | null;
  boardKey: string;
  boardColor: string;
}

interface HeatmapCell {
  member: string;
  memberId: string;
  month: string;
  count: number;
  level: "high" | "medium" | "low" | "minimal";
  tasks: HeatmapTask[];
}

interface DeveloperHeatmapProps {
  data: {
    members: HeatmapMember[];
    months: string[];
    cells: HeatmapCell[];
  };
}

function getCellColor(level: HeatmapCell["level"]): string {
  switch (level) {
    case "high":
      return "#ff8400";
    case "medium":
      return "rgba(245, 158, 11, 0.6)";
    case "low":
      return "rgba(59, 130, 246, 0.4)";
    case "minimal":
    default:
      return "var(--muted)";
  }
}

function getCellTextColor(level: HeatmapCell["level"]): string {
  switch (level) {
    case "high":
    case "medium":
      return "#ffffff";
    case "low":
      return "#1e3a8a";
    case "minimal":
    default:
      return "var(--muted-foreground)";
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DeveloperHeatmap({ data }: DeveloperHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    member: string;
    month: string;
    count: number;
  } | null>(null);

  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!selectedCell) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCell(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedCell]);

  if (!data || !data.members?.length || !data.months?.length) {
    return (
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Developer Activity Heatmap
          </h3>
          <ChartInfo chartId="heatmap" />
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  // Index cells by memberId+month for O(1) lookup
  const cellIndex = new Map<string, HeatmapCell>();
  for (const cell of data.cells) {
    cellIndex.set(`${cell.memberId}__${cell.month}`, cell);
  }

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Developer Activity Heatmap
          </h3>
          <ChartInfo chartId="heatmap" />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">Less</span>
          {(["minimal", "low", "medium", "high"] as const).map((level) => (
            <span
              key={level}
              className="h-4 w-4 rounded-sm"
              style={{ backgroundColor: getCellColor(level) }}
            />
          ))}
          <span className="text-xs font-mono text-muted-foreground">More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th className="text-left pb-2 pr-4 w-28">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Developer
                </span>
              </th>
              {data.months.map((month) => (
                <th key={month} className="pb-2 text-center">
                  <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                    {month}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.members.map((member) => (
              <tr key={member.id}>
                <td className="pr-4 py-1 text-xs font-mono text-muted-foreground truncate max-w-[112px]">
                  {member.name}
                </td>
                {data.months.map((month) => {
                  const cell = cellIndex.get(`${member.id}__${month}`);
                  const level = cell?.level ?? "minimal";
                  const count = cell?.count ?? 0;
                  const clickable = count > 0;

                  return (
                    <td key={month} className="py-1 px-0.5 text-center">
                      <div
                        className={`relative inline-flex items-center justify-center h-8 w-full min-w-[36px] rounded transition-transform hover:scale-110 ${clickable ? "cursor-pointer" : "cursor-default"}`}
                        style={{
                          backgroundColor: getCellColor(level),
                          color: getCellTextColor(level),
                        }}
                        onClick={() => {
                          if (clickable && cell) {
                            setSelectedCell(cell);
                            setTooltip(null);
                          }
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                            member: member.name,
                            month,
                            count,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span
                          className="text-[10px] font-bold font-mono tabular-nums leading-none"
                          style={{ color: getCellTextColor(level) }}
                        >
                          {count > 0 ? count : ""}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating tooltip */}
      {tooltip && !selectedCell && (
        <div
          className="fixed z-50 pointer-events-none bg-popover ring-1 ring-foreground/10 shadow-lg rounded-lg px-3 py-2 -translate-x-1/2 -translate-y-full"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <p className="text-xs font-bold font-mono whitespace-nowrap">
            {tooltip.member}
          </p>
          <p className="text-xs text-muted-foreground">
            {tooltip.month}:{" "}
            <span className="font-semibold text-foreground">
              {tooltip.count} task{tooltip.count !== 1 ? "s" : ""} completed
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Click to view tasks</p>
        </div>
      )}

      {/* Slide-over panel */}
      {selectedCell && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedCell(null)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-card shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 shrink-0">
              <div>
                <h2 className="text-lg font-bold font-mono">
                  {selectedCell.member}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedCell.count} task{selectedCell.count !== 1 ? "s" : ""} completed in {selectedCell.month}
                </p>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="p-2 rounded-lg hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
              {selectedCell.tasks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">No tasks found</p>
                </div>
              ) : (
                selectedCell.tasks.map((task) => (
                  <Link
                    key={task.jiraKey}
                    href={`/issue/${task.jiraKey}`}
                    className="block rounded-xl bg-muted/15 p-4 space-y-2 hover:bg-muted/25 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <IssueTypeIcon type={task.type} size={14} />
                        <span
                          className="text-xs font-bold font-mono"
                          style={{ color: task.boardColor }}
                        >
                          {task.jiraKey}
                        </span>
                        <IssueStatusBadge status="done" />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {task.storyPoints != null && (
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
                            {task.storyPoints}pt
                          </span>
                        )}
                        {task.cycleTime != null && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {task.cycleTime}d
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{task.title}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                      <span style={{ color: task.boardColor }}>{task.boardKey}</span>
                      <span>Completed {formatDate(task.completedDate)}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
