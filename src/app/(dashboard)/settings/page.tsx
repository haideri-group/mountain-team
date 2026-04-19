import { db } from "@/lib/db";
import { boards, issues, syncLogs } from "@/lib/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BoardsManager } from "@/components/settings/boards-manager";
import { TeamSyncManager } from "@/components/settings/team-sync-manager";
import { IssueSyncManager } from "@/components/settings/issue-sync-manager";
import { GitHubReposManager } from "@/components/settings/github-repos-manager";
import { StatusMappingManager } from "@/components/settings/status-mapping-manager";
import { DeploymentBackfillPanel } from "@/components/settings/deployment-backfill-panel";
import { IpAllowlistManager } from "@/components/settings/ip-allowlist-manager";

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

  const [lastDeploymentBackfill] = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.type, "deployment_backfill"))
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);

  const trackedBoardIds = allBoards
    .filter((b) => b.isTracked)
    .map((b) => b.id);

  let unsyncedCount = 0;
  let totalTracked = 0;
  if (trackedBoardIds.length > 0) {
    const [[totalRow], [unsyncedRow]] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)` })
        .from(issues)
        .where(inArray(issues.boardId, trackedBoardIds)),
      db
        .select({ n: sql<number>`count(*)` })
        .from(issues)
        .where(
          and(
            inArray(issues.boardId, trackedBoardIds),
            isNull(issues.deploymentsSyncedAt),
          ),
        ),
    ]);
    totalTracked = Number(totalRow?.n ?? 0);
    unsyncedCount = Number(unsyncedRow?.n ?? 0);
  }

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

        {/* Status Mappings */}
        <section>
          <StatusMappingManager />
        </section>

        {/* GitHub Deployment Tracking */}
        <section>
          <GitHubReposManager />
        </section>

        {/* Deployment Backfill (Phase 20) */}
        <section>
          <DeploymentBackfillPanel
            lastSync={
              lastDeploymentBackfill
                ? {
                    id: lastDeploymentBackfill.id,
                    type: lastDeploymentBackfill.type,
                    status: lastDeploymentBackfill.status,
                    startedAt: lastDeploymentBackfill.startedAt,
                    completedAt: lastDeploymentBackfill.completedAt,
                    issueCount: lastDeploymentBackfill.issueCount,
                    error: lastDeploymentBackfill.error,
                  }
                : null
            }
            unsyncedCount={unsyncedCount}
            totalTracked={totalTracked}
          />
        </section>

        {/* IP Allowlist for guest access (Phase 20.5) */}
        <section>
          <IpAllowlistManager />
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
