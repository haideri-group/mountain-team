"use client";

import { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Loader2,
} from "lucide-react";

interface SyncLogData {
  id: string;
  type: string;
  status: string;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  issueCount: number | null;
  error: string | null;
}

interface SyncResult {
  inserted: number;
  updated: number;
  skippedNoBoard: number;
  total: number;
  errors: string[];
}

interface SyncProgress {
  phase: "idle" | "fetching" | "processing" | "done" | "failed";
  message: string;
  issuesFetched: number;
  issuesProcessed: number;
  issuesTotal: number;
}

interface IssueSyncManagerProps {
  lastSync: SyncLogData | null;
}

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
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IssueSyncManager({ lastSync }: IssueSyncManagerProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncData, setLastSyncData] = useState<SyncLogData | null>(lastSync);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll progress while syncing
  useEffect(() => {
    if (syncing) {
      const poll = async () => {
        try {
          const res = await fetch("/api/sync/issues?progress=1");
          if (res.ok) {
            const data = await res.json();
            setProgress(data.progress);
          }
        } catch {
          // ignore poll errors
        }
      };

      poll(); // immediate first poll
      pollRef.current = setInterval(poll, 1000);

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
  }, [syncing]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    setProgress(null);

    try {
      const res = await fetch("/api/sync/issues", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      setSyncResult(data);

      const statusRes = await fetch("/api/sync/issues");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setLastSyncData(statusData.lastSync);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      setProgress(null);
    }
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
          : "Never synced";

  const statusColor =
    lastSyncData?.status === "completed"
      ? "text-emerald-600 dark:text-emerald-400"
      : lastSyncData?.status === "failed"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-5">
        <div>
          <h3 className="text-base font-bold font-mono">Issue Sync</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sync JIRA issues from tracked boards with Frontend label
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-5 h-9 rounded-full text-sm font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #944a00, #ff8400)",
          }}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Syncing..." : "Sync Issues"}
        </button>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Live Progress Bar (shown during sync) */}
        {syncing && progress && (
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  {progress.phase === "fetching"
                    ? "Fetching from JIRA"
                    : progress.phase === "processing"
                      ? "Processing Issues"
                      : "Syncing"}
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
            </p>

            {/* Progress bar */}
            {progress.phase === "processing" && progress.issuesTotal > 0 && (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progressPct}%`,
                      background: "linear-gradient(135deg, #944a00, #ff8400)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-blue-600/70 dark:text-blue-400/60">
                  <span>
                    {progress.issuesProcessed} / {progress.issuesTotal} issues
                  </span>
                  {progress.issuesTotal > 0 && progress.issuesProcessed > 0 && (
                    <span>
                      {progress.issuesTotal - progress.issuesProcessed} remaining
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Indeterminate bar during fetching */}
            {progress.phase === "fetching" && (
              <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
                <div
                  className="h-full w-1/3 rounded-full animate-pulse"
                  style={{
                    background: "linear-gradient(135deg, #944a00, #ff8400)",
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Last Sync Status */}
        {!syncing && (
          <div className="rounded-xl bg-muted/15 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {statusIcon}
                <span
                  className={`text-xs font-bold font-mono uppercase tracking-wider ${statusColor}`}
                >
                  {statusLabel}
                </span>
                {lastSyncData?.type && (
                  <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">
                    ({lastSyncData.type})
                  </span>
                )}
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
                  <p className="text-sm font-mono mt-0.5">Daily 06:05 UTC</p>
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

        {/* Sync Result (after completion) */}
        {syncResult && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Sync Complete
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              {syncResult.inserted > 0 && (
                <span className="text-emerald-700 dark:text-emerald-400">
                  +{syncResult.inserted} new
                </span>
              )}
              {syncResult.updated > 0 && (
                <span className="text-blue-600 dark:text-blue-400">
                  {syncResult.updated} updated
                </span>
              )}
              {syncResult.skippedNoBoard > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {syncResult.skippedNoBoard} skipped (no board)
                </span>
              )}
              <span className="text-muted-foreground">
                {syncResult.total} total
              </span>
            </div>
            {syncResult.errors.length > 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                {syncResult.errors.length} warning(s) during sync
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-700 dark:text-red-400">
                Sync Failed
              </p>
              <p className="text-xs text-red-600 dark:text-red-400/80 mt-0.5">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Config Info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Synced from JIRA boards with &quot;Frontend&quot; label
          </span>
        </div>
      </div>
    </div>
  );
}
