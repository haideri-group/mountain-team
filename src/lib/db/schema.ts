import { mysqlTable, varchar, text, int, boolean, timestamp, mysqlEnum, float, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 191 }).primaryKey(),
  email: varchar("email", { length: 191 }).unique().notNull(),
  name: varchar("name", { length: 255 }),
  hashedPassword: text("hashedPassword"),
  role: mysqlEnum("role", ["admin", "user"]).default("user").notNull(),
  avatarUrl: text("avatarUrl"),
  authProvider: mysqlEnum("authProvider", ["credentials", "google"]).default("credentials"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
  lastLoginAt: timestamp("lastLoginAt"),
  passwordChangedAt: timestamp("passwordChangedAt"),
});

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: varchar("id", { length: 191 }).primaryKey(),
  userId: varchar("userId", { length: 191 }).notNull().references(() => users.id),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  requestedIp: varchar("requestedIp", { length: 45 }),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
}, (t) => ({
  tokenHashIdx: uniqueIndex("password_reset_tokens_token_hash_idx").on(t.tokenHash),
  userIdIdx: index("password_reset_tokens_user_id_idx").on(t.userId),
  expiresAtIdx: index("password_reset_tokens_expires_at_idx").on(t.expiresAt),
}));

export const team_members = mysqlTable("team_members", {
  id: varchar("id", { length: 191 }).primaryKey(),
  jiraAccountId: varchar("jiraAccountId", { length: 191 }).unique().notNull(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  email: varchar("email", { length: 191 }),
  role: varchar("role", { length: 255 }),
  status: mysqlEnum("status", ["active", "on_leave", "departed"]).default("active").notNull(),
  joinedDate: varchar("joinedDate", { length: 50 }),
  departedDate: varchar("departedDate", { length: 50 }),
  capacity: int("capacity").default(15),
  avatarUrl: text("avatarUrl"),
  sourceAvatarUrl: text("sourceAvatarUrl"),
  avatarHash: varchar("avatarHash", { length: 64 }),
  color: varchar("color", { length: 50 }),
  teamId: varchar("teamId", { length: 191 }),
  teamName: varchar("teamName", { length: 255 }),
  tdUserId: varchar("tdUserId", { length: 50 }).unique(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const boards = mysqlTable("boards", {
  id: varchar("id", { length: 191 }).primaryKey(),
  jiraKey: varchar("jiraKey", { length: 50 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 50 }),
  description: text("description"),
  isTracked: boolean("isTracked").default(true),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const issues = mysqlTable("issues", {
  id: varchar("id", { length: 191 }).primaryKey(),
  jiraKey: varchar("jiraKey", { length: 50 }).unique().notNull(),
  boardId: varchar("boardId", { length: 191 }).references(() => boards.id).notNull(),
  assigneeId: varchar("assigneeId", { length: 191 }).references(() => team_members.id),
  title: varchar("title", { length: 500 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  jiraStatusName: varchar("jiraStatusName", { length: 255 }),
  priority: mysqlEnum("priority", ["highest", "high", "medium", "low", "lowest"]),
  type: mysqlEnum("type", ["bug", "story", "cms_change", "enhancement", "task", "subtask"]),
  startDate: varchar("startDate", { length: 50 }),
  dueDate: varchar("dueDate", { length: 50 }),
  completedDate: varchar("completedDate", { length: 50 }),
  cycleTime: float("cycleTime"),
  storyPoints: float("storyPoints"),
  labels: text("labels"),
  description: text("description"),
  requestPriority: varchar("requestPriority", { length: 10 }),
  website: varchar("website", { length: 255 }),
  brands: text("brands"),
  fixVersions: text("fixVersions"),
  jiraCreatedAt: varchar("jiraCreatedAt", { length: 50 }),
  jiraUpdatedAt: varchar("jiraUpdatedAt", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const syncLogs = mysqlTable("sync_logs", {
  id: varchar("id", { length: 191 }).primaryKey(),
  type: mysqlEnum("type", ["full", "incremental", "manual", "team_sync", "worklog_sync", "timedoctor_sync", "release_sync"]).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).notNull(),
  startedAt: timestamp("startedAt").defaultNow(),
  completedAt: timestamp("completedAt"),
  issueCount: int("issueCount").default(0),
  memberCount: int("memberCount").default(0),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const statusMappings = mysqlTable("status_mappings", {
  id: varchar("id", { length: 191 }).primaryKey(),
  jiraStatusName: varchar("jiraStatusName", { length: 255 }).unique().notNull(),
  workflowStage: varchar("workflowStage", { length: 50 }).notNull(),
  displayColor: varchar("displayColor", { length: 50 }),
  statusCategory: varchar("statusCategory", { length: 50 }),
  isAutoMapped: boolean("isAutoMapped").default(false),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const dashboardConfig = mysqlTable("dashboard_config", {
  id: varchar("id", { length: 191 }).primaryKey(),
  jiraBaseUrl: varchar("jiraBaseUrl", { length: 255 }),
  jiraEmail: varchar("jiraEmail", { length: 255 }),
  syncInterval: int("syncInterval").default(5),
  defaultView: varchar("defaultView", { length: 50 }).default("overview"),
  overdueNotifications: boolean("overdueNotifications").default(true),
  taskAgingAlerts: boolean("taskAgingAlerts").default(true),
  taskAgingDays: int("taskAgingDays").default(3),
  deploymentNotifications: boolean("deploymentNotifications").default(true),
  theme: mysqlEnum("theme", ["light", "dark", "system"]).default("system"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const notifications = mysqlTable("notifications", {
  id: varchar("id", { length: 191 }).primaryKey(),
  type: mysqlEnum("type", ["aging", "overdue", "capacity", "completed", "unblocked", "deployed", "user_joined"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  relatedIssueId: varchar("relatedIssueId", { length: 191 }).references(() => issues.id),
  relatedMemberId: varchar("relatedMemberId", { length: 191 }).references(() => team_members.id),
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow(),
});

// --- GitHub Deployment Tracking ---

export const githubRepos = mysqlTable("github_repos", {
  id: varchar("id", { length: 191 }).primaryKey(),
  owner: varchar("owner", { length: 191 }).notNull(),
  name: varchar("name", { length: 191 }).notNull(),
  fullName: varchar("fullName", { length: 255 }).unique().notNull(),
  webhookActive: boolean("webhookActive").default(false),
  lastBackfillAt: timestamp("lastBackfillAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

export const githubBranchMappings = mysqlTable("github_branch_mappings", {
  id: varchar("id", { length: 191 }).primaryKey(),
  repoId: varchar("repoId", { length: 191 }).references(() => githubRepos.id).notNull(),
  branchPattern: varchar("branchPattern", { length: 255 }).notNull(),
  environment: mysqlEnum("environment", ["staging", "production", "canonical"]).notNull(),
  siteName: varchar("siteName", { length: 191 }),
  siteLabel: varchar("siteLabel", { length: 255 }),
  isAllSites: boolean("isAllSites").default(false),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const deployments = mysqlTable("deployments", {
  id: varchar("id", { length: 191 }).primaryKey(),
  issueId: varchar("issueId", { length: 191 }).references(() => issues.id),
  jiraKey: varchar("jiraKey", { length: 50 }).notNull(),
  repoId: varchar("repoId", { length: 191 }).references(() => githubRepos.id).notNull(),
  environment: mysqlEnum("environment", ["staging", "production", "canonical"]).notNull(),
  siteName: varchar("siteName", { length: 191 }),
  siteLabel: varchar("siteLabel", { length: 255 }),
  branch: varchar("branch", { length: 255 }).notNull(),
  prNumber: int("prNumber"),
  prTitle: varchar("prTitle", { length: 500 }),
  prUrl: varchar("prUrl", { length: 500 }),
  commitSha: varchar("commitSha", { length: 50 }),
  deployedBy: varchar("deployedBy", { length: 255 }),
  githubDeploymentId: varchar("githubDeploymentId", { length: 50 }),
  isHotfix: boolean("isHotfix").default(false),
  deployedAt: timestamp("deployedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
}, (table) => [
  index("idx_deployments_jirakey_env").on(table.jiraKey, table.environment),
]);

// --- JIRA Releases ---

export const jiraReleases = mysqlTable("jira_releases", {
  id: varchar("id", { length: 191 }).primaryKey(),
  jiraVersionId: varchar("jiraVersionId", { length: 50 }).unique().notNull(),
  projectKey: varchar("projectKey", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  startDate: varchar("startDate", { length: 50 }),
  releaseDate: varchar("releaseDate", { length: 50 }),
  released: boolean("released").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  overdue: boolean("overdue").default(false).notNull(),
  issuesDone: int("issuesDone").default(0),
  issuesInProgress: int("issuesInProgress").default(0),
  issuesToDo: int("issuesToDo").default(0),
  issuesTotal: int("issuesTotal").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// --- Time Doctor Entries ---

export const timedoctorEntries = mysqlTable("timedoctor_entries", {
  id: varchar("id", { length: 191 }).primaryKey(),
  tdWorklogId: varchar("tdWorklogId", { length: 100 }).unique().notNull(),
  memberId: varchar("memberId", { length: 191 }).references(() => team_members.id),
  tdUserId: varchar("tdUserId", { length: 50 }).notNull(),
  taskName: varchar("taskName", { length: 500 }),
  projectName: varchar("projectName", { length: 255 }),
  started: timestamp("started").notNull(),
  durationSeconds: int("durationSeconds").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
}, (table) => [
  index("idx_td_member_started").on(table.memberId, table.started),
]);

// --- JIRA Worklogs ---

export const worklogs = mysqlTable("worklogs", {
  id: varchar("id", { length: 191 }).primaryKey(),
  jiraWorklogId: varchar("jiraWorklogId", { length: 50 }).unique().notNull(),
  jiraKey: varchar("jiraKey", { length: 50 }).notNull(),
  authorAccountId: varchar("authorAccountId", { length: 191 }).notNull(),
  memberId: varchar("memberId", { length: 191 }).references(() => team_members.id),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  started: timestamp("started").notNull(),
  timeSpentSeconds: int("timeSpentSeconds").notNull(),
  comment: text("comment"),
  jiraCreatedAt: timestamp("jiraCreatedAt"),
  jiraUpdatedAt: timestamp("jiraUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
}, (table) => [
  index("idx_worklogs_member_started").on(table.memberId, table.started),
  index("idx_worklogs_jirakey").on(table.jiraKey),
]);

// --- Workload Tracking ---

export const workloadSnapshots = mysqlTable("workload_snapshots", {
  id: varchar("id", { length: 191 }).primaryKey(),
  memberId: varchar("memberId", { length: 191 }).references(() => team_members.id).notNull(),
  weekStart: varchar("weekStart", { length: 50 }).notNull(),
  percentage: int("percentage").default(0),
  activePoints: float("activePoints").default(0),
  capacity: int("capacity").default(15),
  assignedCount: int("assignedCount").default(0),
  createdAt: timestamp("createdAt").defaultNow(),
});
