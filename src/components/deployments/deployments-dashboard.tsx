"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Rocket,
  Server,
  Globe,
  AlertTriangle,
  Clock,
  Loader2,
  SlidersHorizontal,
  X,
  ChevronDown,
  Check,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusMismatches } from "./status-mismatches";
import { DeploymentPipelineView } from "./deployment-pipeline";
import { PendingReleasesTable } from "./pending-releases-table";
import { RecentDeploymentsFeed } from "./recent-deployments";
import { SiteOverviewTable } from "./site-overview";
import type { DeploymentsData } from "./types";

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isFiltered = value !== "";

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "h-8 px-3 pr-7 rounded-lg text-xs font-mono cursor-pointer relative",
          "transition-all focus:outline-none focus:ring-2 focus:ring-primary/30",
          isFiltered
            ? "bg-primary/10 text-primary font-semibold dark:bg-primary/15"
            : "bg-muted/30 text-foreground hover:bg-muted/50 dark:bg-muted/20 dark:hover:bg-muted/30",
        )}
      >
        {selectedLabel}
        <ChevronDown className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground transition-transform",
          isOpen && "rotate-180",
        )} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] max-h-[240px] overflow-y-auto bg-popover/95 backdrop-blur-xl rounded-lg ring-1 ring-foreground/10 shadow-xl py-1">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              onClick={() => { onChange(o.value); setIsOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-left transition-colors",
                value === o.value ? "bg-primary/10 text-primary font-semibold" : "text-popover-foreground hover:bg-accent/50",
              )}
            >
              <span className={cn("flex items-center justify-center h-3.5 w-3.5 shrink-0", value !== o.value && "invisible")}>
                <Check className="h-3 w-3" />
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <SectionLabel icon={AlertTriangle} count={data.mismatches.length}>
          Attention Required
        </SectionLabel>
        <StatusMismatches mismatches={data.mismatches} />
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
