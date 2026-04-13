"use client";

import { AlertTriangle, TrendingUp, CheckCircle2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkloadSummaryProps {
  summary: {
    teamAverage: number;
    overCapacityCount: number;
    highLoadCount: number;
    optimalCount: number;
    underLoadCount: number;
    idleCount: number;
    burnoutRiskCount: number;
    totalActivePoints: number;
    totalCapacity: number;
  };
}

function KpiCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl p-5 flex flex-col gap-2 min-w-0", className)}>
      {children}
    </div>
  );
}

function KpiLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

function KpiValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-3xl font-bold font-mono leading-none", className)}>
      {children}
    </span>
  );
}

function KpiSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs text-muted-foreground leading-tight">{children}</span>
  );
}

export function WorkloadSummary({ summary }: WorkloadSummaryProps) {
  const avgColor =
    summary.teamAverage > 100
      ? "text-red-600"
      : summary.teamAverage >= 80
        ? "text-orange-500"
        : summary.teamAverage >= 50
          ? "text-foreground"
          : "text-emerald-600";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Team Average */}
      <KpiCard className="lg:col-span-1">
        <KpiLabel>Team Average</KpiLabel>
        <KpiValue className={avgColor}>{summary.teamAverage}%</KpiValue>
        <KpiSubtitle>
          of {summary.totalCapacity} capacity
        </KpiSubtitle>
      </KpiCard>

      {/* Over Capacity */}
      <KpiCard>
        <KpiLabel>Over Capacity</KpiLabel>
        <div className="flex items-end gap-2">
          <KpiValue className={summary.overCapacityCount > 0 ? "text-red-600" : "text-foreground"}>
            {summary.overCapacityCount}
          </KpiValue>
          {summary.overCapacityCount > 0 && (
            <div className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            </div>
          )}
        </div>
        <KpiSubtitle>
          {summary.burnoutRiskCount > 0
            ? `${summary.burnoutRiskCount} burnout risk`
            : "members over limit"}
        </KpiSubtitle>
      </KpiCard>

      {/* High Load */}
      <KpiCard>
        <KpiLabel>High Load</KpiLabel>
        <div className="flex items-end gap-2">
          <KpiValue className={summary.highLoadCount > 0 ? "text-orange-500" : "text-foreground"}>
            {summary.highLoadCount}
          </KpiValue>
          {summary.highLoadCount > 0 && (
            <div className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40">
              <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
            </div>
          )}
        </div>
        <KpiSubtitle>80 – 100% loaded</KpiSubtitle>
      </KpiCard>

      {/* Optimal */}
      <KpiCard>
        <KpiLabel>Optimal</KpiLabel>
        <div className="flex items-end gap-2">
          <KpiValue className={summary.optimalCount > 0 ? "text-emerald-600" : "text-foreground"}>
            {summary.optimalCount}
          </KpiValue>
          {summary.optimalCount > 0 && (
            <div className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            </div>
          )}
        </div>
        <KpiSubtitle>50 – 79% loaded</KpiSubtitle>
      </KpiCard>

      {/* Under + Idle */}
      <KpiCard>
        <KpiLabel>Under / Idle</KpiLabel>
        <div className="flex items-end gap-2">
          <KpiValue className="text-muted-foreground">
            {summary.underLoadCount + summary.idleCount}
          </KpiValue>
          <div className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/40">
            <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
        <KpiSubtitle>
          {summary.underLoadCount} under + {summary.idleCount} idle
        </KpiSubtitle>
      </KpiCard>
    </div>
  );
}
