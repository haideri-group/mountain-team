"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

interface StatsStripProps {
  stats: {
    totalTasks: number;
    onTimePercentage: number;
    avgCycleTime: number;
    activePoints: number;
    deadlinesMet: number;
    deadlinesTotal: number;
    tenure: string | null;
  };
  isDeparted: boolean;
}

export function StatsStrip({ stats, isDeparted }: StatsStripProps) {
  const cards = isDeparted
    ? [
        {
          label: "Total Tasks",
          value: stats.totalTasks.toString(),
        },
        {
          label: "On-Time Delivery",
          value: `${stats.onTimePercentage}%`,
          color:
            stats.onTimePercentage >= 85
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          icon:
            stats.onTimePercentage >= 85 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-amber-500" />
            ),
        },
        {
          label: "Avg Cycle Time",
          value: `${stats.avgCycleTime}d`,
        },
        {
          label: "Tenure",
          value: stats.tenure || "—",
        },
      ]
    : [
        {
          label: "Total Tasks",
          value: stats.totalTasks.toString(),
        },
        {
          label: "On-Time Delivery",
          value: `${stats.onTimePercentage}%`,
          color:
            stats.onTimePercentage >= 85
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          icon:
            stats.onTimePercentage >= 85 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-amber-500" />
            ),
        },
        {
          label: "Avg Cycle Time",
          value: `${stats.avgCycleTime}d`,
        },
        {
          label: "Active Points",
          value: `${stats.activePoints} pts`,
          color: "text-primary",
        },
        {
          label: "Deadlines Met",
          value: `${stats.deadlinesMet} / ${stats.deadlinesTotal}`,
        },
      ];

  return (
    <div
      className={`grid gap-4 ${isDeparted ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-5"}`}
    >
      {cards.map((card) => (
        <div key={card.label} className="bg-card rounded-xl p-5">
          <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">
            {card.label}
          </p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold font-mono ${card.color || ""}`}>
              {card.value}
            </p>
            {card.icon}
          </div>
        </div>
      ))}
    </div>
  );
}
