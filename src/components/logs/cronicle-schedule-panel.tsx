"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/logs/cronicle/events", { cache: "no-store" });
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

  return (
    <div className="rounded-xl bg-card overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider">
            Cronicle Schedule
          </h2>
        </div>
        {data && !data.unavailable && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {data.events.length} TeamFlow event{data.events.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading && (
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      )}

      {!loading && data?.unavailable && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          Cronicle is not reachable or not configured
          {data.reason ? ` (${data.reason})` : ""}. The rest of the page still works using
          app-side sync records.
        </div>
      )}

      {!loading && data && !data.unavailable && data.events.length === 0 && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          No events in the TeamFlow Cronicle category. Check{" "}
          <span className="font-mono">CRONICLE_TEAMFLOW_CATEGORY_ID</span>.
        </div>
      )}

      {!loading && data && data.events.length > 0 && (
        <div className="border-t border-muted/40">
          <div className="hidden md:grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-3 px-4 py-2 text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground bg-muted/20">
            <span>Event</span>
            <span>Schedule</span>
            <span>Last run</span>
            <span>Next run</span>
          </div>
          {data.events.map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-[1fr] md:grid-cols-[2fr_1.5fr_1fr_1fr] gap-3 px-4 py-3 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm truncate">{e.title}</p>
                <p className="text-[10px] font-mono text-muted-foreground truncate">
                  {e.urlPath || "—"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{formatTiming(e.timing)}</span>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
