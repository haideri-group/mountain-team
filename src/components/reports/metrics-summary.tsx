"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
  ExternalLink,
  X,
} from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";

interface MissedTask {
  id: string;
  jiraKey: string;
  title: string;
  status: string;
  assigneeName: string;
  boardKey: string;
  boardColor: string;
  dueDate: string | null;
  completedDate: string | null;
  daysLate: number;
}

interface MetricsSummaryProps {
  metrics: {
    tasksCompleted: number;
    tasksCompletedChange: number;
    avgCycleTime: number;
    avgCycleTimeChange: number;
    deadlinesMissed: number;
    deadlinesMissedPct: number;
    onTimePercentage: number;
    onTimeChange: number;
  };
  missedDeadlineTasks?: MissedTask[];
}

function ChangeIndicator({
  value,
  invert = false,
}: {
  value: number;
  invert?: boolean;
}) {
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;
  const abs = Math.abs(value);

  if (value === 0) {
    return (
      <span className="text-xs font-mono text-muted-foreground">No change</span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold font-mono ${
        isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : isNegative
            ? "text-red-600 dark:text-red-400"
            : "text-muted-foreground"
      }`}
    >
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {abs > 0 && abs < 1 ? abs.toFixed(1) : Math.round(abs)}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

export function MetricsSummary({ metrics, missedDeadlineTasks = [] }: MetricsSummaryProps) {
  const [showMissed, setShowMissed] = useState(false);

  const cards = [
    {
      key: "tasksCompleted" as const,
      label: "Tasks Completed",
      changeKey: "tasksCompletedChange" as const,
      icon: CheckCircle2,
      iconColor: "text-emerald-500",
      format: (v: number) => v.toLocaleString(),
      changeFormat: (v: number) => `${v > 0 ? "+" : ""}${v}% vs prev`,
      invertTrend: false,
      changeIsStatic: false,
      clickable: false,
    },
    {
      key: "avgCycleTime" as const,
      label: "Avg Cycle Time",
      changeKey: "avgCycleTimeChange" as const,
      icon: Clock,
      iconColor: "text-blue-500",
      format: (v: number) => `${v.toFixed(1)}d`,
      changeFormat: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}d vs prev`,
      invertTrend: true,
      changeIsStatic: false,
      clickable: false,
    },
    {
      key: "deadlinesMissed" as const,
      label: "Deadlines Missed",
      changeKey: "deadlinesMissedPct" as const,
      icon: AlertTriangle,
      iconColor: "text-red-500",
      format: (v: number) => v.toLocaleString(),
      changeFormat: (v: number) => `${v.toFixed(1)}% of total`,
      invertTrend: true,
      changeIsStatic: true,
      clickable: true,
    },
    {
      key: "onTimePercentage" as const,
      label: "On-Time Rate",
      changeKey: "onTimeChange" as const,
      icon: Target,
      iconColor: "text-primary",
      format: (v: number) => `${v.toFixed(1)}%`,
      changeFormat: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}pp vs prev`,
      invertTrend: false,
      changeIsStatic: false,
      clickable: false,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const value = metrics[card.key];
          const change = metrics[card.changeKey];

          return (
            <button
              key={card.key}
              type="button"
              onClick={card.clickable ? () => setShowMissed(true) : undefined}
              className={`bg-card rounded-xl p-5 flex flex-col gap-3 text-left transition-all ${
                card.clickable && value > 0
                  ? "cursor-pointer hover:ring-2 hover:ring-red-500/20 active:scale-[0.98]"
                  : "cursor-default"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </span>
                <div className={`p-1.5 rounded-lg bg-muted/40 ${card.iconColor}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>

              <span className="text-3xl font-bold font-mono tabular-nums leading-none">
                {card.format(value)}
              </span>

              <div className="flex items-center gap-1.5 min-h-[18px]">
                {card.changeIsStatic ? (
                  <span className="text-xs font-mono text-muted-foreground">
                    {card.changeFormat(change)}
                  </span>
                ) : (
                  <>
                    <ChangeIndicator value={change} invert={card.invertTrend} />
                    <span className="text-xs font-mono text-muted-foreground">vs prev</span>
                  </>
                )}
              </div>

              {card.clickable && value > 0 && (
                <span className="text-[10px] font-mono text-red-500/70 uppercase tracking-wider">
                  Click to view tasks
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Missed Deadline Tasks Slide-over */}
      {showMissed && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowMissed(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-card shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-6 py-5 shrink-0">
              <div>
                <h2 className="text-lg font-bold font-mono">Missed Deadlines</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {missedDeadlineTasks.length} tasks past their due date
                </p>
              </div>
              <button
                onClick={() => setShowMissed(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {missedDeadlineTasks.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No missed deadlines</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {missedDeadlineTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-xl bg-muted/15 p-4 space-y-2 hover:bg-muted/25 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <a
                            href={`/issue/${task.jiraKey}`}
                            className="text-xs font-bold font-mono hover:underline shrink-0"
                            style={{ color: task.boardColor }}
                          >
                            {task.jiraKey}
                          </a>
                          <IssueStatusBadge status={task.status} />
                        </div>
                        <span className="text-xs font-bold font-mono text-red-600 dark:text-red-400 whitespace-nowrap">
                          {task.daysLate}d late
                        </span>
                      </div>

                      <p className="text-sm text-foreground leading-relaxed">{task.title}</p>

                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                        <span>{task.assigneeName}</span>
                        <span>Due {formatDate(task.dueDate)}</span>
                        {task.completedDate ? (
                          <span>Done {formatDate(task.completedDate)}</span>
                        ) : (
                          <span className="text-red-500 font-semibold uppercase">Still open</span>
                        )}
                      </div>

                      <a
                        href={`${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/browse/${task.jiraKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold font-mono uppercase tracking-wider text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open in JIRA
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
