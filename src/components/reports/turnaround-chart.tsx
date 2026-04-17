"use client";

import { useState } from "react";
import { ChartInfo } from "./chart-info";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  ValueType,
  NameType,
} from "recharts/types/component/DefaultTooltipContent";
import { X, ExternalLink } from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";

interface TurnaroundTask {
  id: string;
  jiraKey: string;
  title: string;
  status: string;
  assigneeName: string;
  boardKey: string;
  boardColor: string;
  cycleTime: number | null;
  completedDate: string | null;
}

interface TurnaroundBucket {
  label: string;
  count: number;
  color: string;
  tasks?: TurnaroundTask[];
}

interface TurnaroundChartProps {
  data: TurnaroundBucket[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0] as (typeof payload)[0] & {
    payload: TurnaroundBucket;
  };
  return (
    <div className="bg-popover ring-1 ring-foreground/10 shadow-lg rounded-lg px-3 py-2">
      <p className="text-xs font-bold font-mono mb-1">{label}</p>
      <p className="text-xs text-muted-foreground">
        <span style={{ color: entry?.payload?.color }} className="font-semibold">
          Tasks:
        </span>{" "}
        {entry?.value}
      </p>
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        Click bar to view tasks
      </p>
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}

const axisStyle = {
  fontSize: 10,
  fontFamily: "var(--font-geist-mono)",
  fill: "var(--muted-foreground)",
};

export function TurnaroundChart({ data }: TurnaroundChartProps) {
  const [selectedBucket, setSelectedBucket] = useState<TurnaroundBucket | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Turnaround Distribution
          </h3>
          <ChartInfo chartId="turnaround" />
        </div>
        <div className="h-[260px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold font-mono uppercase tracking-wider">
              Turnaround Distribution
            </h3>
            <ChartInfo chartId="turnaround" />
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            click a bar to drill down
          </span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barCategoryGap="28%">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--muted)"
              strokeOpacity={0.3}
              vertical={false}
            />
            <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
            <Tooltip
              content={(props) => <CustomTooltip {...props} />}
              cursor={{ fill: "var(--muted)", fillOpacity: 0.2 }}
            />
            <Bar
              dataKey="count"
              name="Tasks"
              radius={[4, 4, 0, 0]}
              className="cursor-pointer"
              onClick={(_: unknown, index: number) => {
                if (data[index]?.tasks?.length) setSelectedBucket(data[index]);
              }}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Task List Slide-over */}
      {selectedBucket && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedBucket(null)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-card shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-6 py-5 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: selectedBucket.color }}
                  />
                  <h2 className="text-lg font-bold font-mono">
                    {selectedBucket.label}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedBucket.count} tasks completed in this time range
                </p>
              </div>
              <button
                onClick={() => setSelectedBucket(null)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <div className="space-y-2">
                {(selectedBucket.tasks || []).map((task) => (
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
                      {task.cycleTime != null && (
                        <span className="text-xs font-bold font-mono text-muted-foreground whitespace-nowrap">
                          {task.cycleTime < 1
                            ? `${Math.round(task.cycleTime * 24)}h`
                            : `${task.cycleTime.toFixed(1)}d`}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-foreground leading-relaxed">
                      {task.title}
                    </p>

                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                      <span>{task.assigneeName}</span>
                      {task.completedDate && (
                        <span>Done {formatDate(task.completedDate)}</span>
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
