/**
 * Central registry of guide content used by info modals across the app.
 *
 * A guide describes a single UI element (a chart, a score, a section)
 * and shows up behind an ⓘ button. The registry is plain data — no React
 * imports — so it can be used from either server or client components.
 *
 * Used by:
 *   - <ChartInfo chartId="…" /> in components/reports/*
 *   - <InfoButton guideKey="…" /> in components/releases/* (and anywhere else)
 */

export interface Guide {
  title: string;
  description: string;
  bullets: string[];
  tip?: string;
}

export const GUIDES = {
  // ─── /reports charts ────────────────────────────────────────────────
  velocity: {
    title: "Velocity Trend",
    description: "Monthly task completion rate split by Production and Project boards.",
    bullets: [
      "Orange bars represent Production (PROD) tasks, blue bars represent Project board tasks.",
      "Higher bars indicate more tasks completed that month.",
      "Compare consecutive months to spot acceleration or slowdown in delivery.",
    ],
  },
  boardDistribution: {
    title: "Board Distribution",
    description: "Proportion of active tasks distributed across tracked JIRA boards.",
    bullets: [
      "Hover over a segment to see the exact task count for that board.",
      "A larger slice means more active work is concentrated on that board.",
      "Useful for spotting workload imbalance between projects.",
    ],
  },
  taskTypes: {
    title: "Task Type Breakdown",
    description: "Distribution of active tasks by type — Bug, Story, Task, and more.",
    bullets: [
      "A longer bar means more tasks of that type are currently active.",
      "The percentage shows each type's share of total active work.",
      "A high bug ratio may signal quality issues worth investigating.",
    ],
  },
  deadlines: {
    title: "Deadline Compliance",
    description: "How well the team meets due dates on tasks that have them set.",
    bullets: [
      "Green indicates tasks delivered on time. Red indicates missed deadlines.",
      "The breakdown shows how late missed tasks were — 1 day, 2-3 days, or 4+ days.",
      "Only counts tasks that have a due date assigned in JIRA.",
    ],
  },
  developerRanking: {
    title: "Developer Performance",
    description: "Ranks active developers by task completion and delivery metrics.",
    bullets: [
      "On-Time % shows the ratio of tasks completed before their due date.",
      "Avg Cycle Time is the average number of days from start to done.",
      "Trend arrow shows whether performance improved or declined vs the previous period.",
    ],
    tip: "Click any column header to sort the table by that metric.",
  },
  timeTracking: {
    title: "Team Time Tracking",
    description: "Hours logged by each developer from JIRA worklogs and Time Doctor (when configured).",
    bullets: [
      "Orange bars represent time logged against JIRA issues. Amber represents other tracked time (when Time Doctor is configured).",
      "Toggle between This Week and This Month to change the time range.",
      "A warning icon next to a developer means they logged zero hours in the period.",
    ],
    tip: "Click a developer's name to view their full profile with detailed breakdown.",
  },
  weeklyPulse: {
    title: "Weekly Pulse",
    description: "Tasks created vs tasks completed each week over the last 6 weeks.",
    bullets: [
      "Orange bars show completed tasks. Blue bars show newly created tasks.",
      "When completed exceeds created, the team is reducing its backlog.",
      "When created exceeds completed, the backlog is growing — capacity may be strained.",
    ],
  },
  turnaround: {
    title: "Turnaround Distribution",
    description: "How long tasks take from start to completion, grouped into time buckets.",
    bullets: [
      "Each bar shows how many tasks were completed within that time range.",
      "Bars on the left (< 1 day, 1-3 days) indicate fast turnaround.",
      "An ideal distribution skews left — most tasks completed quickly.",
    ],
    tip: "Click a bar to see which specific tasks fall in that time range.",
  },
  cmsVsDev: {
    title: "CMS vs Development",
    description: "Monthly split between content management changes and development work.",
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
    description: "Monthly task completion intensity for each developer across the period.",
    bullets: [
      "Darker cells indicate more tasks completed that month.",
      "Light or empty cells may indicate low output, time off, or a new joiner.",
      "Members are sorted by total completions — most active appear first.",
    ],
    tip: "Click any cell to see which tasks were completed that month.",
  },
  pendingReleases: {
    title: "Pending Releases",
    description: "Tasks that have been deployed to staging but are not yet in production.",
    bullets: [
      "Days Pending shows how long a task has been waiting for production release.",
      "Higher numbers may indicate a bottleneck or a forgotten deployment.",
      "Each row links to the full issue detail page for quick action.",
    ],
  },
  metricsSummary: {
    title: "Key Metrics",
    description: "Top-level KPIs summarizing team performance for the selected period.",
    bullets: [
      "Tasks Completed is the count of issues moved to Done status.",
      "Avg Cycle Time is the mean days from start to done across all completed tasks.",
      "The arrow and percentage show change compared to the previous equivalent period.",
    ],
    tip: "Click 'Deadlines Missed' to see the full list of overdue tasks.",
  },

  // ─── /releases guides ───────────────────────────────────────────────
  releaseReadiness: {
    title: "Readiness score",
    description:
      "A 0–100 number summarising how ready this release is to ship, based on issue status, schedule, and scope stability.",
    bullets: [
      "Starts at 100 and drops when issues are not done, overdue, or stuck.",
      "Each todo counts more than each in-progress task — the further from done, the bigger the hit.",
      "Scope creep (issues added more than a day after the release started) subtracts points.",
      "Stale in-progress tasks (> 3 days without status change) subtract points.",
      "Staging coverage above 80% before the due date adds a small bonus.",
    ],
    tip: "The score is a summary. The status pill and projected ship date above are the actionable signals.",
  },
  releaseBurndown: {
    title: "Release burndown",
    description:
      "Daily snapshot of how many issues are done, in progress, and to-do. Shows momentum toward the release date.",
    bullets: [
      "Each point is one day. Newer data points appear on the right.",
      "A healthy burndown has the Done line rising and the To-do line falling together.",
      "A flat Done line for several days is a stall signal — work is happening but nothing is finishing.",
    ],
    tip: "Snapshots populate once per day via the issue sync; a freshly created release will look empty until tomorrow.",
  },
  releaseVelocity: {
    title: "Release velocity",
    description: "How many releases shipped to production each week over the last 12 weeks.",
    bullets: [
      "One bar per week. Taller bar = more releases crossed the finish line that week.",
      "Good for spotting cadence regressions: is the team still shipping weekly?",
      "A release counts once — the week it was marked released in JIRA.",
    ],
  },
  scopeCreep: {
    title: "Scope changes",
    description: "Every issue added or removed from this release after it started, ordered by date.",
    bullets: [
      "Issues added more than a day after release creation are flagged as scope creep.",
      "Issues soft-removed are still listed — hover the timestamp to see when.",
      "Repeated late additions are a warning sign that the release boundary isn't holding.",
    ],
  },
  releaseHealth: {
    title: "Release health",
    description: "Three KPIs answering: are we shipping on time, consistently, without surprises?",
    bullets: [
      "On-time % — share of releases in the last 90 days that shipped on or before their due date.",
      "Avg days late — average slip for the releases that missed their date.",
      "Scope-creep rate — average number of late additions per release.",
    ],
  },
  releaseNotes: {
    title: "Release notes",
    description:
      "Auto-generated changelog for this release — a dev-facing version with JIRA keys and a customer-facing version in plain English.",
    bullets: [
      "Dev view groups issues by type (Features / Fixes / Improvements / Content / Other) and keeps JIRA keys + assignees.",
      "Customer view hides JIRA keys and subtasks, cleans up titles (strips prefixes like 'FE: '), and uses friendlier headings.",
      "Copy to clipboard or download as markdown.",
    ],
    tip: "Hand-edit the downloaded markdown before publishing — auto-generated titles can be terse.",
  },
  releaseChecklist: {
    title: "Pre-release checklist",
    description: "A per-release list of steps that need to happen before shipping. Admin-editable labels, anyone can tick them off.",
    bullets: [
      "Default items are seeded the first time you open a release — customise them freely.",
      "Once checked, the item records who ticked it and when.",
      "Re-ordering and adding custom items are admin-only actions.",
    ],
  },
} satisfies Record<string, Guide>;

export type GuideKey = keyof typeof GUIDES;
