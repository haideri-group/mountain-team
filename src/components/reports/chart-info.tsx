"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Info, X, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Guide Content ───────────────────────────────────────────────────────────

interface ChartGuide {
  title: string;
  description: string;
  bullets: string[];
  tip?: string;
}

const CHART_GUIDES: Record<string, ChartGuide> = {
  velocity: {
    title: "Velocity Trend",
    description:
      "Monthly task completion rate split by Production and Project boards.",
    bullets: [
      "Orange bars represent Production (PROD) tasks, blue bars represent Project board tasks.",
      "Higher bars indicate more tasks completed that month.",
      "Compare consecutive months to spot acceleration or slowdown in delivery.",
    ],
  },
  boardDistribution: {
    title: "Board Distribution",
    description:
      "Proportion of active tasks distributed across tracked JIRA boards.",
    bullets: [
      "Hover over a segment to see the exact task count for that board.",
      "A larger slice means more active work is concentrated on that board.",
      "Useful for spotting workload imbalance between projects.",
    ],
  },
  taskTypes: {
    title: "Task Type Breakdown",
    description:
      "Distribution of active tasks by type — Bug, Story, Task, and more.",
    bullets: [
      "A longer bar means more tasks of that type are currently active.",
      "The percentage shows each type's share of total active work.",
      "A high bug ratio may signal quality issues worth investigating.",
    ],
  },
  deadlines: {
    title: "Deadline Compliance",
    description:
      "How well the team meets due dates on tasks that have them set.",
    bullets: [
      "Green indicates tasks delivered on time. Red indicates missed deadlines.",
      "The breakdown shows how late missed tasks were — 1 day, 2-3 days, or 4+ days.",
      "Only counts tasks that have a due date assigned in JIRA.",
    ],
  },
  developerRanking: {
    title: "Developer Performance",
    description:
      "Ranks active developers by task completion and delivery metrics.",
    bullets: [
      "On-Time % shows the ratio of tasks completed before their due date.",
      "Avg Cycle Time is the average number of days from start to done.",
      "Trend arrow shows whether performance improved or declined vs the previous period.",
    ],
    tip: "Click any column header to sort the table by that metric.",
  },
  timeTracking: {
    title: "Team Time Tracking",
    description:
      "Hours logged by each developer from JIRA worklogs and Time Doctor (when configured).",
    bullets: [
      "Blue represents time logged against JIRA issues. Amber represents other tracked time.",
      "Toggle between This Week and This Month to change the time range.",
      "A warning icon next to a developer means they logged zero hours in the period.",
    ],
    tip: "Click a developer's name to view their full profile with detailed breakdown.",
  },
  weeklyPulse: {
    title: "Weekly Pulse",
    description:
      "Tasks created vs tasks completed each week over the last 6 weeks.",
    bullets: [
      "Orange bars show completed tasks. Blue bars show newly created tasks.",
      "When completed exceeds created, the team is reducing its backlog.",
      "When created exceeds completed, the backlog is growing — capacity may be strained.",
    ],
  },
  turnaround: {
    title: "Turnaround Distribution",
    description:
      "How long tasks take from start to completion, grouped into time buckets.",
    bullets: [
      "Each bar shows how many tasks were completed within that time range.",
      "Bars on the left (< 1 day, 1-3 days) indicate fast turnaround.",
      "An ideal distribution skews left — most tasks completed quickly.",
    ],
    tip: "Click a bar to see which specific tasks fall in that time range.",
  },
  cmsVsDev: {
    title: "CMS vs Development",
    description:
      "Monthly split between content management changes and development work.",
    bullets: [
      "Orange bars represent CMS/WebContent changes. Blue bars represent development tasks.",
      "Helps understand what share of team capacity goes to content vs feature work.",
      "A sustained imbalance may indicate a need for dedicated content resources.",
    ],
  },
  boardHealth: {
    title: "Board Health",
    description: "Live status snapshot of each tracked JIRA board.",
    bullets: [
      "Active = tasks currently in progress or queued. Blocked = tasks with the 'Blocked' label.",
      "Overdue = tasks past their due date that aren't done yet.",
      "A red highlight on the Overdue column signals that board needs attention.",
    ],
  },
  heatmap: {
    title: "Activity Heatmap",
    description:
      "Monthly task completion intensity for each developer across the period.",
    bullets: [
      "Darker cells indicate more tasks completed that month.",
      "Light or empty cells may indicate low output, time off, or a new joiner.",
      "Members are sorted by total completions — most active appear first.",
    ],
    tip: "Click any cell to see which tasks were completed that month.",
  },
  pendingReleases: {
    title: "Pending Releases",
    description:
      "Tasks that have been deployed to staging but are not yet in production.",
    bullets: [
      "Days Pending shows how long a task has been waiting for production release.",
      "Higher numbers may indicate a bottleneck or a forgotten deployment.",
      "Each row links to the full issue detail page for quick action.",
    ],
  },
  metricsSummary: {
    title: "Key Metrics",
    description:
      "Top-level KPIs summarizing team performance for the selected period.",
    bullets: [
      "Tasks Completed is the count of issues moved to Done status.",
      "Avg Cycle Time is the mean days from start to done across all completed tasks.",
      "The arrow and percentage show change compared to the previous equivalent period.",
    ],
    tip: "Click 'Deadlines Missed' to see the full list of overdue tasks.",
  },
};

// ─── Dialog Component ────────────────────────────────────────────────────────

function InfoDialog({
  guide,
  onClose,
}: {
  guide: ChartGuide;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus close button on mount, trap Escape
  useEffect(() => {
    closeRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop — click to dismiss */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={guide.title}
        className={cn(
          "relative z-10 w-[90vw] max-w-md",
          "bg-popover/95 backdrop-blur-xl rounded-xl",
          "ring-1 ring-foreground/10 shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
          "p-5 space-y-4",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
              {guide.title}
            </h3>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {guide.description}
        </p>

        {/* Bullets */}
        <div className="space-y-2.5">
          <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
            How to read this
          </p>
          <ul className="space-y-2">
            {guide.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-foreground/80 leading-relaxed">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        {/* Tip */}
        {guide.tip && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/8">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              {guide.tip}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── ChartInfo Button ────────────────────────────────────────────────────────

export type ChartId = keyof typeof CHART_GUIDES;

export function ChartInfo({ chartId }: { chartId: ChartId }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const guide = CHART_GUIDES[chartId];

  const handleClose = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        className="p-0.5 rounded-md hover:bg-muted/30 transition-colors text-muted-foreground/40 hover:text-muted-foreground"
        aria-label={`Info about ${guide.title}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <InfoDialog guide={guide} onClose={handleClose} />
      )}
    </>
  );
}
