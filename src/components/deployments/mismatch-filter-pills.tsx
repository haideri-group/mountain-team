"use client";

import { AlertTriangle, ChevronsRight, Split, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mismatch } from "./types";

type TypeConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeBg: string;
  activeText: string;
  activeRing: string;
  activeDot: string;
  countActiveBg: string;
};

const TYPE_CONFIG: Record<Mismatch["type"], TypeConfig> = {
  production_not_updated: {
    label: "Status not updated",
    icon: AlertTriangle,
    activeBg: "bg-red-500/10",
    activeText: "text-red-700 dark:text-red-400",
    activeRing: "ring-1 ring-red-500/25",
    activeDot: "bg-red-500",
    countActiveBg: "bg-red-500/20 text-red-700 dark:text-red-300",
  },
  staging_status_behind: {
    label: "Staging ahead of status",
    icon: ChevronsRight,
    activeBg: "bg-sky-500/10",
    activeText: "text-sky-700 dark:text-sky-400",
    activeRing: "ring-1 ring-sky-500/25",
    activeDot: "bg-sky-500",
    countActiveBg: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  },
  partial_rollout: {
    label: "Partial rollout",
    icon: Split,
    activeBg: "bg-amber-500/10",
    activeText: "text-amber-700 dark:text-amber-400",
    activeRing: "ring-1 ring-amber-500/25",
    activeDot: "bg-amber-500",
    countActiveBg: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  },
  closed_but_deployed: {
    label: "Cancelled task shipped",
    icon: XCircle,
    activeBg: "bg-rose-500/10",
    activeText: "text-rose-700 dark:text-rose-400",
    activeRing: "ring-1 ring-rose-500/30",
    activeDot: "bg-rose-500",
    countActiveBg: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  },
};

const ORDER: Mismatch["type"][] = [
  "production_not_updated",
  "staging_status_behind",
  "partial_rollout",
  "closed_but_deployed",
];

interface Props {
  counts: Map<Mismatch["type"], number>;
  hiddenTypes: Set<Mismatch["type"]>;
  onToggle: (type: Mismatch["type"]) => void;
  onReset: () => void;
}

export function MismatchFilterPills({ counts, hiddenTypes, onToggle, onReset }: Props) {
  const visibleTypes = ORDER
    .map((type) => ({ type, count: counts.get(type) ?? 0 }))
    .filter((entry) => entry.count > 0);
  if (visibleTypes.length <= 1) return null;

  const hasHidden = hiddenTypes.size > 0;

  return (
    <div
      role="group"
      aria-label="Filter alerts by type"
      className="flex items-center gap-1.5 flex-wrap mb-3"
    >
      {visibleTypes.map(({ type, count }) => {
        const cfg = TYPE_CONFIG[type];
        const isActive = !hiddenTypes.has(type);
        const Icon = cfg.icon;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(type)}
            className={cn(
              "group inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-full",
              "text-[10px] font-bold font-mono uppercase tracking-wider",
              "transition-all duration-150 cursor-pointer select-none",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive
                ? cn(cfg.activeBg, cfg.activeText, cfg.activeRing, "hover:brightness-[0.97] dark:hover:brightness-110")
                : "bg-muted/20 text-muted-foreground/60 ring-1 ring-transparent hover:bg-muted/40 hover:text-muted-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-3 w-3 shrink-0 transition-opacity",
                !isActive && "opacity-40",
              )}
            />
            <span
              className={cn(
                "transition-all",
                !isActive && "line-through decoration-1 decoration-muted-foreground/40",
              )}
            >
              {cfg.label}
            </span>
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold tabular-nums transition-colors",
                isActive
                  ? cfg.countActiveBg
                  : "bg-muted/40 text-muted-foreground/70",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
      {hasHidden && (
        <button
          type="button"
          onClick={onReset}
          className="ml-1 h-7 px-2 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Show all
        </button>
      )}
    </div>
  );
}
