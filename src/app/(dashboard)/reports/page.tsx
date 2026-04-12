import { ReportsDashboard } from "@/components/reports/reports-dashboard";

export default function ReportsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-mono">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Team performance analytics, velocity trends, and delivery insights
        </p>
      </div>

      <ReportsDashboard />
    </div>
  );
}
