"use client";

import { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Zap,
} from "lucide-react";
import { BRAND_GRADIENT } from "@/lib/brand";

interface SyncLogData {
  id: string;
  type: string;
  status: string;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  issueCount: number | null;
  error: string | null;
}

interface BackfillProgress {
  phase:
    | "idle"
    | "preflight"
    | "selecting"
    | "processing"
    | "done"
    | "failed"
    | "deferred";
  message: string;
  issuesTotal: number;
  issuesProcessed: number;
  deploymentsRecorded: number;
  rateLimitRemaining: number | null;
  startedAt: string | null;
  currentJiraKey: string | null;
}

interface DeploymentBackfillPanelProps {
  lastSync: SyncLogData | null;
  unsyncedCount: number;
  totalTracked: number;
}

// Human-readable schedule for the backfill cron. Authoritative schedule
// lives in Cronicle (external config) as `30 */3 * * *` — see
// `src/app/api/cron/deployment-backfill/route.ts` doc comment. Update
// both places together if the cadence changes.
const BACKFILL_SCHEDULE_LABEL = "Every 3h · :30";

function formatTimeAgo(date: string | Date | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatDateTime(date: string | Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const activePhases: BackfillProgress["phase"][] = [
  "preflight",
  "selecting",
  "processing",
];

export function DeploymentBackfillPanel({
  lastSync,
  unsyncedCount,
  totalTracked,
}: DeploymentBackfillPanelProps) {
  const [running, setRunning] = useState(false);
  const [lastSyncData, setLastSyncData] = useState<SyncLogData | null>(lastSync);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // On mount: detect an already-running backfill
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/sync/deployment-backfill?progress=1");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const p = data.progress as BackfillProgress | null;
        if (p && activePhases.includes(p.phase)) {
          setRunning(true);
          setProgress(p);
        }
      } catch {
        /* ignore */
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll progress while running
  useEffect(() => {
    if (!running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const startedAt = Date.now();
    let seenActive = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/sync/deployment-backfill?progress=1");
        if (!res.ok) return;
        const data = await res.json();
        const p = data.progress as BackfillProgress | null;
        setProgress(p);

        if (p && activePhases.includes(p.phase)) seenActive = true;

        if (p && (p.phase === "done" || p.phase === "failed" || p.phase === "deferred")) {
          setRunning(false);
          const statusRes = await fetch("/api/sync/deployment-backfill");
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setLastSyncData(statusData.lastSync);
          }
        } else if (p && p.phase === "idle" && seenActive) {
          setRunning(false);
        } else if (p && p.phase === "idle" && Date.now() - startedAt > 10000) {
          setRunning(false);
        }
      } catch {
        /* ignore */
      }
    };

    const initialDelay = setTimeout(() => {
      poll();
      pollRef.current = setInterval(poll, 1500);
    }, 500);

    return () => {
      clearTimeout(initialDelay);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running]);

  const handleRun = () => {
    setRunning(true);
    setError(null);
    setProgress(null);

    fetch("/api/sync/deployment-backfill", { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Backfill failed");
          setRunning(false);
          return;
        }
        const statusRes = await fetch("/api/sync/deployment-backfill");
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setLastSyncData(statusData.lastSync);
        }
      })
      .catch(() => {
        setError("Failed to connect");
        setRunning(false);
      });
  };

  const progressPct =
    progress && progress.issuesTotal > 0
      ? Math.round((progress.issuesProcessed / progress.issuesTotal) * 100)
      : 0;

  const statusIcon =
    lastSyncData?.status === "completed" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    ) : lastSyncData?.status === "failed" ? (
      <AlertTriangle className="h-4 w-4 text-red-500" />
    ) : lastSyncData?.status === "running" ? (
      <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
    ) : (
      <Clock className="h-4 w-4 text-muted-foreground" />
    );

  const statusLabel =
    lastSyncData?.status === "completed"
      ? "Completed"
      : lastSyncData?.status === "failed"
        ? "Failed"
        : lastSyncData?.status === "running"
          ? "Running"
          : "Never run";

  const statusColor =
    lastSyncData?.status === "completed"
      ? "text-emerald-600 dark:text-emerald-400"
      : lastSyncData?.status === "failed"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  // `totalTracked` and `unsyncedCount` come from two separate COUNT(*) queries
  // in settings/page.tsx. While issues are being ingested, the later query can
  // see newer rows than the earlier one — transiently producing
  // `unsyncedCount > totalTracked`. Compute from an internally consistent
  // bucket sum and clamp synced so the UI never renders negative/>100 values.
  const syncedCount = Math.max(0, totalTracked - unsyncedCount);
  const coverageDenominator = syncedCount + unsyncedCount;
  const coveragePct =
    coverageDenominator > 0
      ? Math.round((syncedCount / coverageDenominator) * 100)
      : 0;

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-5">
        <div>
          <h3 className="text-base font-bold font-mono">Deployment Backfill</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Walks tracked issues and records their GitHub deployments — rate-limit-aware
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-2 px-5 h-9 rounded-full text-sm font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50"
          style={{ background: BRAND_GRADIENT }}
          aria-label={running ? "Deployment backfill running" : "Run deployment backfill now"}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Running..." : "Run Now"}
        </button>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Coverage summary */}
        <div className="rounded-xl bg-muted/15 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
              Coverage
            </span>
            <span className="text-xs font-bold font-mono">
              {coveragePct}% synced
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${coveragePct}%`,
                background: BRAND_GRADIENT,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>{syncedCount.toLocaleString()} synced</span>
            <span>{unsyncedCount.toLocaleString()} remaining</span>
            <span>{totalTracked.toLocaleString()} total tracked</span>
          </div>
        </div>

        {/* Live progress */}
        {running && progress && (
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  {progress.phase === "preflight"
                    ? "Checking rate limit"
                    : progress.phase === "selecting"
                      ? "Selecting queue"
                      : "Processing issues"}
                </span>
              </div>
              {progress.issuesTotal > 0 && (
                <span className="text-xs font-bold font-mono text-blue-700 dark:text-blue-400">
                  {progressPct}%
                </span>
              )}
            </div>

            <p className="text-xs text-blue-600 dark:text-blue-400/80">
              {progress.message}
              {progress.currentJiraKey ? ` — ${progress.currentJiraKey}` : ""}
            </p>

            {progress.phase === "processing" && progress.issuesTotal > 0 && (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progressPct}%`,
                      background: BRAND_GRADIENT,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-blue-600/70 dark:text-blue-400/60">
                  <span>
                    {progress.issuesProcessed} / {progress.issuesTotal} issues
                  </span>
                  <span>
                    {progress.deploymentsRecorded} deployment
                    {progress.deploymentsRecorded === 1 ? "" : "s"} recorded
                  </span>
                  {progress.rateLimitRemaining !== null && (
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {progress.rateLimitRemaining} GH left
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Last run status */}
        {!running && (
          <div className="rounded-xl bg-muted/15 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {statusIcon}
                <span
                  className={`text-xs font-bold font-mono uppercase tracking-wider ${statusColor}`}
                >
                  {statusLabel}
                </span>
              </div>
              {lastSyncData?.completedAt && (
                <span className="text-xs text-muted-foreground font-mono">
                  {formatTimeAgo(lastSyncData.completedAt)}
                </span>
              )}
            </div>

            {lastSyncData && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                    Last Run
                  </p>
                  <p className="text-sm font-mono mt-0.5">
                    {formatDateTime(lastSyncData.completedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                    Issues
                  </p>
                  <p className="text-sm font-mono mt-0.5">
                    {lastSyncData.issueCount ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                    Schedule
                  </p>
                  <p className="text-sm font-mono mt-0.5">{BACKFILL_SCHEDULE_LABEL}</p>
                </div>
              </div>
            )}

            {lastSyncData?.error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-400">
                  {lastSyncData.error}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-700 dark:text-red-400">
                Backfill Failed
              </p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-0.5">
                {error}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
