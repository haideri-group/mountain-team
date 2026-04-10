"use client";

import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  todo: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  in_review: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
  ready_for_testing: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  ready_for_live: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  ready_for_testing: "Ready for Testing",
  ready_for_live: "Ready for Live",
  done: "Done",
  closed: "Closed",
};

export function IssueStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono uppercase tracking-wide whitespace-nowrap",
        statusStyles[status] || statusStyles.todo,
      )}
    >
      {statusLabels[status] || status}
    </span>
  );
}
