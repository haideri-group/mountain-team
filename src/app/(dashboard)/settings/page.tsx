import { db } from "@/lib/db";
import { boards, syncLogs } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BoardsManager } from "@/components/settings/boards-manager";
import { TeamSyncManager } from "@/components/settings/team-sync-manager";
import { IssueSyncManager } from "@/components/settings/issue-sync-manager";
import { GitHubReposManager } from "@/components/settings/github-repos-manager";

export default async function SettingsPage() {
  const session = await auth();

  // Admin only
  if (session?.user?.role !== "admin") {
    redirect("/overview");
  }

  const allBoards = await db.select().from(boards).orderBy(desc(boards.createdAt));

  const [lastSync] = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.type, "team_sync"))
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);

  const [lastIssueSync] = await db
    .select()
    .from(syncLogs)
    .where(inArray(syncLogs.type, ["full", "incremental", "manual"]))
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage JIRA projects and application configuration
        </p>
      </div>

      <div className="space-y-8">
        {/* Team Sync */}
        <section>
          <TeamSyncManager
            lastSync={
              lastSync
                ? {
                    id: lastSync.id,
                    status: lastSync.status,
                    startedAt: lastSync.startedAt,
                    completedAt: lastSync.completedAt,
                    memberCount: lastSync.memberCount,
                    error: lastSync.error,
                  }
                : null
            }
          />
        </section>

        {/* Issue Sync */}
        <section>
          <IssueSyncManager
            lastSync={
              lastIssueSync
                ? {
                    id: lastIssueSync.id,
                    type: lastIssueSync.type,
                    status: lastIssueSync.status,
                    startedAt: lastIssueSync.startedAt,
                    completedAt: lastIssueSync.completedAt,
                    issueCount: lastIssueSync.issueCount,
                    error: lastIssueSync.error,
                  }
                : null
            }
          />
        </section>

        {/* GitHub Deployment Tracking */}
        <section>
          <GitHubReposManager />
        </section>

        {/* Projects / Boards Management */}
        <section>
          <BoardsManager
            boards={allBoards.map((b) => ({
              id: b.id,
              jiraKey: b.jiraKey,
              name: b.name,
              color: b.color,
              description: b.description,
              isTracked: b.isTracked,
            }))}
          />
        </section>
      </div>
    </div>
  );
}
