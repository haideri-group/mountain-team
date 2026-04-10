import { db } from "../src/lib/db";
import { users, team_members, boards, issues, dashboardConfig, notifications } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Seeding database...");

  // Insert Users
  const [adminUser] = await db.insert(users).values([
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
  ]).returning();

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
  const [prodBoard, butterflyBoard, eagleBoard, dolphinBoard, falconBoard] = await db.insert(boards).values([
    { id: "brd_1", jiraKey: "PROD", name: "Production Board", color: "#f97316", description: "Continuous Deployment", isTracked: true },
    { id: "brd_2", jiraKey: "BUTTERFLY", name: "Social Logins", color: "#3b82f6", description: "Project Butterfly", isTracked: true },
    { id: "brd_3", jiraKey: "EAGLE", name: "E-commerce Rebuild", color: "#a855f7", description: "Project Eagle", isTracked: true },
    { id: "brd_4", jiraKey: "DOLPHIN", name: "Customer Portal", color: "#14b8a6", description: "Project Dolphin", isTracked: false },
    { id: "brd_5", jiraKey: "FALCON", name: "Performance", color: "#ef4444", description: "Project Falcon", isTracked: false },
  ]).returning();

  // Insert Team Members
  const members = await db.insert(team_members).values([
    { id: "tm_1", jiraAccountId: "jira_alex", displayName: "Alex Kim", email: "alex@tilemountain.co.uk", role: "Senior Frontend Developer", status: "active", capacity: 10, color: "#10b981", joinedDate: "2024-01-15" },
    { id: "tm_2", jiraAccountId: "jira_maria", displayName: "Maria Rodriguez", email: "maria@tilemountain.co.uk", role: "Frontend Developer", status: "active", capacity: 10, color: "#f59e0b", joinedDate: "2024-02-01" },
    { id: "tm_3", jiraAccountId: "jira_ryan", displayName: "Ryan Khan", email: "ryan@tilemountain.co.uk", role: "Junior Developer", status: "active", capacity: 5, color: "#6366f1", joinedDate: "2024-03-01" },
    { id: "tm_4", jiraAccountId: "jira_james", displayName: "James Liu", email: "james@tilemountain.co.uk", role: "UX Developer", status: "on_leave", capacity: 0, color: "#ec4899", joinedDate: "2023-11-01" },
    { id: "tm_5", jiraAccountId: "jira_david", displayName: "David Wang", email: "david@tilemountain.co.uk", role: "Mid Developer", status: "departed", capacity: 10, color: "#6b7280", joinedDate: "2020-02-01", departedDate: "2025-11-15" },
  ]).returning();

  // Insert Mock Issues
  const mockIssues = [
    {
      id: "iss_1",
      jiraKey: "BUTTERFLY-112",
      boardId: butterflyBoard.id,
      assigneeId: members[0].id,
      title: "Implement Google OAuth flow",
      status: "in_progress" as const,
      priority: "high" as const,
      type: "story" as const,
      storyPoints: 5,
    },
    {
      id: "iss_2",
      jiraKey: "PROD-5547",
      boardId: prodBoard.id,
      assigneeId: members[1].id,
      title: "Fix checkout 500 error on Safari",
      status: "in_progress" as const,
      priority: "highest" as const,
      type: "bug" as const,
      storyPoints: 3,
    },
    {
      id: "iss_3",
      jiraKey: "PROD-5532",
      boardId: prodBoard.id,
      assigneeId: members[3].id,
      title: "API timeout on user profile page",
      status: "todo" as const,
      priority: "medium" as const,
      type: "bug" as const,
      storyPoints: 2,
    },
  ];

  await db.insert(issues).values(mockIssues);

  // Notifications
  await db.insert(notifications).values([
    {
      id: "notif_1",
      type: "aging",
      title: "Task Aging",
      message: "PROD-5547 has been in progress for 5 days",
      relatedIssueId: "iss_2",
      relatedMemberId: members[1].id,
      isRead: false
    }
  ]);

  console.log("Seeding complete.");
}

main().catch((err) => {
  console.error("Seed failed", err);
  process.exit(1);
});
