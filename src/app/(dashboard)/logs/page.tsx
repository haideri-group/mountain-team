import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LogsView } from "@/components/logs/logs-view";

export default async function LogsPage() {
  const session = await auth();

  // Admin only (same pattern as /settings and /users)
  if (session?.user?.role !== "admin") {
    redirect("/overview");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Automations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scheduled + manual TeamFlow jobs — trigger, monitor, and reclaim stuck runs
        </p>
      </div>

      <LogsView />
    </div>
  );
}
