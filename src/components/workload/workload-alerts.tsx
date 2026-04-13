"use client";

import Link from "next/link";
import { AlertTriangle, Flame, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkloadAlert {
  type: "over-capacity" | "idle" | "burnout-risk";
  memberId: string;
  memberName: string;
  avatarUrl: string | null;
  percentage: number;
  message: string;
}

interface WorkloadAlertsProps {
  alerts: WorkloadAlert[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function AlertRow({ alert }: { alert: WorkloadAlert }) {
  const isOver = alert.type === "over-capacity";
  const isBurnout = alert.type === "burnout-risk";
  const isIdle = alert.type === "idle";

  const borderClass = isOver
    ? "border-2 border-dashed border-red-500/30"
    : isBurnout
      ? "border-2 border-dashed border-orange-400/40"
      : "border-2 border-dashed border-muted-foreground/20";

  const iconBg = isOver
    ? "bg-red-100 dark:bg-red-950/40"
    : isBurnout
      ? "bg-orange-100 dark:bg-orange-950/40"
      : "bg-muted/40";

  const iconColor = isOver
    ? "text-red-600"
    : isBurnout
      ? "text-orange-500"
      : "text-muted-foreground";

  const badgeBg = isOver
    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
    : isBurnout
      ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
      : "bg-muted/50 text-muted-foreground";

  const Icon = isOver ? AlertTriangle : isBurnout ? Flame : Inbox;

  const label = isOver
    ? `${alert.memberName} is over capacity`
    : isBurnout
      ? `${alert.memberName} — burnout risk`
      : `${alert.memberName} has no tasks`;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-4 py-3 bg-card",
        borderClass,
      )}
    >
      {/* Type icon */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          iconBg,
        )}
      >
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>

      {/* Avatar */}
      <Link
        href={`/members/${alert.memberId}`}
        className="shrink-0 hover:opacity-80 transition-opacity"
        title={`View ${alert.memberName}'s profile`}
      >
        {alert.avatarUrl ? (
          <img
            src={alert.avatarUrl}
            alt={alert.memberName}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full object-cover ring-2 ring-background"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-[10px] font-bold font-mono text-muted-foreground ring-2 ring-background">
            {getInitials(alert.memberName)}
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight">
          {label}{" "}
          {isOver && (
            <span className={cn("font-bold font-mono", "text-red-600")}>
              ({alert.percentage}%)
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {alert.message}
        </p>
      </div>

      {/* Percentage badge (over-capacity + burnout) */}
      {!isIdle && (
        <span
          className={cn(
            "shrink-0 px-2.5 py-1 rounded-full text-xs font-bold font-mono",
            badgeBg,
          )}
        >
          {alert.percentage}%
        </span>
      )}

      {/* Idle badge */}
      {isIdle && (
        <span
          className={cn(
            "shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold",
            badgeBg,
          )}
        >
          Available
        </span>
      )}
    </div>
  );
}

export function WorkloadAlerts({ alerts }: WorkloadAlertsProps) {
  if (alerts.length === 0) return null;

  // Group by type for display order: over-capacity → burnout → idle
  const ordered = [
    ...alerts.filter((a) => a.type === "over-capacity"),
    ...alerts.filter((a) => a.type === "burnout-risk"),
    ...alerts.filter((a) => a.type === "idle"),
  ];

  return (
    <div className="bg-card rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
          Alerts
        </span>
        <div className="flex-1 h-px bg-muted/40" />
        <span className="text-[10px] font-mono text-muted-foreground">
          {ordered.length} {ordered.length === 1 ? "issue" : "issues"}
        </span>
      </div>
      <div className="space-y-2.5">
        {ordered.map((alert) => (
          <AlertRow key={`${alert.type}-${alert.memberId}`} alert={alert} />
        ))}
      </div>
    </div>
  );
}
