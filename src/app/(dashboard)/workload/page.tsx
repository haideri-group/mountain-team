import { WorkloadDashboard } from "@/components/workload/workload-dashboard";

export default function WorkloadPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Workload</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Developer capacity, workload balance, and burnout indicators
        </p>
      </div>

      <WorkloadDashboard />
    </div>
  );
}
