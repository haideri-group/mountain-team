"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Play,
} from "lucide-react";

interface CronicleEventPublic {
  id: string;
  title: string;
  enabled: boolean;
  urlPath: string;
  timing: {
    hours?: number[];
    minutes?: number[];
    days?: number[];
    weekdays?: number[];
  };
  lastRun: {
    jobId?: string;
    start: number;
    end: number | null;
    status: "success" | "error" | "timeout" | "running";
    elapsed?: number;
  } | null;
  nextRun: number | null;
}

interface Response {
  events: CronicleEventPublic[];
  unavailable: boolean;
  reason?: string;
}

function formatEpoch(sec: number | null): string {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const now = Date.now();
  const diffMin = Math.round((d.getTime() - now) / 60000);
  if (Math.abs(diffMin) < 1) return "just now";
  if (diffMin > 0 && diffMin < 60) return `in ${diffMin}m`;
  if (diffMin > 0 && diffMin < 1440) return `in ${Math.round(diffMin / 60)}h`;
  if (diffMin < 0 && diffMin > -60) return `${-diffMin}m ago`;
  if (diffMin < 0 && diffMin > -1440) return `${Math.round(-diffMin / 60)}h ago`;
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    hour12: true,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTiming(t: CronicleEventPublic["timing"]): string {
  const h = t.hours ?? [];
  const m = t.minutes ?? [];
  if (h.length === 0 || m.length === 0) return "—";
  if (h.length === 1 && m.length === 1) {
    const hh = String(h[0]).padStart(2, "0");
    const mm = String(m[0]).padStart(2, "0");
    return `daily at ${hh}:${mm} UTC`;
  }
  // Multi-hour same-minute pattern (e.g. the 3-hourly backfill)
  if (m.length === 1 && h.length > 1) {
    const mm = String(m[0]).padStart(2, "0");
    return `every ${24 / h.length}h at :${mm} UTC`;
  }
  return `${h.length} × ${m.length} times/day UTC`;
}

function statusIcon(s: string) {
  if (s === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === "error" || s === "timeout") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (s === "running") return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function CronicleSchedulePanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/automations/cronicle/events", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setData({ events: [], unavailable: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handle = setInterval(load, 60_000);
    return () => clearInterval(handle);
  }, [load]);

  const runEvent = useCallback(
    async (eventId: string, title: string) => {
      setRunningIds((r) => ({ ...r, [eventId]: true }));
      setToast(null);
      try {
        const res = await fetch(
          `/api/automations/cronicle/events/${encodeURIComponent(eventId)}/run`,
          { method: "POST" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setToast({ kind: "ok", msg: `Triggered "${title}"` });
        // Refresh the schedule so the new "last run" reflects.
        setTimeout(load, 1500);
      } catch (e) {
        setToast({
          kind: "err",
          msg: e instanceof Error ? e.message : "Failed to trigger",
        });
      } finally {
        setRunningIds((r) => {
          const next = { ...r };
          delete next[eventId];
          return next;
        });
        // Auto-clear toast after 5s
        setTimeout(() => setToast(null), 5000);
      }
    },
    [load],
  );

  return (
    <div className="rounded-xl bg-card overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider">
              Scheduled Crons
            </h2>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            TeamFlow jobs managed by the external scheduler. Click Run to fire one on demand.
          </p>
        </div>
        {data && !data.unavailable && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {data.events.length} job{data.events.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {toast && (
        <div
          className={`px-4 py-2 text-xs ${
            toast.kind === "ok"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {loading && (
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      )}

      {!loading && data?.unavailable && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          The scheduler is not reachable or not configured
          {data.reason ? ` (${data.reason})` : ""}. Check that{" "}
          <span className="font-mono">CRONICLE_BASE_URL</span>,{" "}
          <span className="font-mono">CRONICLE_API_KEY</span>, and{" "}
          <span className="font-mono">CRONICLE_TEAMFLOW_CATEGORY_ID</span> are set in the
          running process&apos;s environment, then restart the dev server / redeploy.
        </div>
      )}

      {!loading && data && !data.unavailable && data.events.length === 0 && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          No jobs found under this category. Check{" "}
          <span className="font-mono">CRONICLE_TEAMFLOW_CATEGORY_ID</span>.
        </div>
      )}

      {!loading && data && data.events.length > 0 && (
        <div className="border-t border-muted/40">
          <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-3 px-4 py-2 text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground bg-muted/20">
            <span>Event</span>
            <span>Schedule</span>
            <span>Last run</span>
            <span>Next run</span>
            <span></span>
          </div>
          {data.events.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1.5fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{e.title}</p>
                <p className="text-[10px] font-mono text-muted-foreground truncate">
                  {e.urlPath || "—"}
                </p>
              </div>
              <span className="hidden md:inline text-xs text-muted-foreground">
                {formatTiming(e.timing)}
              </span>
              <span className="hidden md:flex items-center gap-1.5 text-xs font-mono">
                {e.lastRun ? (
                  <>
                    {statusIcon(e.lastRun.status)}
                    {formatEpoch(e.lastRun.start)}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
              <span className="hidden md:inline text-xs font-mono text-muted-foreground">
                {formatEpoch(e.nextRun)}
              </span>
              <button
                onClick={() => runEvent(e.id, e.title)}
                disabled={!!runningIds[e.id] || !e.enabled}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #944a00, #ff8400)" }}
                title={e.enabled ? "Trigger this cron now via Cronicle" : "Event is disabled in Cronicle"}
              >
                {runningIds[e.id] ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                Run
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
