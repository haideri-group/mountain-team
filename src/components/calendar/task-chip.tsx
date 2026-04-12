"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ExternalLink, X } from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { cn } from "@/lib/utils";

interface TaskChipEvent {
  id: string;
  issueKey: string;
  title: string;
  assigneeName: string;
  assigneeInitials: string;
  boardKey: string;
  boardColor: string;
  status: string;
  priority: string | null;
  type: string | null;
  startDate: string;
  endDate: string;
  isOverdue: boolean;
}

interface TaskChipProps {
  event: TaskChipEvent;
}

const priorityStyles: Record<string, string> = {
  highest: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  low: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400",
  lowest: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const typeLabels: Record<string, string> = {
  bug: "Bug",
  story: "Story",
  task: "Task",
  enhancement: "Enhancement",
  cms_change: "CMS Change",
};

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TaskChip({ event }: TaskChipProps) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; align: "left" | "right" }>({
    top: 0,
    left: 0,
    align: "left",
  });
  const chipRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const openPopover = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!chipRef.current) return;

    const rect = chipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const popoverWidth = 280;
    const spaceRight = viewportWidth - rect.left;
    const align = spaceRight < popoverWidth + 16 ? "right" : "left";

    setPopoverPos({
      top: rect.bottom + window.scrollY + 6,
      left: align === "left" ? rect.left + window.scrollX : rect.right + window.scrollX - popoverWidth,
      align,
    });
    setOpen(true);
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        chipRef.current &&
        !chipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const isDone = event.status === "done";
  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL || "";
  const jiraUrl = `${jiraBaseUrl}/browse/${event.issueKey}`;

  return (
    <>
      <button
        ref={chipRef}
        onClick={openPopover}
        className={cn(
          "w-full text-left flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-mono",
          "border-l-2 truncate transition-colors select-none",
          "hover:brightness-95 dark:hover:brightness-110",
          event.isOverdue
            ? "bg-red-50 dark:bg-red-950/20 border-l-destructive"
            : isDone
              ? "bg-emerald-50 dark:bg-emerald-950/20 border-l-emerald-500 opacity-50"
              : "bg-muted/20 dark:bg-muted/10",
        )}
        style={
          !event.isOverdue && !isDone
            ? { borderLeftColor: event.boardColor }
            : undefined
        }
        title={`${event.issueKey} — ${event.title}`}
      >
        <span className="font-semibold shrink-0 opacity-70">{event.assigneeInitials}</span>
        <span className="text-muted-foreground mx-0.5">·</span>
        <span
          className="font-bold shrink-0"
          style={{ color: event.boardColor }}
        >
          {event.issueKey}
        </span>
      </button>

      {/* Portal-style fixed popover */}
      {open && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-[280px] bg-popover ring-1 ring-foreground/10 shadow-xl rounded-xl overflow-hidden"
          style={{
            top: popoverPos.top,
            left: popoverPos.left,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Popover header */}
          <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <a
                href={`/issue/${event.issueKey}`}
                className="text-xs font-bold font-mono hover:underline shrink-0"
                style={{ color: event.boardColor }}
                onClick={(e) => e.stopPropagation()}
              >
                {event.issueKey}
              </a>
              <IssueStatusBadge status={event.status} />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="shrink-0 p-0.5 rounded hover:bg-muted/50 transition-colors mt-0.5"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          {/* Title */}
          <div className="px-4 pb-3">
            <p className="text-sm text-foreground leading-snug">{event.title}</p>
          </div>

          {/* Meta row */}
          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
            {/* Assignee */}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-[10px] font-mono text-foreground">
              <span className="inline-flex h-4 w-4 rounded-full bg-primary/20 text-primary items-center justify-center text-[8px] font-bold shrink-0">
                {event.assigneeInitials || "?"}
              </span>
              {event.assigneeName}
            </span>

            {/* Priority */}
            {event.priority && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wide",
                  priorityStyles[event.priority] || priorityStyles.medium,
                )}
              >
                {event.priority}
              </span>
            )}

            {/* Type */}
            {event.type && (
              <span className="px-2 py-0.5 rounded-full bg-muted/30 text-[10px] font-mono text-muted-foreground uppercase tracking-wide">
                {typeLabels[event.type] || event.type}
              </span>
            )}
          </div>

          {/* Due date */}
          {event.endDate && (
            <div className="px-4 pb-3">
              <p
                className={cn(
                  "text-[11px] font-mono",
                  event.isOverdue ? "text-destructive font-semibold" : "text-muted-foreground",
                )}
              >
                {event.isOverdue ? "Overdue — " : "Due "}
                {formatDisplayDate(event.endDate)}
              </p>
            </div>
          )}

          {/* CTA footer */}
          <div className="px-4 pb-3.5">
            <a
              href={jiraUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold font-mono uppercase tracking-wide text-white transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #944a00, #ff8400)",
              }}
            >
              <ExternalLink className="h-3 w-3" />
              Open in JIRA
            </a>
          </div>
        </div>
      )}
    </>
  );
}
