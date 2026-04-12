"use client";

import { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Loader2,
} from "lucide-react";

interface SyncLogData {
  id: string;
  status: string;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  memberCount: number | null;
  error: string | null;
}

interface SyncResult {
  added: number;
  departed: number;
  updated: number;
  rejoined: number;
  unchanged: number;
  total: number;
  errors: string[];
}

interface TeamSyncManagerProps {
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

export function TeamSyncManager({ lastSync }: TeamSyncManagerProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncData, setLastSyncData] = useState<SyncLogData | null>(lastSync);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const res = await fetch("/api/sync/team-members", { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Sync failed");

      setSyncResult(data);

      // Refresh last sync status
      const statusRes = await fetch("/api/sync/team-members");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setLastSyncData(statusData.lastSync);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

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
          <h3 className="text-base font-bold font-mono">Team Sync</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-sync team members from Atlassian Teams API
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
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Last Sync Status */}
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
                  Members
                </p>
                <p className="text-sm font-mono mt-0.5">
                  {lastSyncData.memberCount ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Schedule
                </p>
                <p className="text-sm font-mono mt-0.5">Daily 06:00 UTC</p>
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

        {/* Sync Result (shown after a manual sync) */}
        {syncResult && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Sync Complete
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              {syncResult.added > 0 && (
                <span className="text-emerald-700 dark:text-emerald-400">
                  +{syncResult.added} added
                </span>
              )}
              {syncResult.departed > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  {syncResult.departed} departed
                </span>
              )}
              {syncResult.updated > 0 && (
                <span className="text-blue-600 dark:text-blue-400">
                  {syncResult.updated} updated
                </span>
              )}
              {syncResult.rejoined > 0 && (
                <span className="text-purple-600 dark:text-purple-400">
                  {syncResult.rejoined} rejoined
                </span>
              )}
              <span className="text-muted-foreground">
                {syncResult.unchanged} unchanged
              </span>
            </div>
            {syncResult.errors.length > 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                {syncResult.errors.length} warning(s) during sync
              </p>
            )}
          </div>
        )}

        {/* Error from manual sync */}
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
            <Users className="h-3.5 w-3.5" />
            Synced from Atlassian Teams API
          </span>
        </div>
      </div>
    </div>
  );
}
