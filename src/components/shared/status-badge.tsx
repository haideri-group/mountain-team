"use client";

import { cn } from "@/lib/utils";

const statusStyles = {
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  on_leave: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  departed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const statusLabels = {
  active: "Active",
  on_leave: "On Leave",
  departed: "Departed",
};

export function StatusBadge({ status }: { status: "active" | "on_leave" | "departed" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono uppercase tracking-wide",
        statusStyles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
