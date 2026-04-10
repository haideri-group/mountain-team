"use client";

import { Users, Layers, RefreshCw, AlertTriangle } from "lucide-react";

interface OverviewMetrics {
  teamMembers: number;
  activeIssues: number;
  inProgress: number;
  overdueTasks: number;
  overdueChange: number;
}

export function MetricsStrip({ metrics }: { metrics: OverviewMetrics }) {
  const cards = [
    {
      label: "Team Members",
      value: metrics.teamMembers,
      icon: Users,
      subtitle: "Active team size",
      color: "text-foreground",
    },
    {
      label: "Active Issues",
      value: metrics.activeIssues,
      icon: Layers,
      subtitle: "Across all boards",
      color: "text-foreground",
    },
    {
      label: "In Progress",
      value: metrics.inProgress,
      icon: RefreshCw,
      subtitle: "Currently being worked on",
      color: "text-foreground",
    },
    {
      label: "Overdue Tasks",
      value: metrics.overdueTasks,
      icon: AlertTriangle,
      subtitle:
        metrics.overdueChange > 0
          ? `+${metrics.overdueChange} from last week`
          : metrics.overdueChange < 0
            ? `${metrics.overdueChange} from last week`
            : "Compared to last week",
      color: metrics.overdueTasks > 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
      subtitleColor: metrics.overdueChange > 0 ? "text-red-500" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
              {card.label}
            </span>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className={`text-3xl font-bold font-mono ${card.color}`}>{card.value}</p>
          <p className={`text-xs mt-1 ${card.subtitleColor || "text-muted-foreground"}`}>
            {card.subtitle}
          </p>
        </div>
      ))}
    </div>
  );
}
