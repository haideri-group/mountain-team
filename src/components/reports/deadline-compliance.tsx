"use client";

import { CheckCircle2, XCircle } from "lucide-react";

interface DeadlineComplianceProps {
  data: {
    met: number;
    missed: number;
    breakdown: { label: string; count: number }[];
  };
}

export function DeadlineCompliance({ data }: DeadlineComplianceProps) {
  if (!data) {
    return (
      <div className="bg-card rounded-xl p-6">
        <h3 className="text-base font-bold font-mono uppercase tracking-wider mb-4">
          Deadline Compliance
        </h3>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  const total = (data.met ?? 0) + (data.missed ?? 0);
  const metPct = total > 0 ? ((data.met / total) * 100).toFixed(1) : "0.0";
  const missedPct = total > 0 ? ((data.missed / total) * 100).toFixed(1) : "0.0";
  const maxBreakdown = Math.max(...(data.breakdown?.map((b) => b.count) ?? [1]), 1);

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-bold font-mono uppercase tracking-wider">
          Deadline Compliance
        </h3>
        <span className="text-xs font-mono text-muted-foreground">
          {total} total
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-muted/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
              Met
            </span>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{data.met ?? 0}</p>
          <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
            {metPct}%
          </p>
        </div>

        <div className="bg-muted/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
              Missed
            </span>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums">{data.missed ?? 0}</p>
          <p className="text-xs font-mono text-red-600 dark:text-red-400 font-semibold mt-0.5">
            {missedPct}%
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${metPct}%` }}
        />
      </div>

      {/* Breakdown */}
      {data.breakdown && data.breakdown.length > 0 && (
        <div>
          <p className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground mb-3">
            Missed Breakdown
          </p>
          <div className="space-y-2.5">
            {data.breakdown.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="text-xs font-bold font-mono tabular-nums">
                    {item.count}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-400 transition-all duration-500"
                    style={{
                      width: `${(item.count / maxBreakdown) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
