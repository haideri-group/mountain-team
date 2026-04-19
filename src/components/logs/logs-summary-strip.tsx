"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Zap } from "lucide-react";

interface Summary {
  total: number;
  completed: number;
  failed: number;
  running: number;
  activeNow: number;
  stuckOver1h: number;
}

interface Props {
  onReclaimAll: () => Promise<void>;
}

function successRate(s: Summary): number {
  if (s.total === 0) return 100;
  return Math.round((s.completed / s.total) * 100);
}

export function LogsSummaryStrip({ onReclaimAll }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reclaiming, setReclaiming] = useState(false);
  const [reclaimError, setReclaimError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/automations/summary", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSummary(await res.json());
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh summary every 30s while the page is open.
    const handle = setInterval(load, 30_000);
    return () => clearInterval(handle);
  }, [load]);

  const handleReclaim = useCallback(async () => {
    setReclaiming(true);
    setReclaimError(null);
    try {
      await onReclaimAll();
      await load();
    } catch (e) {
      setReclaimError(e instanceof Error ? e.message : "Reclaim failed");
    } finally {
      setReclaiming(false);
    }
  }, [onReclaimAll, load]);

  return (
    <div className="rounded-xl bg-card overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-muted/40">
        <Kpi label="Last 24h" value={summary?.total ?? "—"} loading={loading} />
        <Kpi
          label="Completed"
          value={summary?.completed ?? "—"}
          loading={loading}
          tone="success"
        />
        <Kpi
          label="Failed"
          value={summary?.failed ?? "—"}
          loading={loading}
          tone={summary && summary.failed > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Running now"
          value={summary?.activeNow ?? "—"}
          loading={loading}
          tone={summary && summary.activeNow > 0 ? "warning" : undefined}
        />
        <Kpi
          label="Success rate"
          value={summary ? `${successRate(summary)}%` : "—"}
          loading={loading}
        />
      </div>

      {summary && summary.stuckOver1h > 0 && (
        <div className="flex items-center justify-between gap-4 px-5 py-3 bg-amber-500/15">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {summary.stuckOver1h} run
              {summary.stuckOver1h === 1 ? " is" : "s are"} stuck in{" "}
              <span className="font-mono">running</span> for more than 1 hour.
            </span>
          </div>
          <button
            onClick={handleReclaim}
            disabled={reclaiming}
            className="flex items-center gap-1.5 px-4 h-8 rounded-full text-xs font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #944a00, #ff8400)" }}
          >
            <Zap className="h-3 w-3" />
            {reclaiming ? "Reclaiming…" : "Reclaim all stuck"}
          </button>
        </div>
      )}

      {reclaimError && (
        <div className="px-5 py-2 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-400">
          {reclaimError}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number | string;
  loading: boolean;
  tone?: "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : "";
  return (
    <div className="bg-card p-4">
      <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-mono font-bold ${toneClass}`}>
        {loading ? "…" : value}
      </p>
    </div>
  );
}
