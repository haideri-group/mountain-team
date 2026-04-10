import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name"),
  hashedPassword: text("hashedPassword"),
  role: text("role", { enum: ["admin", "user"] }).default("user").notNull(),
  avatarUrl: text("avatarUrl"),
  createdAt: integer("createdAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
});

export const team_members = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  jiraAccountId: text("jiraAccountId").unique().notNull(),
  displayName: text("displayName").notNull(),
  email: text("email"),
  role: text("role"),
  status: text("status", { enum: ["active", "on_leave", "departed"] }).default("active").notNull(),
  joinedDate: text("joinedDate"),
  departedDate: text("departedDate"),
  capacity: integer("capacity").default(10),
  avatarUrl: text("avatarUrl"),
  color: text("color"),
  createdAt: integer("createdAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
  updatedAt: integer("updatedAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
});

export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(),
  jiraKey: text("jiraKey").unique().notNull(),
  name: text("name").notNull(),
  color: text("color"),
  description: text("description"),
  isTracked: integer("isTracked", { mode: "boolean" }).default(true),
  createdAt: integer("createdAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
});

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  jiraKey: text("jiraKey").unique().notNull(),
  boardId: text("boardId").references(() => boards.id).notNull(),
  assigneeId: text("assigneeId").references(() => team_members.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["todo", "in_progress", "in_review", "ready_for_testing", "ready_for_live", "done", "closed"] }).notNull(),
  priority: text("priority", { enum: ["highest", "high", "medium", "low", "lowest"] }),
  type: text("type", { enum: ["bug", "story", "cms_change", "enhancement", "task"] }),
  startDate: text("startDate"),
  dueDate: text("dueDate"),
  completedDate: text("completedDate"),
  cycleTime: real("cycleTime"),
  storyPoints: real("storyPoints"),
  labels: text("labels", { mode: "json" }),
  createdAt: integer("createdAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
  updatedAt: integer("updatedAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
});

export const syncLogs = sqliteTable("sync_logs", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["full", "incremental", "manual"] }).notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull(),
  startedAt: integer("startedAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
  completedAt: integer("completedAt"),
  issueCount: integer("issueCount").default(0),
  error: text("error"),
  createdAt: integer("createdAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
});

export const dashboardConfig = sqliteTable("dashboard_config", {
  id: text("id").primaryKey(),
  jiraBaseUrl: text("jiraBaseUrl"),
  jiraEmail: text("jiraEmail"),
  syncInterval: integer("syncInterval").default(5),
  defaultView: text("defaultView").default("overview"),
  overdueNotifications: integer("overdueNotifications", { mode: "boolean" }).default(true),
  taskAgingAlerts: integer("taskAgingAlerts", { mode: "boolean" }).default(true),
  taskAgingDays: integer("taskAgingDays").default(3),
  theme: text("theme", { enum: ["light", "dark", "system"] }).default("system"),
  createdAt: integer("createdAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
  updatedAt: integer("updatedAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["aging", "overdue", "capacity", "completed", "unblocked"] }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedIssueId: text("relatedIssueId").references(() => issues.id),
  relatedMemberId: text("relatedMemberId").references(() => team_members.id),
  isRead: integer("isRead", { mode: "boolean" }).default(false),
  createdAt: integer("createdAt").default(sql`(cast(strftime('%s', 'now') as integer))`),
});
