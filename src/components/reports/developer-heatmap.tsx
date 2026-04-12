"use client";

import { useState } from "react";

interface HeatmapCell {
  member: string;
  month: string;
  count: number;
  level: "high" | "medium" | "low" | "minimal";
}

interface DeveloperHeatmapProps {
  data: {
    members: string[];
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
      return "#ffffff";
    case "medium":
      return "#ffffff";
    case "low":
      return "#1e3a8a";
    case "minimal":
    default:
      return "var(--muted-foreground)";
  }
}

export function DeveloperHeatmap({ data }: DeveloperHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    member: string;
    month: string;
    count: number;
  } | null>(null);

  if (!data || !data.members?.length || !data.months?.length) {
    return (
      <div className="bg-card rounded-xl p-6">
        <h3 className="text-base font-bold font-mono uppercase tracking-wider mb-4">
          Developer Activity Heatmap
        </h3>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  // Index cells by member+month for O(1) lookup
  const cellIndex = new Map<string, HeatmapCell>();
  for (const cell of data.cells) {
    cellIndex.set(`${cell.member}__${cell.month}`, cell);
  }

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-bold font-mono uppercase tracking-wider">
          Developer Activity Heatmap
        </h3>
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
              {/* Member label column header */}
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
              <tr key={member}>
                <td className="pr-4 py-1 text-xs font-mono text-muted-foreground truncate max-w-[112px]">
                  {member}
                </td>
                {data.months.map((month) => {
                  const cell = cellIndex.get(`${member}__${month}`);
                  const level = cell?.level ?? "minimal";
                  const count = cell?.count ?? 0;

                  return (
                    <td key={month} className="py-1 px-0.5 text-center">
                      <div
                        className="relative inline-flex items-center justify-center h-8 w-full min-w-[36px] rounded cursor-default transition-transform hover:scale-110"
                        style={{
                          backgroundColor: getCellColor(level),
                          color: getCellTextColor(level),
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                            member,
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

      {/* Floating tooltip — rendered via portal-like fixed positioning */}
      {tooltip && (
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
              {tooltip.count} tasks
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
