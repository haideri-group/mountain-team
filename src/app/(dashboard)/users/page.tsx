import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UsersTable } from "@/components/users/users-table";

export default async function UsersPage() {
  const session = await auth();

  // Admin only
  if (session?.user?.role !== "admin") {
    redirect("/overview");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage application users, roles, and account status
        </p>
      </div>

      <UsersTable currentUserId={session.user.id} />
    </div>
  );
}
