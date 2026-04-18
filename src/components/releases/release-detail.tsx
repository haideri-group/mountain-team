"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Package,
  Rocket,
  Server,
  Clock,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReleaseIssueList } from "./release-issue-list";
import { ReleaseStatusSummary } from "./release-status-pill";
import { ReadinessBreakdown } from "./readiness-breakdown";
import { ReleaseBurndownChart } from "./release-burndown-chart";
import { ScopeCreepPanel } from "./scope-creep-panel";
import { ReleaseNotesExport } from "./release-notes-export";
import { PreReleaseChecklist } from "./pre-release-checklist";
import { formatSmartDate } from "@/components/issue/issue-helpers";
import type { ReleaseDetailResponse } from "./types";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No date";
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ReleaseDetail({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<ReleaseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/releases/${releaseId}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) throw new Error("Release not found");
          throw new Error(`Failed to load release (${res.status})`);
        }
        setData(await res.json());
      } catch (err) {
        // Don't clobber a working UI on a silent refresh failure
        if (!opts.silent) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [releaseId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Refetch silently when the tab regains focus. Keeps readiness / issues /
  // deployments fresh if the user leaves the page open while JIRA activity
  // happens elsewhere.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        load({ silent: true });
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground font-mono">Loading release…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Link
          href="/releases"
          className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to releases
        </Link>
        <div className="mx-auto max-w-md mt-8 bg-destructive/10 text-destructive rounded-xl p-6 text-center">
          <p className="text-sm font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { release, issues, deployments, timeline, scopeCreep, isAdmin } = data;
  const total = release.issuesTotal || issues.length;
  const donePct = total > 0 ? Math.round((release.issuesDone / total) * 100) : 0;
  const stagingPct = total > 0 ? Math.round((release.issuesDeployedStaging / total) * 100) : 0;
  const productionPct = total > 0 ? Math.round((release.issuesDeployedProduction / total) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Back */}
      <Link
        href="/releases"
        className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to releases
      </Link>

      {/* Header */}
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                release.released
                  ? "bg-emerald-500/10"
                  : release.overdue
                    ? "bg-amber-500/10"
                    : "bg-primary/10",
              )}
            >
              {release.released ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : (
                <Package className={cn("h-6 w-6", release.overdue ? "text-amber-500" : "text-primary")} />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold font-mono">{release.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-muted-foreground">
                <span>{release.projectKey}</span>
                <span>·</span>
                <span>
                  {release.released
                    ? `Released ${formatDate(release.releaseDate)}`
                    : release.releaseDate
                      ? `Due ${formatDate(release.releaseDate)}`
                      : "No date set"}
                </span>
                {release.ownerName && (
                  <>
                    <span>·</span>
                    <span>Owner: {release.ownerName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 min-w-[220px]">
            <ReleaseStatusSummary
              status={release.readiness.status}
              reason={release.readiness.reason}
              projectedShipDate={release.readiness.projectedShipDate}
              projectedDaysVsDue={release.readiness.projectedDaysVsDue}
              dueDate={release.releaseDate}
              released={release.released}
            />
            <ReadinessBreakdown readiness={release.readiness} />
            {release.archived && <StatusPill tone="muted">Archived</StatusPill>}
          </div>
        </div>

        {release.description && (
          <p className="mt-4 text-sm text-muted-foreground max-w-3xl">{release.description}</p>
        )}
      </div>

      {/* Progress grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProgressTile
          label="Completion"
          stat={`${release.issuesDone}/${total}`}
          percent={donePct}
          barClass="bg-emerald-500"
          icon={CheckCircle2}
          iconClass="text-emerald-500"
        />
        <ProgressTile
          label="Staging coverage"
          stat={`${release.issuesDeployedStaging}/${total}`}
          percent={stagingPct}
          barClass="bg-amber-500"
          icon={Server}
          iconClass="text-amber-500"
        />
        <ProgressTile
          label="Production coverage"
          stat={`${release.issuesDeployedProduction}/${total}`}
          percent={productionPct}
          barClass="bg-emerald-500"
          icon={Rocket}
          iconClass="text-emerald-500"
        />
      </div>

      {/* Timeline */}
      <div className="bg-card rounded-xl p-5">
        <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70 mb-4">
          Timeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <TimelineNode label="Release created" when={timeline.createdAt} />
          <TimelineNode label="First staging" when={timeline.firstStagingAt} />
          <TimelineNode label="First production" when={timeline.firstProductionAt} />
          <TimelineNode label="Last synced" when={release.lastSyncedAt} muted />
        </div>
      </div>

      {/* Burndown + scope creep side-by-side (Phase B) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReleaseBurndownChart releaseId={release.id} />
        <ScopeCreepPanel entries={scopeCreep} />
      </div>

      {/* Checklist + notes side-by-side (Phase C) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PreReleaseChecklist releaseId={release.id} isAdmin={isAdmin} />
        <ReleaseNotesExport releaseId={release.id} />
      </div>

      {/* Issues */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Issues in this release
          </h2>
          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
            {issues.length}
          </span>
        </div>
        <ReleaseIssueList issues={issues} />
      </div>

      {/* Deployment log */}
      {deployments.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
              Deployment log
            </h2>
            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
              {deployments.length}
            </span>
          </div>
          <div className="bg-card rounded-xl divide-y divide-foreground/5">
            {deployments.slice(0, 50).map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/5 transition-colors"
              >
                {d.environment === "staging" ? (
                  <Server className="h-3 w-3 text-amber-500 shrink-0" />
                ) : (
                  <Rocket className="h-3 w-3 text-emerald-500 shrink-0" />
                )}
                <Link
                  href={`/issue/${d.jiraKey}`}
                  className="text-[11px] font-bold font-mono shrink-0 hover:underline text-foreground"
                >
                  {d.jiraKey}
                </Link>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {d.siteLabel || d.environment}
                </span>
                <div className="hidden md:flex items-center gap-1 text-[10px] font-mono text-muted-foreground/70 flex-1 min-w-0">
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">{d.branch}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                  {formatSmartDate(d.deployedAt)}
                </span>
              </div>
            ))}
          </div>
          {deployments.length > 50 && (
            <p className="text-[10px] font-mono text-muted-foreground/60 mt-2 text-center">
              Showing latest 50 of {deployments.length} deployments.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: "success" | "warning" | "primary" | "muted" }) {
  const classes =
    tone === "success"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : tone === "primary"
          ? "bg-primary/10 text-primary"
          : "bg-muted/30 text-muted-foreground";
  return (
    <span
      className={cn(
        "text-[10px] font-bold font-mono uppercase tracking-wider px-2 py-1 rounded-full",
        classes,
      )}
    >
      {children}
    </span>
  );
}

function ProgressTile({
  label,
  stat,
  percent,
  barClass,
  icon: Icon,
  iconClass,
}: {
  label: string;
  stat: string;
  percent: number;
  barClass: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}) {
  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", iconClass)} />
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold font-mono">{stat}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function TimelineNode({ label, when, muted }: { label: string; when: string | null; muted?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Clock className={cn("h-3 w-3", muted ? "text-muted-foreground/40" : "text-muted-foreground")} />
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60">
          {label}
        </span>
      </div>
      <p className={cn("text-xs font-mono", muted ? "text-muted-foreground/60" : "text-foreground")}>
        {when ? formatSmartDate(when) : "—"}
      </p>
    </div>
  );
}
