import type { JiraIssueRaw, CustomFieldIds } from "./issues";

// --- App Enum Values ---

type IssueStatus = "todo" | "on_hold" | "in_progress" | "in_review" | "ready_for_testing" | "ready_for_live" | "done" | "closed";
type IssuePriority = "highest" | "high" | "medium" | "low" | "lowest";
type IssueType = "bug" | "story" | "cms_change" | "enhancement" | "task" | "subtask";

// --- Status Mapping ---

const STATUS_MAP: Record<string, IssueStatus> = {
  "to do": "todo",
  "backlog": "todo",
  "open": "todo",
  "new": "todo",
  "selected for development": "todo",
  "on hold": "on_hold",
  "triage": "on_hold",
  "awaiting triage": "on_hold",
  "pending": "on_hold",
  "blocked": "on_hold",
  "in progress": "in_progress",
  "in development": "in_progress",
  "in review": "in_review",
  "code review": "in_review",
  "peer review": "in_review",
  "ready for testing": "ready_for_testing",
  "in testing": "ready_for_testing",
  "qa": "ready_for_testing",
  "ready for qa": "ready_for_testing",
  "ready for live": "ready_for_live",
  "ready for deployment": "ready_for_live",
  "ready for release": "ready_for_live",
  "ready for deploy": "ready_for_live",
  "done": "done",
  "resolved": "done",
  "closed": "closed",
  "cancelled": "closed",
  "canceled": "closed",
  "won't do": "closed",
  "rejected": "closed",
  "declined": "closed",
};

const CATEGORY_FALLBACK: Record<string, IssueStatus> = {
  new: "todo",
  indeterminate: "in_progress",
  done: "done",
};

function mapStatus(status: { name: string; statusCategory: { key: string } }): IssueStatus {
  const mapped = STATUS_MAP[status.name.toLowerCase()];
  if (mapped) return mapped;

  const fallback = CATEGORY_FALLBACK[status.statusCategory.key];
  if (fallback) return fallback;

  return "todo";
}

// --- Priority Mapping ---

const PRIORITY_MAP: Record<string, IssuePriority> = {
  highest: "highest",
  critical: "highest",
  blocker: "highest",
  high: "high",
  major: "high",
  medium: "medium",
  normal: "medium",
  low: "low",
  minor: "low",
  lowest: "lowest",
  trivial: "lowest",
};

function mapPriority(priority: { name: string } | null | undefined): IssuePriority | null {
  if (!priority?.name) return null;
  return PRIORITY_MAP[priority.name.toLowerCase()] || null;
}

// --- Type Mapping ---

const TYPE_MAP: Record<string, IssueType> = {
  bug: "bug",
  story: "story",
  "user story": "story",
  "cms change": "cms_change",
  "cms_change": "cms_change",
  enhancement: "enhancement",
  improvement: "enhancement",
  "new feature": "enhancement",
  task: "task",
  "sub-task": "subtask",
  subtask: "subtask",
  "sub task": "subtask",
  epic: "story",
};

function mapType(issuetype: { name: string } | null | undefined): IssueType | null {
  if (!issuetype?.name) return null;
  return TYPE_MAP[issuetype.name.toLowerCase()] || null;
}

// --- Cycle Time ---

export function calculateCycleTime(
  startDate: string | null,
  completedDate: string | null,
): number | null {
  if (!startDate || !completedDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(completedDate).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return null;
  return Math.round(((end - start) / (1000 * 60 * 60 * 24)) * 10) / 10;
}

// --- Normalized Output ---

export interface NormalizedIssue {
  jiraKey: string;
  projectKey: string;
  assigneeAccountId: string | null;
  title: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  type: IssueType | null;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  cycleTime: number | null;
  storyPoints: number | null;
  labels: string;
  requestPriority: string | null;
  description: string | null;
  website: string | null;
  brands: string | null;
  jiraCreatedAt: string | null;
  jiraUpdatedAt: string | null;
}

// --- Main Normalizer ---

export function normalizeIssue(
  raw: JiraIssueRaw,
  customFields: CustomFieldIds,
): NormalizedIssue {
  const status = mapStatus(raw.fields.status);

  // Extract start date from custom field
  let startDate: string | null = null;
  if (customFields.startDate) {
    const val = raw.fields[customFields.startDate];
    if (typeof val === "string") {
      startDate = val.split("T")[0]; // normalize to YYYY-MM-DD
    }
  }

  // Extract due date
  const dueDate = raw.fields.duedate
    ? raw.fields.duedate.split("T")[0]
    : null;

  // Extract completed date for done/closed issues
  // Priority: resolutiondate → statuscategorychangedate → updated
  // statuscategorychangedate is the exact moment the status category changed to "Done"
  // (kanban boards often skip resolutiondate but always have statuscategorychangedate)
  let completedDate: string | null = null;
  if (status === "done" || status === "closed") {
    const statusCategoryChangeDate = raw.fields.statuscategorychangedate as string | undefined;
    if (raw.fields.resolutiondate) {
      completedDate = raw.fields.resolutiondate;
    } else if (statusCategoryChangeDate) {
      completedDate = statusCategoryChangeDate;
    } else if (raw.fields.updated) {
      completedDate = raw.fields.updated;
    }
  }

  // Extract story points from custom field
  let storyPoints: number | null = null;
  if (customFields.storyPoints) {
    const val = raw.fields[customFields.storyPoints];
    if (typeof val === "number") {
      storyPoints = val;
    }
  }

  return {
    jiraKey: raw.key,
    projectKey: raw.fields.project.key,
    assigneeAccountId: raw.fields.assignee?.accountId ?? null,
    title: raw.fields.summary,
    status,
    priority: mapPriority(raw.fields.priority),
    type: mapType(raw.fields.issuetype),
    startDate,
    dueDate,
    completedDate,
    cycleTime: calculateCycleTime(startDate, completedDate),
    storyPoints,
    labels: JSON.stringify(raw.fields.labels || []),
    description: raw.renderedFields?.description || null,
    requestPriority: (raw.fields.customfield_10795 as { value?: string } | null)?.value || null,
    website: extractFieldValue(raw.fields.customfield_10734),
    brands: extractFieldValue(raw.fields.customfield_10805),
    jiraCreatedAt: raw.fields.created || null,
    jiraUpdatedAt: raw.fields.updated || null,
  };
}

function extractFieldValue(field: unknown): string | null {
  if (!field) return null;
  if (typeof field === "string") return field;
  if (Array.isArray(field)) {
    return field.map((v: { value?: string; name?: string }) => v.value || v.name || String(v)).join(", ");
  }
  if (typeof field === "object" && field !== null && "value" in field) {
    return (field as { value: string }).value;
  }
  return null;
}
