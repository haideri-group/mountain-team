import { auth } from "@/auth";
import { MembersTable } from "@/components/members/members-table";

export default async function MembersPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your team members and track their JIRA tasks
        </p>
      </div>

      <MembersTable isAdmin={isAdmin} />
    </div>
  );
}
