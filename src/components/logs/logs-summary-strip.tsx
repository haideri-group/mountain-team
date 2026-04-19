"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Zap } from "lucide-react";
import { BRAND_GRADIENT } from "@/lib/brand";

interface Summary {
  total: number;
  completed: number;
  failed: number;
  running: number;
  activeNow: number;
  stuckOver1h: number;
}

interface Props {
  /** Triggers the bulk reclaim POST and returns how many rows were
   *  actually marked `failed`. A result of 0 means "no rows matched the
   *  1-hour grace window" — surfaced as a toast so the admin knows the
   *  click was processed even when the banner simply clears. */
  onReclaimAll: () => Promise<{ reclaimed: number }>;
  /** Parent increments this on any SSE sync_log change — we refetch the
   *  summary on every bump. */
  refreshTick?: number;
}

function successRate(s: Summary): number {
  if (s.total === 0) return 100;
  return Math.round((s.completed / s.total) * 100);
}

export function LogsSummaryStrip({ onReclaimAll, refreshTick }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  // Two flags so background refreshes (SSE, 60s fallback poll) don't flash
  // the KPI tiles back to "—" while the new data is being fetched.
  const [initialLoading, setInitialLoading] = useState(true);
  const [reclaiming, setReclaiming] = useState(false);
  const [reclaimError, setReclaimError] = useState<string | null>(null);
  const [reclaimToast, setReclaimToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/summary", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSummary(await res.json());
    } catch {
      // keep last-good summary on screen rather than blanking to null
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Event-driven refresh: parent bumps `refreshTick` on any SSE
    // sync_log event. A 60s fallback still runs in case SSE is blocked
    // by an intermediary proxy.
    const handle = setInterval(load, 60_000);
    return () => clearInterval(handle);
  }, [load]);

  useEffect(() => {
    if (refreshTick !== undefined && refreshTick > 0) load();
  }, [refreshTick, load]);

  const handleReclaim = useCallback(async () => {
    setReclaiming(true);
    setReclaimError(null);
    setReclaimToast(null);
    try {
      const { reclaimed } = await onReclaimAll();
      await load();
      // Always toast the outcome, including 0 — otherwise an admin who
      // clicks and sees the banner disappear (or linger) can't tell
      // whether the request ran at all. 0 is the common "nothing was
      // actually > 1h stuck — banner was stale" case.
      setReclaimToast(
        reclaimed === 0
          ? "No runs stuck for more than 1 hour. Summary refreshed."
          : `Reclaimed ${reclaimed} stuck run${reclaimed === 1 ? "" : "s"}.`,
      );
      // Auto-dismiss after 5s.
      setTimeout(() => setReclaimToast(null), 5000);
    } catch (e) {
      setReclaimError(e instanceof Error ? e.message : "Reclaim failed");
    } finally {
      setReclaiming(false);
    }
  }, [onReclaimAll, load]);

  return (
    <div className="rounded-xl bg-card overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-muted/40">
        <Kpi label="Last 24h" value={summary?.total ?? "—"} loading={initialLoading && summary === null} />
        <Kpi
          label="Completed"
          value={summary?.completed ?? "—"}
          loading={initialLoading && summary === null}
          tone="success"
        />
        <Kpi
          label="Failed"
          value={summary?.failed ?? "—"}
          loading={initialLoading && summary === null}
          tone={summary && summary.failed > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Running now"
          value={summary?.activeNow ?? "—"}
          loading={initialLoading && summary === null}
          tone={summary && summary.activeNow > 0 ? "warning" : undefined}
        />
        <Kpi
          label="Success rate"
          value={summary ? `${successRate(summary)}%` : "—"}
          loading={initialLoading && summary === null}
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
            style={{ background: BRAND_GRADIENT }}
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

      {reclaimToast && !reclaimError && (
        <div className="px-5 py-2 bg-emerald-500/15 text-xs text-emerald-700 dark:text-emerald-400">
          {reclaimToast}
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
