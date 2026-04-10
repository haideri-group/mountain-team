import { db } from "@/lib/db";
import { team_members } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { MembersTable } from "@/components/members/members-table";

export default async function MembersPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  const members = await db
    .select()
    .from(team_members)
    .orderBy(desc(team_members.createdAt));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your team members and track their JIRA tasks
        </p>
      </div>

      <MembersTable
        members={members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          email: m.email,
          role: m.role,
          status: m.status as "active" | "on_leave" | "departed",
          jiraAccountId: m.jiraAccountId,
          joinedDate: m.joinedDate,
          departedDate: m.departedDate,
          capacity: m.capacity,
          color: m.color,
        }))}
        isAdmin={isAdmin}
      />
    </div>
  );
}
