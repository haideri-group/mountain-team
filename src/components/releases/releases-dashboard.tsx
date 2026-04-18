"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Package, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterSelect } from "@/components/shared/filter-select";
import { ReleaseOverviewCard } from "./release-overview-card";
import { OffReleaseFeed } from "./off-release-feed";
import type { ReleasesListResponse, OffReleaseResponse } from "./types";

type StatusFilter = "unreleased" | "released" | "all";

export function ReleasesDashboard() {
  const [list, setList] = useState<ReleasesListResponse | null>(null);
  const [offRelease, setOffRelease] = useState<OffReleaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("unreleased");
  const [project, setProject] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status });
      if (project) params.set("project", project);
      const [listRes, offRes] = await Promise.all([
        fetch(`/api/releases?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/releases/off-release?days=30", { cache: "no-store" }),
      ]);
      if (!listRes.ok) throw new Error(`Failed to load releases (${listRes.status})`);
      if (!offRes.ok) throw new Error(`Failed to load off-release feed (${offRes.status})`);
      setList(await listRes.json());
      setOffRelease(await offRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [status, project]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !list) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground font-mono">Loading releases…</span>
      </div>
    );
  }

  if (error && !list) {
    return (
      <div className="mx-auto max-w-md mt-16 bg-destructive/10 text-destructive rounded-xl p-6 text-center">
        <p className="text-sm font-medium mb-3">{error}</p>
        <button
          type="button"
          onClick={load}
          className="text-xs font-bold font-mono uppercase tracking-wider px-4 py-2 rounded-lg bg-destructive text-destructive-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  const m = list?.metrics;

  return (
    <div className="p-6 space-y-8">
      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi
          label="Active releases"
          value={m?.activeReleases ?? 0}
          icon={Package}
          tone="primary"
        />
        <Kpi
          label="Scope creep (30d)"
          value={m?.scopeCreepCount ?? 0}
          icon={TrendingUp}
          tone={m && m.scopeCreepCount > 0 ? "warning" : "muted"}
          hint={m && m.scopeCreepCount > 0 ? "Issues added after release start" : undefined}
        />
        <Kpi
          label="Off-release deploys (7d)"
          value={m?.offReleaseDeploys7d ?? 0}
          icon={AlertTriangle}
          tone={m && m.offReleaseDeploys7d > 0 ? "warning" : "muted"}
          hint="Hotfix + untagged + orphan"
        />
      </div>

      {/* Filters + In Release */}
      <div>
        <SectionHeader
          title="In Release"
          count={list?.releases.length ?? 0}
          right={
            <div className="flex items-center gap-2">
              <FilterSelect
                value={status}
                onChange={(v) => setStatus(v as StatusFilter)}
                options={[
                  { value: "unreleased", label: "Unreleased" },
                  { value: "released", label: "Released" },
                  { value: "all", label: "All" },
                ]}
              />
              <FilterSelect
                value={project}
                onChange={setProject}
                options={[
                  { value: "", label: "All projects" },
                  ...((list?.projects ?? []).map((p) => ({ value: p, label: p }))),
                ]}
              />
            </div>
          }
        />

        {list && list.releases.length === 0 ? (
          <div className="bg-card rounded-xl p-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No {status === "all" ? "" : status} releases
              {project ? ` in ${project}` : ""}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {list?.releases.map((r) => (
              <ReleaseOverviewCard key={r.id} release={r} />
            ))}
          </div>
        )}
      </div>

      {/* Off Release section */}
      <div>
        <SectionHeader
          title="Deployed outside a release"
          count={offRelease?.counts.total ?? 0}
          hint="Hotfixes, untagged tasks, and orphan deployments — the visibility gap between what JIRA tracks and what we actually shipped."
        />
        <OffReleaseFeed data={offRelease} loading={loading} />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "warning" | "muted";
  hint?: string;
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-amber-500"
        : "text-muted-foreground";

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60">
          {label}
        </span>
        <Icon className={cn("h-4 w-4", toneClass)} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-3xl font-bold font-mono", toneClass)}>{value}</span>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-1">{hint}</p>}
    </div>
  );
}

function SectionHeader({
  title,
  count,
  right,
  hint,
}: {
  title: string;
  count: number;
  right?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">{title}</h2>
          {count > 0 && (
            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {right}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-1">{hint}</p>}
    </div>
  );
}
