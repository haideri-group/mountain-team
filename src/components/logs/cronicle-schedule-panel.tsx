"use client";

import { useCallback, useEffect, useState } from "react";
import { BRAND_GRADIENT } from "@/lib/brand";
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
    syncLogId: string | null;
    jobDetailsUrl: string | null;
    progress: {
      phase: string;
      message: string;
      processed: number | null;
      total: number | null;
      pct: number | null;
    } | null;
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
  const h = [...(t.hours ?? [])].sort((a, b) => a - b);
  const m = [...(t.minutes ?? [])].sort((a, b) => a - b);
  if (h.length === 0 || m.length === 0) return "—";
  if (h.length === 1 && m.length === 1) {
    const hh = String(h[0]).padStart(2, "0");
    const mm = String(m[0]).padStart(2, "0");
    return `daily at ${hh}:${mm} UTC`;
  }
  // Multi-hour same-minute pattern — only valid as "every Nh" when the
  // hours are uniformly spaced. `[1, 2]` is NOT every 12h; `[0, 3, 6, 9,
  // 12, 15, 18, 21]` IS every 3h. Check the step set; fall back to the
  // explicit list if non-uniform.
  if (m.length === 1 && h.length > 1) {
    const mm = String(m[0]).padStart(2, "0");
    const steps = new Set(h.slice(1).map((hour, i) => hour - h[i]));
    const uniformStep = steps.size === 1 ? [...steps][0] : null;
    if (uniformStep !== null && (24 / uniformStep) === h.length) {
      return `every ${uniformStep}h at :${mm} UTC`;
    }
    // Explicit list: "01:00, 02:00 UTC"
    return h.map((hh) => `${String(hh).padStart(2, "0")}:${mm}`).join(", ") + " UTC";
  }
  return `${h.length} × ${m.length} times/day UTC`;
}

