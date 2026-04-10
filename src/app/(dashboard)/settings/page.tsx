import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { BoardsManager } from "@/components/settings/boards-manager";

export default async function SettingsPage() {
  const session = await auth();

  // Admin only
  if (session?.user?.role !== "admin") {
    redirect("/overview");
  }

  const allBoards = await db.select().from(boards).orderBy(desc(boards.createdAt));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage JIRA projects and application configuration
        </p>
      </div>

      <div className="space-y-8">
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
