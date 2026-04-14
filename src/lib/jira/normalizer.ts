import type { JiraIssueRaw, CustomFieldIds } from "./issues";
import { db } from "@/lib/db";
import { statusMappings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// --- App Enum Values ---

type IssueStatus = "todo" | "on_hold" | "in_progress" | "in_review" | "ready_for_testing" | "ready_for_live" | "rolling_out" | "post_live_testing" | "done" | "closed";
type IssuePriority = "highest" | "high" | "medium" | "low" | "lowest";
type IssueType = "bug" | "story" | "cms_change" | "enhancement" | "task" | "subtask";

// --- Status Mapping (Code-level defaults, overridden by DB) ---

const STATUS_MAP: Record<string, IssueStatus> = {
  "to do": "todo",
  "backlog": "todo",
  "open": "todo",
  "new": "todo",
  "selected for development": "todo",
  "reopened": "todo",
  "reopend": "todo",
  "re opened": "todo",
  "reopen": "todo",
  "on hold": "on_hold",
  "triage": "on_hold",
  "awaiting triage": "on_hold",
  "pending": "on_hold",
  "blocked": "on_hold",
  "merge conflict": "on_hold",
  "in progress": "in_progress",
  "in development": "in_progress",
  "inprogress": "in_progress",
  "in review": "in_review",
  "code review": "in_review",
  "code reveiw": "in_review",
  "peer review": "in_review",
  "developed": "in_review",
  "ready for testing": "ready_for_testing",
  "ready for testin": "ready_for_testing",
  "ready for end to end test": "ready_for_testing",
  "ready for end to end testing": "ready_for_testing",
  "in testing": "ready_for_testing",
  "testing": "ready_for_testing",
  "testing phase": "ready_for_testing",
  "qa": "ready_for_testing",
  "qa tes": "ready_for_testing",
  "ready for qa": "ready_for_testing",
  "user acceptance testing": "ready_for_testing",
  "test complete pending bugs": "ready_for_testing",
  "ready for live": "ready_for_live",
  "ready for deployment": "ready_for_live",
  "ready for release": "ready_for_live",
  "ready for deploy": "ready_for_live",
  "ready to deploy": "ready_for_live",
  "ready for production": "ready_for_live",
  "ready for delivery": "ready_for_live",
  "published live": "ready_for_live",
  "rolling out": "rolling_out",
  "deploying": "rolling_out",
  "deployment in progress": "rolling_out",
  "scheduled for deployment": "rolling_out",
  "post live testing": "post_live_testing",
  "post-live testing": "post_live_testing",
  "postlive testing": "post_live_testing",
  "post live": "post_live_testing",
  "plt": "post_live_testing",
  "hypercare": "post_live_testing",
  "done": "done",
  "resolved": "done",
  "complete": "done",
  "ticket completed": "done",
  "launched": "done",
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

// --- DB-Cached Status Mapping ---

let _mappingCache: Map<string, { workflowStage: IssueStatus }> | null = null;
let _cacheLoadedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function loadStatusMappingCache(): Promise<void> {
  const rows = await db.select().from(statusMappings);
  _mappingCache = new Map();
  for (const row of rows) {
    _mappingCache.set(row.jiraStatusName.toLowerCase(), {
      workflowStage: row.workflowStage as IssueStatus,
    });
  }
  _cacheLoadedAt = Date.now();
}

export function invalidateStatusMappingCache(): void {
  _mappingCache = null;
  _cacheLoadedAt = 0;
}

async function ensureCache(): Promise<Map<string, { workflowStage: IssueStatus }>> {
  if (!_mappingCache || Date.now() - _cacheLoadedAt > CACHE_TTL) {
    await loadStatusMappingCache();
  }
  return _mappingCache!;
}

// Auto-create a mapping in the DB for a new JIRA status
async function autoCreateMapping(
  jiraStatusName: string,
  workflowStage: IssueStatus,
  statusCategory: string,
): Promise<void> {
  try {
    const id = `smap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await db
      .insert(statusMappings)
      .values({
        id,
        jiraStatusName,
        workflowStage,
        statusCategory,
        isAutoMapped: true,
      })
      .onDuplicateKeyUpdate({
        set: { statusCategory }, // no-op update on conflict
      });
    // Update cache
    if (_mappingCache) {
      _mappingCache.set(jiraStatusName.toLowerCase(), { workflowStage });
    }
  } catch {
    // Non-fatal — mapping will be created on next attempt
  }
}

// --- Async mapStatus (DB-first, code fallback, auto-create on miss) ---

async function mapStatus(
  status: { name: string; statusCategory: { key: string } },
): Promise<{ workflowStage: IssueStatus; jiraStatusName: string }> {
  const jiraName = status.name;
  const key = jiraName.toLowerCase();

  // 1. Check DB cache
  const cache = await ensureCache();
  const dbMapping = cache.get(key);
  if (dbMapping) {
    return { workflowStage: dbMapping.workflowStage, jiraStatusName: jiraName };
  }

  // 2. Check code-level STATUS_MAP
  const codeMapped = STATUS_MAP[key];
  if (codeMapped) {
    // Auto-create in DB so it shows up in Settings UI
    await autoCreateMapping(jiraName, codeMapped, status.statusCategory.key);
    return { workflowStage: codeMapped, jiraStatusName: jiraName };
  }

  // 3. Fallback to statusCategory
  const categoryFallback = CATEGORY_FALLBACK[status.statusCategory.key] || "in_progress";
  await autoCreateMapping(jiraName, categoryFallback, status.statusCategory.key);
  console.warn(`Auto-mapped unknown JIRA status "${jiraName}" (category: ${status.statusCategory.key}) → ${categoryFallback}`);

  return { workflowStage: categoryFallback, jiraStatusName: jiraName };
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
  jiraStatusName: string;
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

// --- Main Normalizer (now async) ---

export async function normalizeIssue(
  raw: JiraIssueRaw,
  customFields: CustomFieldIds,
): Promise<NormalizedIssue> {
  const { workflowStage, jiraStatusName } = await mapStatus(raw.fields.status);

  // Extract start date from custom field
  let startDate: string | null = null;
  if (customFields.startDate) {
    const val = raw.fields[customFields.startDate];
    if (typeof val === "string") {
      startDate = val.split("T")[0];
    }
  }

  // Extract due date
  const dueDate = raw.fields.duedate
    ? raw.fields.duedate.split("T")[0]
    : null;

  // Extract completed date for done/closed issues
  let completedDate: string | null = null;
  if (workflowStage === "done" || workflowStage === "closed") {
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
    status: workflowStage,
    jiraStatusName,
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