function statusIcon(s: string) {
  if (s === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === "error" || s === "timeout") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (s === "running") return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

interface Props {
  onViewRun?: (syncLogId: string) => void;
  /** Parent increments this on any SSE sync_log change — we refetch the
   *  schedule on every bump so last-run icons update instantly. */
  refreshTick?: number;
}

export function CronicleSchedulePanel({ onViewRun, refreshTick }: Props = {}) {
  const [data, setData] = useState<Response | null>(null);
  // Only gate on initialLoading; background refreshes keep the existing
  // `data` visible so the panel doesn't blank to "Loading…" every SSE event.
  const [initialLoading, setInitialLoading] = useState(true);
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "warn"; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/cronicle/events", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      // Only clobber data if we don't already have it — avoid flipping from
      // "shows jobs" to "unavailable" on a transient blip.
      setData((prev) => prev ?? { events: [], unavailable: true });
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // 60s fallback poll in case the SSE stream is blocked / dropped.
    const handle = setInterval(load, 60_000);
    return () => clearInterval(handle);
  }, [load]);

  useEffect(() => {
    if (refreshTick !== undefined && refreshTick > 0) load();
  }, [refreshTick, load]);

  // Fast 1s poll while ANY event is mid-run. Progress bars advance in
  // near-real-time without the 60s fallback latency. Interval clears
  // itself as soon as every event is idle again.
  const anyRunning = (data?.events ?? []).some(
    (e) => e.lastRun?.status === "running",
  );
  useEffect(() => {
    if (!anyRunning) return;
    const h = setInterval(load, 1000);
    return () => clearInterval(h);
  }, [anyRunning, load]);

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
        if (res.status === 409) {
          // Concurrency guard: another run is already in flight.
          setToast({
            kind: "warn",
            msg:
              body.error ||
              `"${title}" is already running — your click was ignored.`,
          });
          return;
        }
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setToast({ kind: "ok", msg: `Triggered "${title}"` });
        // Brief burst of refreshes so both "running" and "completed"
        // states surface promptly: 2s (Cronicle registers the job),
        // 6s and 12s (catches fast jobs like Team Sync ~2-10s). Normal
        // 60s interval picks up longer-running jobs.
        setTimeout(load, 2000);
        setTimeout(load, 6000);
        setTimeout(load, 12_000);
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
              : toast.kind === "warn"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {initialLoading && data === null && (
        <div className="p-4 text-sm text-muted-foreground">Loading…</div>
      )}

      {!initialLoading && data?.unavailable && data.events.length === 0 && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          The scheduler is not reachable or not configured
          {data.reason ? ` (${data.reason})` : ""}. Check that{" "}
          <span className="font-mono">CRONICLE_BASE_URL</span>,{" "}
          <span className="font-mono">CRONICLE_API_KEY</span>, and{" "}
          <span className="font-mono">CRONICLE_TEAMFLOW_CATEGORY_ID</span> are set in the
          running process&apos;s environment, then restart the dev server / redeploy.
        </div>
      )}

      {!initialLoading && data?.unavailable && data.events.length > 0 && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px]">
          Scheduler unreachable — showing last-known data. Last-run / next-run
          timestamps may be stale.
        </div>
      )}

      {data && !data.unavailable && data.events.length === 0 && (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          No jobs found under this category. Check{" "}
          <span className="font-mono">CRONICLE_TEAMFLOW_CATEGORY_ID</span>.
        </div>
      )}

      {data && data.events.length > 0 && (
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
                {e.lastRun?.status === "running" && e.lastRun.progress && (
                  <RunningProgress progress={e.lastRun.progress} />
                )}
              </div>
              <span className="hidden md:inline text-xs text-muted-foreground">
                {formatTiming(e.timing)}
              </span>
              {e.lastRun?.syncLogId && onViewRun ? (
                <button
                  type="button"
                  onClick={() => onViewRun(e.lastRun!.syncLogId!)}
                  className="hidden md:flex items-center gap-1.5 text-xs font-mono text-left hover:text-[#ff8400] hover:underline underline-offset-4 decoration-dotted transition-colors"
                  title="View full run details"
                >
                  {statusIcon(e.lastRun.status)}
                  {formatEpoch(e.lastRun.start)}
                </button>
              ) : e.lastRun?.jobDetailsUrl ? (
                /* No app-side sync_logs row — likely Cronicle couldn't reach
                   TeamFlow (DNS / network error) so no handler ran. Link to
                   the Cronicle job details page in a new tab instead. */
                <a
                  href={e.lastRun.jobDetailsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden md:flex items-center gap-1.5 text-xs font-mono text-left hover:text-[#ff8400] hover:underline underline-offset-4 decoration-dotted transition-colors"
                  title="No app-side record — open Cronicle job details"
                >
                  {statusIcon(e.lastRun.status)}
                  {formatEpoch(e.lastRun.start)}
                </a>
              ) : (
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
              )}
              <span className="hidden md:inline text-xs font-mono text-muted-foreground">
                {formatEpoch(e.nextRun)}
              </span>
              <button
                onClick={() => runEvent(e.id, e.title)}
                disabled={!!runningIds[e.id] || !e.enabled}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50"
                style={{ background: BRAND_GRADIENT }}
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

interface RunningProgressProps {
  progress: {
    phase: string;
    message: string;
    processed: number | null;
    total: number | null;
    pct: number | null;
  };
}

/**
 * Inline progress bar shown under a running event's title. Two modes:
 *   - Determinate: `pct` is 0–100, bar fills to that value.
 *   - Indeterminate: `pct` is null (total unknown yet) — renders an
 *     animated stripe so the admin knows something is happening even
 *     before total count is available.
 */
function RunningProgress({ progress }: RunningProgressProps) {
  const { processed, total, pct, phase, message } = progress;
  const hasCounts = processed !== null && total !== null && total > 0;
  const determinate = pct !== null;
  const label = hasCounts
    ? `${processed!.toLocaleString()} / ${total!.toLocaleString()}${determinate ? ` · ${pct}%` : ""}`
    : message || phase;
  return (
    <div className="mt-1.5 space-y-1">
      <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
        {determinate ? (
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${pct}%`,
              background: BRAND_GRADIENT,
            }}
          />
        ) : (
          // Indeterminate: narrow brand pill slides left-to-right
          // continuously. Keyframes live in globals.css so the component
          // stays declarative; `motion-reduce:animate-none` respects OS
          // "reduce motion" accessibility preference.
          <div
            className="h-full w-1/3 rounded-full animate-progress-marquee motion-reduce:animate-none motion-reduce:mx-auto"
            style={{ background: BRAND_GRADIENT }}
          />
        )}
      </div>
      <p className="text-[10px] font-mono text-muted-foreground truncate">
        {label}
      </p>
    </div>
  );
}
