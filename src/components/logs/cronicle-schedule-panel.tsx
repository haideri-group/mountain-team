"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND_GRADIENT } from "@/lib/brand";
import { APP_TIMEZONE } from "@/lib/config";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Play,
} from "lucide-react";

interface CronicleRunProgress {
  phase: string;
  message: string;
  processed: number | null;
  total: number | null;
  pct: number | null;
  etaSeconds: number | null;
}

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
    statusSource: "app" | "cronicle";
    elapsed?: number;
    syncLogId: string | null;
    cronicleJobStatus: "success" | "error" | "timeout" | "running" | null;
    jobDetailsUrl: string | null;
    progress: CronicleRunProgress | null;
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
    timeZone: APP_TIMEZONE,
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
  // Shared re-entrancy guard. Every refresh path — 60s fallback,
  // 1s-while-running poll, `refreshTick` bump, and the post-Run Now
  // timeouts — calls through `load()`, so one guard here covers all of
  // them. Without it, slow responses from the cronicle events route can
  // stack multiple in-flight `fetch`es whose `setData` resolves out of
  // order and overwrites newer data with stale data.
  const isLoadingRef = useRef(false);

  const load = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      const res = await fetch("/api/automations/cronicle/events", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      // Only clobber data if we don't already have it — avoid flipping from
      // "shows jobs" to "unavailable" on a transient blip.
      setData((prev) => prev ?? { events: [], unavailable: true });
    } finally {
      isLoadingRef.current = false;
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
  //
  // Gated on `!data.unavailable` so a Cronicle outage (where stale events
  // with status="running" linger in cache) doesn't hammer the API every
  // second; we fall back to the 60s poll until Cronicle recovers.
  //
  // Self-scheduling setTimeout (instead of setInterval) — awaits each
  // `load()` before queueing the next tick so slow responses can't stack
  // up concurrent fetches that resolve out of order and overwrite newer
  // state with stale data.
  const anyRunning =
    !data?.unavailable &&
    (data?.events ?? []).some((e) => e.lastRun?.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      await load();
      if (!cancelled) timer = setTimeout(tick, 1000);
    };

    timer = setTimeout(tick, 1000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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
  progress: CronicleRunProgress;
}

function formatEta(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Map a runner's raw phase key to a user-facing title. Same wording
 *  the Settings-page sync panel uses, for consistency across surfaces. */
function phaseTitle(phase: string): string {
  switch (phase) {
    case "fetching":
      return "Fetching from JIRA";
    case "processing":
      return "Processing";
    case "preflight":
      return "Preflight Checks";
    case "selecting":
      return "Selecting Work";
    case "running":
      return "Running";
    case "done":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return phase.charAt(0).toUpperCase() + phase.slice(1);
  }
}

/**
 * Rich inline progress panel under the running event title — same shape
 * as the Settings page's live-sync panel: spinner + phase title + pct
 * on one row, wrapping message on the next, then a thicker bar, then
 * counts + ETA. Appears only while `status === "running"`.
 */
function RunningProgress({ progress }: RunningProgressProps) {
  const { processed, total, pct, phase, message, etaSeconds } = progress;
  const hasCounts = processed !== null && total !== null && total > 0;
  const determinate = pct !== null;
  const remaining =
    hasCounts && processed !== null && total !== null
      ? total - processed
      : null;
  return (
    <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2.5 space-y-1.5">
      {/* Header: spinner + phase title (+ pct) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Loader2 className="h-3 w-3 text-amber-500 animate-spin shrink-0" />
          <span className="text-[10px] font-bold font-mono uppercase tracking-wider truncate">
            {phaseTitle(phase)}
          </span>
        </div>
        {determinate && (
          <span className="text-[10px] font-bold font-mono shrink-0">
            {pct}%
          </span>
        )}
      </div>

      {/* Wrapping message (the "Fetching details: 7 / 14" kind) */}
      {message && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {message}
        </p>
      )}

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
        {determinate ? (
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${pct}%`,
              background: BRAND_GRADIENT,
            }}
          />
        ) : (
          <div
            className="h-full w-1/3 rounded-full animate-progress-marquee motion-reduce:animate-none motion-reduce:mx-auto"
            style={{ background: BRAND_GRADIENT }}
          />
        )}
      </div>

      {/* Footer: counts on the left, remaining + ETA on the right */}
      {(hasCounts || (etaSeconds !== null && etaSeconds > 0)) && (
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
          {hasCounts ? (
            <span>
              {processed!.toLocaleString()} / {total!.toLocaleString()}
            </span>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-2">
            {remaining !== null && remaining > 0 && (
              <span>{remaining.toLocaleString()} remaining</span>
            )}
            {etaSeconds !== null && etaSeconds > 0 && (
              <span>~{formatEta(etaSeconds)} left</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
