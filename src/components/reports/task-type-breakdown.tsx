"use client";

import { ChartInfo } from "./chart-info";

interface TaskType {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

interface TaskTypeBreakdownProps {
  data: TaskType[];
}

export function TaskTypeBreakdown({ data }: TaskTypeBreakdownProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Task Type Breakdown
          </h3>
          <ChartInfo chartId="taskTypes" />
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count));

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Task Type Breakdown
          </h3>
          <ChartInfo chartId="taskTypes" />
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {data.reduce((s, d) => s + d.count, 0)} total
        </span>
      </div>

      <div className="space-y-4">
        {data
          .sort((a, b) => b.count - a.count)
          .map((item) => (
            <div key={item.type} className="space-y-1.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs font-bold font-mono uppercase tracking-wider truncate">
                    {item.type}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold font-mono tabular-nums">
                    {item.count}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground w-9 text-right tabular-nums">
                    {item.percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${max > 0 ? (item.count / max) * 100 : 0}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
