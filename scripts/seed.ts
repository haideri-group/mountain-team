import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { users, team_members, boards, issues, dashboardConfig, notifications } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");
  console.log("Seeding database (MySQL)...");

  // Clear existing data (order matters for foreign keys)
  console.log("Clearing existing data...");
  await db.delete(notifications);
  await db.delete(issues);
  await db.delete(team_members);
  await db.delete(boards);
  await db.delete(dashboardConfig);
  await db.delete(users);

  // Insert Users
  await db.insert(users).values([
    {
      id: "usr_1",
      email: "admin@tilemountain.co.uk",
      name: "Admin User",
      role: "admin",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
    },
    {
      id: "usr_2",
      email: "user@tilemountain.co.uk",
      name: "Standard User",
      role: "user",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=User",
    }
  ]);

  // Insert Config
  await db.insert(dashboardConfig).values({
    id: "default",
    jiraBaseUrl: "https://tilemountain.atlassian.net",
    jiraEmail: "admin@tilemountain.co.uk",
    syncInterval: 5,
    defaultView: "overview",
    overdueNotifications: true,
    taskAgingAlerts: true,
    taskAgingDays: 3,
    theme: "system",
  });

  // Insert Boards
  await db.insert(boards).values([
    { id: "brd_1", jiraKey: "PROD", name: "Production Board", color: "#f97316", description: "Continuous Deployment", isTracked: true },
    { id: "brd_2", jiraKey: "BUTTERFLY", name: "Social Logins", color: "#3b82f6", description: "Project Butterfly", isTracked: true },
    { id: "brd_3", jiraKey: "EAGLE", name: "E-commerce Rebuild", color: "#a855f7", description: "Project Eagle", isTracked: true },
    { id: "brd_4", jiraKey: "DOLPHIN", name: "Customer Portal", color: "#14b8a6", description: "Project Dolphin", isTracked: false },
    { id: "brd_5", jiraKey: "FALCON", name: "Performance", color: "#ef4444", description: "Project Falcon", isTracked: false },
  ]);

  // Insert Team Members
  const developers: (typeof team_members.$inferInsert)[] = [
    { id: "tm_1", jiraAccountId: "jira_alex", displayName: "Alex Kim", email: "alex@tilemountain.co.uk", role: "Senior Frontend Developer", status: "active", capacity: 10, color: "#10b981", joinedDate: "2024-01-15" },
    { id: "tm_2", jiraAccountId: "jira_maria", displayName: "Maria Rodriguez", email: "maria@tilemountain.co.uk", role: "Frontend Developer", status: "active", capacity: 10, color: "#f59e0b", joinedDate: "2024-02-01" },
    { id: "tm_3", jiraAccountId: "jira_ryan", displayName: "Ryan Khan", email: "ryan@tilemountain.co.uk", role: "Junior Developer", status: "active", capacity: 5, color: "#6366f1", joinedDate: "2024-03-01" },
    { id: "tm_4", jiraAccountId: "jira_james", displayName: "James Liu", email: "james@tilemountain.co.uk", role: "UX Developer", status: "on_leave", capacity: 0, color: "#ec4899", joinedDate: "2023-11-01" },
    { id: "tm_5", jiraAccountId: "jira_david", displayName: "David Wang", email: "david@tilemountain.co.uk", role: "Mid Developer", status: "departed", capacity: 10, color: "#6b7280", joinedDate: "2020-02-01", departedDate: "2025-11-15" },
    { id: "tm_6", jiraAccountId: "jira_emma", displayName: "Emma Davis", email: "emma@tilemountain.co.uk", role: "Backend Developer", status: "active", capacity: 10, color: "#8b5cf6", joinedDate: "2023-05-10" },
    { id: "tm_7", jiraAccountId: "jira_liam", displayName: "Liam Smith", email: "liam@tilemountain.co.uk", role: "Fullstack Developer", status: "active", capacity: 8, color: "#ef4444", joinedDate: "2022-08-22" },
    { id: "tm_8", jiraAccountId: "jira_olivia", displayName: "Olivia Taylor", email: "olivia@tilemountain.co.uk", role: "QA Engineer", status: "active", capacity: 10, color: "#14b8a6", joinedDate: "2023-11-15" },
    { id: "tm_9", jiraAccountId: "jira_william", displayName: "William Brown", email: "william@tilemountain.co.uk", role: "DevOps Engineer", status: "active", capacity: 10, color: "#f97316", joinedDate: "2021-04-05" },
    { id: "tm_10", jiraAccountId: "jira_sophia", displayName: "Sophia Wilson", email: "sophia@tilemountain.co.uk", role: "Frontend Developer", status: "active", capacity: 10, color: "#0ea5e9", joinedDate: "2024-01-20" },
    { id: "tm_11", jiraAccountId: "jira_lucas", displayName: "Lucas Moore", email: "lucas@tilemountain.co.uk", role: "Junior Developer", status: "active", capacity: 8, color: "#d946ef", joinedDate: "2024-04-10" },
    { id: "tm_12", jiraAccountId: "jira_isabella", displayName: "Isabella Lee", email: "isabella@tilemountain.co.uk", role: "Senior Backend Developer", status: "on_leave", capacity: 0, color: "#84cc16", joinedDate: "2022-02-14" },
    { id: "tm_13", jiraAccountId: "jira_ethan", displayName: "Ethan Clark", email: "ethan@tilemountain.co.uk", role: "Product Manager", status: "active", capacity: 5, color: "#64748b", joinedDate: "2021-09-01" },
    { id: "tm_14", jiraAccountId: "jira_mia", displayName: "Mia Allen", email: "mia@tilemountain.co.uk", role: "UI/UX Designer", status: "active", capacity: 10, color: "#f43f5e", joinedDate: "2023-07-07" },
  ];
  await db.insert(team_members).values(developers);

  // Procedurally Generate 60 Mock Issues
  const mockIssues = [];
  const statuses = ["todo", "in_progress", "done"];
  const priorities = ["low", "medium", "high", "highest"];
  const types = ["story", "bug", "task"];
  const boardIds = ["brd_1", "brd_2", "brd_3", "brd_4", "brd_5"];
  
  for (let i = 1; i <= 60; i++) {
    const boardId = boardIds[i % boardIds.length];
    const prefix = boardId === "brd_1" ? "PROD" : boardId === "brd_2" ? "BUTTERFLY" : boardId === "brd_3" ? "EAGLE" : boardId === "brd_4" ? "DOLPHIN" : "FALCON";
    
    mockIssues.push({
      id: `iss_${i}`,
      jiraKey: `${prefix}-${1000 + i}`,
      boardId,
      assigneeId: developers[i % developers.length].id,
      title: `Generated Development Task ${i} for ${prefix}`,
      status: statuses[i % statuses.length] as any,
      priority: priorities[i % priorities.length] as any,
      type: types[i % types.length] as any,
      storyPoints: (i % 5) + 1,
    });
  }

  await db.insert(issues).values(mockIssues);

  // Notifications
  await db.insert(notifications).values([
    {
      id: "notif_1",
      type: "aging",
      title: "Task Aging",
      message: "PROD-5547 has been in progress for 5 days",
      relatedIssueId: "iss_2",
      relatedMemberId: "tm_2",
      isRead: false
    }
  ]);

  console.log("Seeding complete.");
}

main().catch((err) => {
  console.error("Seed failed", err);
  process.exit(1);
});
