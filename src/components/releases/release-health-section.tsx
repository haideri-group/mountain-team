"use client";

import { useEffect, useState } from "react";
import { Package, TrendingUp, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoButton } from "@/components/shared/info-modal";
import { ReleaseVelocityChart } from "./release-velocity-chart";

interface HealthResponse {
  kpis: {
    onTimePct: number | null;
    avgDaysLate: number | null;
    scopeCreepRate: number;
    shippedCount90d: number;
  };
  velocity: { week: string; count: number }[];
}

export function ReleaseHealthSection() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/releases/health", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load release health (${res.status})`);
        return (await res.json()) as HealthResponse;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold font-mono uppercase tracking-wider">Release health</h2>
        <InfoButton guideKey="releaseHealth" />
      </div>

      {error ? (
        <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-sm">{error}</div>
      ) : !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Kpi
              label="Shipped (90d)"
              value={`${data.kpis.shippedCount90d}`}
              icon={CheckCircle2}
              tone="primary"
            />
            <Kpi
              label="Scope-creep rate"
              value={`${data.kpis.scopeCreepRate}`}
              hint="avg late-added issues per active release"
              icon={TrendingUp}
              tone={data.kpis.scopeCreepRate > 2 ? "warning" : "muted"}
            />
            <Kpi
              label="On-time % (90d)"
              value={data.kpis.onTimePct === null ? "—" : `${data.kpis.onTimePct}%`}
              hint={data.kpis.onTimePct === null ? "Needs due-date snapshots" : undefined}
              icon={Package}
              tone="muted"
            />
          </div>
          <ReleaseVelocityChart data={data.velocity} />
        </>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "warning" | "muted";
  hint?: string;
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-amber-500"
        : "text-muted-foreground";
  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", toneClass)} />
      </div>
      <div className={cn("text-3xl font-bold font-mono", toneClass)}>{value}</div>
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-1">{hint}</p>}
    </div>
  );
}
