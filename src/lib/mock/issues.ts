import type { Issue } from "@/types";

export const mockIssues: Issue[] = [
  // === Alex Kim — active, 85% workload ===
  { id: "iss-01", jiraKey: "BUTTERFLY-112", boardId: "board-02", assigneeId: "tm-01", title: "Implement Google OAuth flow", status: "in_progress", priority: "high", type: "story", startDate: "2026-03-16", dueDate: "2026-03-19", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-02", jiraKey: "BUTTERFLY-118", boardId: "board-02", assigneeId: "tm-01", title: "Add Apple Sign-In integration", status: "todo", priority: "medium", type: "story", startDate: "2026-03-20", dueDate: "2026-03-22", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-03", jiraKey: "PROD-5563", boardId: "board-01", assigneeId: "tm-01", title: "Fix SSO callback redirect loop", status: "todo", priority: "high", type: "bug", startDate: "2026-03-21", dueDate: "2026-03-23", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-04", jiraKey: "BUTTERFLY-125", boardId: "board-02", assigneeId: "tm-01", title: "Unit tests for OAuth service", status: "todo", priority: "medium", type: "task", startDate: "2026-03-22", dueDate: "2026-03-24", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-05", jiraKey: "PROD-5540", boardId: "board-01", assigneeId: "tm-01", title: "Fix login redirect bug", status: "done", priority: "high", type: "bug", startDate: "2026-03-13", dueDate: "2026-03-15", completedDate: "2026-03-15", cycleTime: 1.5, storyPoints: 2, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-06", jiraKey: "BUTTERFLY-108", boardId: "board-02", assigneeId: "tm-01", title: "Setup OAuth config", status: "done", priority: "medium", type: "task", startDate: "2026-03-12", dueDate: "2026-03-14", completedDate: "2026-03-14", cycleTime: 2.0, storyPoints: 2, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Maria Rodriguez — active, 110% overloaded ===
  { id: "iss-07", jiraKey: "PROD-5547", boardId: "board-01", assigneeId: "tm-02", title: "Fix checkout page 500 error on Safari", status: "in_progress", priority: "high", type: "bug", startDate: "2026-03-16", dueDate: "2026-03-20", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-08", jiraKey: "PROD-5551", boardId: "board-01", assigneeId: "tm-02", title: "Update hero banner images on CMS", status: "todo", priority: "low", type: "cms_change", startDate: "2026-03-18", dueDate: "2026-03-19", completedDate: null, cycleTime: null, storyPoints: 1, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-09", jiraKey: "PROD-5555", boardId: "board-01", assigneeId: "tm-02", title: "Fix payment form validation on mobile", status: "todo", priority: "high", type: "bug", startDate: "2026-03-19", dueDate: "2026-03-21", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-10", jiraKey: "PROD-5559", boardId: "board-01", assigneeId: "tm-02", title: "Update footer links on CMS", status: "todo", priority: "low", type: "cms_change", startDate: "2026-03-20", dueDate: "2026-03-21", completedDate: null, cycleTime: null, storyPoints: 1, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-11", jiraKey: "PROD-5538", boardId: "board-01", assigneeId: "tm-02", title: "Hotfix cart total rounding", status: "done", priority: "high", type: "bug", startDate: "2026-03-12", dueDate: "2026-03-14", completedDate: "2026-03-14", cycleTime: 1.8, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === James Liu — on leave, has blocked task ===
  { id: "iss-12", jiraKey: "PROD-5532", boardId: "board-01", assigneeId: "tm-03", title: "API timeout on user profile page", status: "in_progress", priority: "high", type: "bug", startDate: "2026-03-11", dueDate: "2026-03-14", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend","Blocked"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-13", jiraKey: "PROD-5560", boardId: "board-01", assigneeId: "tm-03", title: "Update pricing page copy on CMS", status: "todo", priority: "low", type: "cms_change", startDate: "2026-03-19", dueDate: "2026-03-20", completedDate: null, cycleTime: null, storyPoints: 1, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-14", jiraKey: "PROD-5564", boardId: "board-01", assigneeId: "tm-03", title: "Fix breadcrumb nav on category pages", status: "todo", priority: "medium", type: "bug", startDate: "2026-03-21", dueDate: "2026-03-23", completedDate: null, cycleTime: null, storyPoints: 2, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-15", jiraKey: "PROD-5529", boardId: "board-01", assigneeId: "tm-03", title: "Fix 404 on search results", status: "done", priority: "medium", type: "bug", startDate: "2026-03-10", dueDate: "2026-03-13", completedDate: "2026-03-13", cycleTime: 2.5, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Priya Shah — active, 72% workload ===
  { id: "iss-16", jiraKey: "BUTTERFLY-105", boardId: "board-02", assigneeId: "tm-04", title: "Design system token migration for login", status: "in_progress", priority: "medium", type: "story", startDate: "2026-03-16", dueDate: "2026-03-20", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-17", jiraKey: "BUTTERFLY-120", boardId: "board-02", assigneeId: "tm-04", title: "Social login error handling UX", status: "todo", priority: "medium", type: "story", startDate: "2026-03-21", dueDate: "2026-03-24", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-18", jiraKey: "PROD-5566", boardId: "board-01", assigneeId: "tm-04", title: "Fix A11y issues on settings page", status: "todo", priority: "medium", type: "bug", startDate: "2026-03-22", dueDate: "2026-03-25", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-19", jiraKey: "BUTTERFLY-98", boardId: "board-02", assigneeId: "tm-04", title: "Login page UI scaffold", status: "done", priority: "medium", type: "story", startDate: "2026-03-11", dueDate: "2026-03-15", completedDate: "2026-03-15", cycleTime: 3.0, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Tom Nguyen — active, 92% workload ===
  { id: "iss-20", jiraKey: "PROD-5549", boardId: "board-01", assigneeId: "tm-05", title: "Fix responsive nav on tablet breakpoint", status: "in_progress", priority: "medium", type: "bug", startDate: "2026-03-16", dueDate: "2026-03-19", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-21", jiraKey: "PROD-5558", boardId: "board-01", assigneeId: "tm-05", title: "Replace product images on landing CMS", status: "todo", priority: "low", type: "cms_change", startDate: "2026-03-19", dueDate: "2026-03-20", completedDate: null, cycleTime: null, storyPoints: 1, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-22", jiraKey: "PROD-5562", boardId: "board-01", assigneeId: "tm-05", title: "Fix lazy loading on product gallery", status: "todo", priority: "medium", type: "bug", startDate: "2026-03-20", dueDate: "2026-03-22", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-23", jiraKey: "PROD-5541", boardId: "board-01", assigneeId: "tm-05", title: "Hotfix image CDN paths", status: "done", priority: "high", type: "bug", startDate: "2026-03-14", dueDate: "2026-03-16", completedDate: "2026-03-16", cycleTime: 1.5, storyPoints: 2, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Emma Wilson — active, 60% workload ===
  { id: "iss-24", jiraKey: "BUTTERFLY-101", boardId: "board-02", assigneeId: "tm-06", title: "Architecture review for OAuth service", status: "in_progress", priority: "high", type: "story", startDate: "2026-03-16", dueDate: "2026-03-20", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-25", jiraKey: "BUTTERFLY-130", boardId: "board-02", assigneeId: "tm-06", title: "SSO federation with enterprise IdPs", status: "todo", priority: "medium", type: "story", startDate: "2026-03-22", dueDate: "2026-03-26", completedDate: null, cycleTime: null, storyPoints: 8, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-26", jiraKey: "PROD-5570", boardId: "board-01", assigneeId: "tm-06", title: "Review & merge pending PRs", status: "todo", priority: "medium", type: "task", startDate: "2026-03-23", dueDate: "2026-03-24", completedDate: null, cycleTime: null, storyPoints: 2, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-27", jiraKey: "BUTTERFLY-95", boardId: "board-02", assigneeId: "tm-06", title: "OAuth provider research doc", status: "done", priority: "high", type: "task", startDate: "2026-03-06", dueDate: "2026-03-10", completedDate: "2026-03-14", cycleTime: 5.0, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-28", jiraKey: "PROD-5535", boardId: "board-01", assigneeId: "tm-06", title: "Deploy pipeline fix", status: "done", priority: "high", type: "bug", startDate: "2026-03-10", dueDate: "2026-03-12", completedDate: "2026-03-12", cycleTime: 1.5, storyPoints: 2, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Ryan Khan — active, IDLE (0% workload, no tasks) ===
  // No active or queued issues

  // === Amir Hassan — active, moderate workload ===
  { id: "iss-29", jiraKey: "PROD-5568", boardId: "board-01", assigneeId: "tm-10", title: "Fix form submission on checkout page", status: "in_progress", priority: "high", type: "bug", startDate: "2026-03-17", dueDate: "2026-03-20", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-30", jiraKey: "PROD-5572", boardId: "board-01", assigneeId: "tm-10", title: "Update FAQ section CMS content", status: "todo", priority: "low", type: "cms_change", startDate: "2026-03-21", dueDate: "2026-03-22", completedDate: null, cycleTime: null, storyPoints: 1, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Lisa Chen — active, light workload ===
  { id: "iss-31", jiraKey: "BUTTERFLY-135", boardId: "board-02", assigneeId: "tm-11", title: "Style social login buttons for mobile", status: "in_progress", priority: "medium", type: "story", startDate: "2026-03-17", dueDate: "2026-03-21", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Omar Farooq — active, moderate ===
  { id: "iss-32", jiraKey: "PROD-5574", boardId: "board-01", assigneeId: "tm-12", title: "Fix image carousel on PDP mobile", status: "in_progress", priority: "medium", type: "bug", startDate: "2026-03-16", dueDate: "2026-03-19", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-33", jiraKey: "PROD-5576", boardId: "board-01", assigneeId: "tm-12", title: "Add product comparison feature", status: "todo", priority: "medium", type: "enhancement", startDate: "2026-03-20", dueDate: "2026-03-25", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },

  // === Nina Patel — active, solid ===
  { id: "iss-34", jiraKey: "PROD-5578", boardId: "board-01", assigneeId: "tm-13", title: "Refactor search results component", status: "in_progress", priority: "medium", type: "enhancement", startDate: "2026-03-16", dueDate: "2026-03-21", completedDate: null, cycleTime: null, storyPoints: 5, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
  { id: "iss-35", jiraKey: "PROD-5580", boardId: "board-01", assigneeId: "tm-13", title: "Update shipping calculator UI", status: "todo", priority: "low", type: "enhancement", startDate: "2026-03-22", dueDate: "2026-03-25", completedDate: null, cycleTime: null, storyPoints: 3, labels: '["Frontend"]', createdAt: new Date(), updatedAt: new Date() },
];

export function getIssuesForMember(memberId: string) {
  return mockIssues.filter((i) => i.assigneeId === memberId);
}

export function getCurrentIssue(memberId: string) {
  return mockIssues.find((i) => i.assigneeId === memberId && i.status === "in_progress") ?? null;
}

export function getQueuedIssues(memberId: string) {
  return mockIssues
    .filter((i) => i.assigneeId === memberId && i.status === "todo")
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
}

export function getRecentDone(memberId: string, days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return mockIssues.filter(
    (i) =>
      i.assigneeId === memberId &&
      i.status === "done" &&
      i.completedDate &&
      new Date(i.completedDate) >= cutoff,
  );
}

export function isBlocked(issue: Issue): boolean {
  const labels = issue.labels ? JSON.parse(issue.labels) : [];
  return labels.includes("Blocked");
}

export function isOverdue(issue: Issue): boolean {
  if (!issue.dueDate || issue.status === "done" || issue.status === "closed") return false;
  return new Date(issue.dueDate) < new Date();
}
