import { auth } from "@/auth";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";

export default async function OverviewPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your team&apos;s current work, upcoming tasks, and workload
        </p>
      </div>

      <OverviewDashboard isAdmin={isAdmin} />
    </div>
  );
}
