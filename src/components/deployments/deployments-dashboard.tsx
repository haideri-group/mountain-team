"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Rocket,
  Server,
  Globe,
  AlertTriangle,
  Clock,
  Loader2,
  SlidersHorizontal,
  X,
  GitBranch,
  EyeOff,
} from "lucide-react";
import { FilterSelect } from "@/components/shared/filter-select";
import { StatusMismatches } from "./status-mismatches";
import { MismatchFilterPills } from "./mismatch-filter-pills";
import { DeploymentPipelineView } from "./deployment-pipeline";
import { PendingReleasesTable } from "./pending-releases-table";
import { RecentDeploymentsFeed } from "./recent-deployments";
import { SiteOverviewTable } from "./site-overview";
import type { DeploymentsData, Mismatch } from "./types";

// ─── Section Label ───────────────────────────────────────────────────────────

function SectionLabel({ children, icon: Icon, count }: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-muted/30" />
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export function DeploymentsDashboard() {
  const [data, setData] = useState<DeploymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ environment: "", repo: "", site: "", board: "" });
  const [hiddenMismatchTypes, setHiddenMismatchTypes] = useState<Set<Mismatch["type"]>>(new Set());

  const mismatches = data?.mismatches;
  const mismatchTypeCounts = useMemo(() => {
    const counts = new Map<Mismatch["type"], number>();
    if (!mismatches) return counts;
    for (const m of mismatches) counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
    return counts;
  }, [mismatches]);
  const visibleMismatches = useMemo(
    () => (mismatches ?? []).filter((m) => !hiddenMismatchTypes.has(m.type)),
    [mismatches, hiddenMismatchTypes],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (filters.environment) params.set("environment", filters.environment);
      if (filters.repo) params.set("repo", filters.repo);
      if (filters.site) params.set("site", filters.site);
      if (filters.board) params.set("board", filters.board);

      const res = await fetch(`/api/deployments?${params}`);
      if (res.ok) {
        setData(await res.json());
      } else if (res.status !== 401) {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Loading deployments...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <p className="text-sm text-destructive">Failed to load deployment data</p>
        <button type="button" onClick={fetchData} className="text-sm text-primary font-semibold hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasFilters = Object.values(filters).some((v) => v !== "");
  const totalPipeline = data.pipeline.readyForTesting.length + data.pipeline.readyForLive.length +
    data.pipeline.rollingOut.length + data.pipeline.postLiveTesting.length;

  const allMismatchesHidden =
    data.mismatches.length > 0 && visibleMismatches.length === 0;

  const toggleMismatchType = (type: Mismatch["type"]) =>
    setHiddenMismatchTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-mono">Deployments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track task deployments across staging and production environments
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
        <FilterSelect
          value={filters.environment}
          onChange={(v) => setFilters((f) => ({ ...f, environment: v }))}
          options={[
            { value: "", label: "All Environments" },
            { value: "staging", label: "Staging" },
            { value: "production", label: "Production" },
          ]}
        />
        {data.repos.length > 1 && (
          <FilterSelect
            value={filters.repo}
            onChange={(v) => setFilters((f) => ({ ...f, repo: v }))}
            options={[
              { value: "", label: "All Repos" },
              ...data.repos.map((r) => ({ value: r.fullName, label: r.fullName.split("/")[1] })),
            ]}
          />
        )}
        {data.sites.length > 1 && (
          <FilterSelect
            value={filters.site}
            onChange={(v) => setFilters((f) => ({ ...f, site: v }))}
            options={[
              { value: "", label: "All Sites" },
              ...data.sites.map((s) => ({ value: s, label: s })),
            ]}
          />
        )}
        <FilterSelect
          value={filters.board}
          onChange={(v) => setFilters((f) => ({ ...f, board: v }))}
          options={[
            { value: "", label: "All Boards" },
            ...data.boards.map((b) => ({ value: b.jiraKey, label: `${b.jiraKey} — ${b.name}` })),
          ]}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={() => setFilters({ environment: "", repo: "", site: "", board: "" })}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Deployments This Week", value: String(data.metrics.deploymentsThisWeek), icon: Rocket },
          { label: "Pending Releases", value: String(data.metrics.pendingReleases), icon: Clock, color: data.metrics.pendingReleases > 0 ? "text-amber-500" : "" },
          { label: "Status Mismatches", value: String(data.metrics.statusMismatches), icon: AlertTriangle, color: data.metrics.statusMismatches > 0 ? "text-red-500" : "" },
          { label: "Avg Days in Staging", value: `${data.metrics.avgDaysInStaging}d`, icon: Server },
        ].map((card) => (
          <div key={card.label} className="bg-card rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                {card.label}
              </p>
            </div>
            <p className={`text-2xl font-bold font-mono ${card.color || ""}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Attention Required */}
      <div>
        <SectionLabel icon={AlertTriangle} count={visibleMismatches.length}>
          Attention Required
        </SectionLabel>
        <MismatchFilterPills
          counts={mismatchTypeCounts}
          hiddenTypes={hiddenMismatchTypes}
          onToggle={toggleMismatchType}
          onReset={() => setHiddenMismatchTypes(new Set())}
        />
        {allMismatchesHidden ? (
          <div className="bg-card rounded-xl p-5 flex items-center gap-3">
            <EyeOff className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold font-mono text-foreground">All types hidden</p>
              <p className="text-[10px] text-muted-foreground">
                {data.mismatches.length} alert{data.mismatches.length === 1 ? "" : "s"} filtered out by type. Re-enable a pill above or
                <button
                  type="button"
                  onClick={() => setHiddenMismatchTypes(new Set())}
                  className="text-primary font-semibold hover:underline ml-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  show all
                </button>
                .
              </p>
            </div>
          </div>
        ) : (
          <StatusMismatches mismatches={visibleMismatches} />
        )}
      </div>

      {/* Deployment Pipeline */}
      <div>
        <SectionLabel icon={GitBranch} count={totalPipeline}>
          Deployment Pipeline
        </SectionLabel>
        <DeploymentPipelineView pipeline={data.pipeline} />
      </div>

      {/* Pending Releases */}
      {data.pendingReleases.length > 0 && (
        <div>
          <SectionLabel icon={Server} count={data.pendingReleases.length}>
            Pending Releases
          </SectionLabel>
          <PendingReleasesTable releases={data.pendingReleases} />
        </div>
      )}

      {/* Recent Deployments */}
      <div>
        <SectionLabel icon={Rocket} count={data.recentDeployments.length}>
          Recent Deployments
        </SectionLabel>
        <RecentDeploymentsFeed deployments={data.recentDeployments} />
      </div>

      {/* Site Overview */}
      {data.siteOverview.length > 0 && (
        <div>
          <SectionLabel icon={Globe}>
            Site Overview
          </SectionLabel>
          <SiteOverviewTable sites={data.siteOverview} />
        </div>
      )}
    </div>
  );
}
