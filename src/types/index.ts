// Core enums
export type UserRole = "admin" | "user";
export type MemberStatus = "active" | "on_leave" | "departed";
export type IssueStatus = "todo" | "on_hold" | "in_progress" | "in_review" | "ready_for_testing" | "ready_for_live" | "done" | "closed";
export type IssuePriority = "highest" | "high" | "medium" | "low" | "lowest";
export type IssueType = "bug" | "story" | "cms_change" | "enhancement" | "task" | "subtask";
export type SyncType = "full" | "incremental" | "manual" | "team_sync";
export type SyncStatus = "running" | "completed" | "failed";
export type NotificationType = "aging" | "overdue" | "capacity" | "completed" | "unblocked" | "deployed" | "user_joined";
export type DeploymentEnvironment = "staging" | "production" | "canonical";
export type Theme = "light" | "dark" | "system";

// Users
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: Date | null;
}

// Team Members
export interface TeamMember {
  id: string;
  jiraAccountId: string;
  displayName: string;
  email: string | null;
  role: string | null; // job title
  status: MemberStatus;
  joinedDate: string | null;
  departedDate: string | null;
  capacity: number | null;
  avatarUrl: string | null;
  color: string | null;
  teamId: string | null;
  teamName: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Boards
export interface Board {
  id: string;
  jiraKey: string;
  name: string;
  color: string | null;
  description: string | null;
  isTracked: boolean | null;
  createdAt: Date | null;
}

// Issues
export interface Issue {
  id: string;
  jiraKey: string;
  boardId: string;
  assigneeId: string | null;
  title: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  type: IssueType | null;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  cycleTime: number | null;
  storyPoints: number | null;
  labels: string | null; // JSON array
  description?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Sync Logs
export interface SyncLog {
  id: string;
  type: SyncType;
  status: SyncStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  issueCount: number | null;
  memberCount: number | null;
  error: string | null;
  createdAt: Date | null;
}

// Dashboard Config
export interface DashboardConfig {
  id: string;
  jiraBaseUrl: string | null;
  jiraEmail: string | null;
  syncInterval: number | null;
  defaultView: string | null;
  overdueNotifications: boolean | null;
  taskAgingAlerts: boolean | null;
  taskAgingDays: number | null;
  theme: Theme | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// Notifications
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedIssueId: string | null;
  relatedMemberId: string | null;
  isRead: boolean | null;
  createdAt: Date | null;
}

// Composite types for UI consumption

export interface MemberWithIssues extends TeamMember {
  issues: Issue[];
  currentIssue: Issue | null; // in_progress
  queuedIssues: Issue[]; // todo, sorted by startDate
  recentDone: Issue[]; // done in last 7 days
  totalDone: number;
  totalClosed: number;
  onTimePercentage: number;
  avgCycleTime: number;
  workloadPercentage: number;
}

export interface BoardWithStats extends Board {
  openCount: number;
  blockedCount: number;
  overdueCount: number;
  avgCycleTime: number;
}

export interface NotificationWithRelations extends Notification {
  relatedIssue?: Issue | null;
  relatedMember?: TeamMember | null;
}

// Metrics
export interface OverviewMetrics {
  teamMembers: number;
  activeIssues: number;
  inProgress: number;
  overdueTasks: number;
  overdueChange: number; // vs last week
}

export interface WorkloadData {
  memberId: string;
  memberName: string;
  assignedCount: number;
  completedCount: number;
  percentage: number;
  level: "under" | "optimal" | "high" | "over";
}

// Calendar
export interface CalendarEvent {
  id: string;
  issueKey: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  assigneeInitials: string;
  boardKey: string;
  boardColor: string;
  status: IssueStatus;
  startDate: string;
  endDate: string;
  isOverdue: boolean;
}

// Reports
export interface VelocityDataPoint {
  period: string; // "Oct", "Nov", etc.
  prodCount: number;
  projectCount: number;
  total: number;
}

export interface TaskTypeBreakdown {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

export interface DeveloperRanking {
  memberId: string;
  memberName: string;
  memberInitials: string;
  doneCount: number;
  missedCount: number;
  onTimePercentage: number;
  avgCycleTime: number;
  trend: "up" | "down" | "steady";
}

export interface HeatmapCell {
  memberId: string;
  memberName: string;
  month: string;
  count: number;
  level: "high" | "medium" | "low" | "minimal";
  annotation?: string;
}

export interface WeeklyPulsePoint {
  week: string;
  created: number;
  completed: number;
}

export interface TurnaroundBucket {
  label: string;
  count: number;
  color: string;
}
