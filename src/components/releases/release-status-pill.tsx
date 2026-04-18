"use client";

import { cn } from "@/lib/utils";
import type { ReleaseStatus } from "./types";

const STATUS_CONFIG: Record<
  ReleaseStatus,
  { label: string; tone: string; dot: string; bg: string }
> = {
  on_track: {
    label: "On track",
    tone: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    bg: "bg-emerald-500/10",
  },
  at_risk: {
    label: "At risk",
    tone: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    bg: "bg-amber-500/10",
  },
  slipping: {
    label: "Slipping",
    tone: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    bg: "bg-red-500/10",
  },
  overdue: {
    label: "Overdue",
    tone: "text-slate-200",
    dot: "bg-slate-600",
    bg: "bg-slate-800",
  },
  released: {
    label: "Released",
    tone: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    bg: "bg-emerald-500/10",
  },
};

export function ReleaseStatusPill({
  status,
  size = "md",
}: {
  status: ReleaseStatus;
  size?: "sm" | "md";
}) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold font-mono uppercase tracking-wider",
        cfg.tone,
        cfg.bg,
        size === "sm" ? "text-[9px] px-2 py-0.5" : "text-[10px] px-2.5 py-1",
      )}
    >
      <span className={cn("rounded-full", cfg.dot, size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2")} />
      {cfg.label}
    </span>
  );
}

/** The traffic-light summary block shown at the top of the detail page — pill + the
 *  projected ship line + the one-line reason. PO-first; no numbers. */
export function ReleaseStatusSummary({
  status,
  reason,
  projectedShipDate,
  projectedDaysVsDue,
  dueDate,
  released,
}: {
  status: ReleaseStatus;
  reason: string;
  projectedShipDate: string | null;
  projectedDaysVsDue: number | null;
  dueDate: string | null;
  released: boolean;
}) {
  const shipLine = buildShipLine(projectedShipDate, projectedDaysVsDue, dueDate, released);
  return (
    <div className="flex flex-col gap-2">
      <ReleaseStatusPill status={status} />
      {shipLine && <p className="text-sm font-semibold text-foreground">{shipLine}</p>}
      <p className="text-[11px] text-muted-foreground">{reason}</p>
    </div>
  );
}

function buildShipLine(
  projected: string | null,
  deltaDays: number | null,
  dueDate: string | null,
  released: boolean,
): string | null {
  void dueDate; // kept in signature for future "X vs Y" UX
  if (released) return null;
  if (!projected) return null;

  const projectedFmt = formatDate(projected);
  if (deltaDays === null) return `Projected ship: ${projectedFmt}`;
  if (deltaDays === 0) return `Projected ship: ${projectedFmt} (on time)`;
  if (deltaDays > 0) return `Projected ship: ${projectedFmt} (${deltaDays}d late)`;
  return `Projected ship: ${projectedFmt} (${Math.abs(deltaDays)}d early)`;
}

function formatDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
