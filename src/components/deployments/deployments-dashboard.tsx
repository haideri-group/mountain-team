"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Rocket,
  Server,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  SlidersHorizontal,
  X,
  ChevronDown,
  Check,
  ExternalLink,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { DeploymentIndicator } from "@/components/overview/deployment-indicator";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Metrics {
  deploymentsThisWeek: number;
  pendingReleases: number;
  statusMismatches: number;
  avgDaysInStaging: number;
}

interface Mismatch {
  jiraKey: string;
  title: string;
  status: string;
  jiraStatusName: string | null;
  issueType: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
  environment: string;
  siteName: string | null;
  siteLabel: string | null;
  deployedAt: string;
  daysSinceDeployment: number;
  type: "production_not_updated" | "staging_status_behind" | "stuck_rollout";
}

interface PipelineTask {
  jiraKey: string;
  title: string;
  status: string;
  jiraStatusName: string | null;
  issueType: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
  deploymentStatus: "production" | "staging" | null;
  daysInStatus: number;
}

interface PendingRelease {
  jiraKey: string;
  title: string;
  issueType: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
  siteName: string | null;
  siteLabel: string | null;
  stagedAt: string;
  daysPending: number;
}

interface RecentDeployment {
  id: string;
  jiraKey: string;
  issueTitle: string | null;
  environment: string;
  siteName: string | null;
  siteLabel: string | null;
  branch: string;
  prUrl: string | null;
  commitSha: string | null;
  deployedBy: string | null;
  deployedAt: string;
  isHotfix: boolean;
  repoName: string;
  boardKey: string;
  boardColor: string;
}

interface SiteStatus {
  siteName: string;
  siteLabel: string | null;
  latestStaging: { jiraKey: string; deployedAt: string; branch: string } | null;
  latestProduction: { jiraKey: string; deployedAt: string; branch: string } | null;
  lastDeployAt: string | null;
}

interface DeploymentsData {
  metrics: Metrics;
  mismatches: Mismatch[];
  pipeline: {
    readyForTesting: PipelineTask[];
    readyForLive: PipelineTask[];
    rollingOut: PipelineTask[];
    postLiveTesting: PipelineTask[];
  };
  pendingReleases: PendingRelease[];
  recentDeployments: RecentDeployment[];
  siteOverview: SiteStatus[];
  repos: { id: string; fullName: string }[];
  sites: string[];
  boards: { jiraKey: string; name: string; color: string | null }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  const dateOnlyStr = d.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (dateOnlyStr === todayStr) return `Today ${timePart}`;
  if (dateOnlyStr === yesterdayStr) return `Yesterday ${timePart}`;
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "numeric",
    month: "short",
  }) + ` ${timePart}`;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
}

// ─── Filter Dropdown (reused pattern) ────────────────────────────────────────

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

// ─── Pipeline Column ─────────────────────────────────────────────────────────

function PipelineColumn({
  title,
  tasks,
  color,
}: {
  title: string;
  tasks: PipelineTask[];
  color: string;
}) {
  return (
    <div className="flex flex-col min-w-[220px]">
      <div className={cn("flex items-center justify-between px-3 py-2 rounded-t-lg", color)}>
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-foreground">
          {title}
        </span>
        <span className="text-[10px] font-bold font-mono text-foreground/70">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 bg-muted/10 rounded-b-lg p-2 space-y-1.5 min-h-[100px]">
        {tasks.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/50 text-center py-4">No tasks</p>
        ) : (
          tasks.slice(0, 8).map((task) => (
            <Link
              key={task.jiraKey}
              href={`/issue/${task.jiraKey}`}
              className="block bg-card rounded-lg p-2.5 hover:ring-1 hover:ring-primary/20 transition-all space-y-1"
            >
              <div className="flex items-center gap-1.5">
                <IssueTypeIcon type={task.issueType} size={12} />
                <span className="text-[11px] font-bold font-mono" style={{ color: task.boardColor }}>
                  {task.jiraKey}
                </span>
                <DeploymentIndicator status={task.deploymentStatus} />
                {task.daysInStatus >= 3 && (
                  <span className="text-[9px] font-mono text-amber-500 ml-auto">{task.daysInStatus}d</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{task.title}</p>
              {task.assigneeName && (
                <div className="flex items-center gap-1.5">
                  {task.assigneeAvatar ? (
                    <img src={task.assigneeAvatar} alt="" className="h-3.5 w-3.5 rounded-full" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full bg-muted/50 flex items-center justify-center text-[6px] font-bold font-mono text-muted-foreground">
                      {getInitials(task.assigneeName)}
                    </div>
                  )}
                  <span className="text-[9px] text-muted-foreground truncate">{task.assigneeName}</span>
                </div>
              )}
            </Link>
          ))
        )}
        {tasks.length > 8 && (
          <p className="text-[9px] text-muted-foreground text-center">+{tasks.length - 8} more</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DeploymentsDashboard() {
  const [data, setData] = useState<DeploymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ environment: "", repo: "", site: "", board: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.environment) params.set("environment", filters.environment);
      if (filters.repo) params.set("repo", filters.repo);
      if (filters.site) params.set("site", filters.site);
      if (filters.board) params.set("board", filters.board);

      const res = await fetch(`/api/deployments?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // Silent fail
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

      {/* Section 1: Attention Required */}
      {data.mismatches.length > 0 && (
        <div>
          <SectionLabel icon={AlertTriangle} count={data.mismatches.length}>
            Attention Required
          </SectionLabel>
          <div className="space-y-2">
            {data.mismatches.map((m) => (
              <Link
                key={m.jiraKey}
                href={`/issue/${m.jiraKey}`}
                className={cn(
                  "block rounded-xl p-4 transition-all hover:ring-1 hover:ring-foreground/10",
                  m.type === "production_not_updated" ? "bg-red-500/5 ring-1 ring-red-500/10" : "bg-amber-500/5 ring-1 ring-amber-500/10",
                )}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <AlertTriangle className={cn("h-4 w-4 shrink-0", m.type === "production_not_updated" ? "text-red-500" : "text-amber-500")} />
                  <div className="flex items-center gap-1.5">
                    <IssueTypeIcon type={m.issueType} size={14} />
                    <span className="text-sm font-bold font-mono" style={{ color: m.boardColor }}>{m.jiraKey}</span>
                  </div>
                  <span className="text-sm text-foreground truncate flex-1">{m.title}</span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {m.daysSinceDeployment}d ago
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 ml-7 text-[10px] font-mono text-muted-foreground">
                  <span>Status: <strong className="text-foreground">{m.jiraStatusName || m.status}</strong></span>
                  <span>Deployed: <strong className="text-foreground">{m.environment} {m.siteLabel || m.siteName || ""}</strong></span>
                  {m.assigneeName && <span>Assignee: <strong className="text-foreground">{m.assigneeName}</strong></span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.mismatches.length === 0 && (
        <div className="bg-emerald-500/5 ring-1 ring-emerald-500/10 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold font-mono text-emerald-700 dark:text-emerald-400">All Clear</p>
            <p className="text-[10px] text-muted-foreground">No status mismatches detected. All deployed tasks have matching JIRA statuses.</p>
          </div>
        </div>
      )}

      {/* Section 2: Deployment Pipeline */}
      <div>
        <SectionLabel icon={GitBranch} count={totalPipeline}>
          Deployment Pipeline
        </SectionLabel>
        <div className="flex gap-3 overflow-x-auto pb-2">
          <PipelineColumn title="Ready for Testing" tasks={data.pipeline.readyForTesting} color="bg-amber-500/10" />
          <PipelineColumn title="Ready for Live" tasks={data.pipeline.readyForLive} color="bg-orange-500/10" />
          <PipelineColumn title="Rolling Out" tasks={data.pipeline.rollingOut} color="bg-emerald-500/10" />
          <PipelineColumn title="Post Live Testing" tasks={data.pipeline.postLiveTesting} color="bg-blue-500/10" />
        </div>
      </div>

      {/* Section 3: Pending Releases */}
      {data.pendingReleases.length > 0 && (
        <div>
          <SectionLabel icon={Server} count={data.pendingReleases.length}>
            Pending Releases
          </SectionLabel>
          <div className="bg-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-foreground/5">
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Task</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assignee</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Site</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Staged</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingReleases.map((pr, idx) => (
                    <tr key={`${pr.jiraKey}-${pr.siteName}-${idx}`} className="border-b border-foreground/5 last:border-0 hover:bg-muted/10">
                      <td className="px-4 py-2.5">
                        <Link href={`/issue/${pr.jiraKey}`} className="font-bold hover:underline inline-flex items-center gap-1" style={{ color: pr.boardColor }}>
                          <IssueTypeIcon type={pr.issueType} size={12} />
                          {pr.jiraKey}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[250px] truncate">{pr.title}</td>
                      <td className="px-4 py-2.5">
                        {pr.assigneeName ? (
                          <div className="flex items-center gap-1.5">
                            {pr.assigneeAvatar ? (
                              <img src={pr.assigneeAvatar} alt="" className="h-4 w-4 rounded-full" />
                            ) : null}
                            <span className="text-muted-foreground">{pr.assigneeName}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{pr.siteLabel || pr.siteName || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(pr.stagedAt)}</td>
                      <td className={cn(
                        "px-4 py-2.5 text-right font-bold",
                        pr.daysPending >= 8 ? "text-red-500" : pr.daysPending >= 3 ? "text-amber-500" : "text-emerald-500",
                      )}>
                        {pr.daysPending}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: Recent Deployments */}
      <div>
        <SectionLabel icon={Rocket} count={data.recentDeployments.length}>
          Recent Deployments
        </SectionLabel>
        <div className="bg-card rounded-xl divide-y divide-foreground/5">
          {data.recentDeployments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Rocket className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No deployments found</p>
            </div>
          ) : (
            data.recentDeployments.slice(0, 20).map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
                {d.environment === "production" ? (
                  <Globe className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : d.environment === "staging" ? (
                  <Server className="h-4 w-4 text-amber-500 shrink-0" />
                ) : (
                  <GitBranch className="h-4 w-4 text-blue-500 shrink-0" />
                )}

                <Link
                  href={`/issue/${d.jiraKey}`}
                  className="text-xs font-bold font-mono shrink-0 hover:underline inline-flex items-center gap-1"
                  style={{ color: d.boardColor }}
                >
                  {d.jiraKey}
                </Link>

                {d.isHotfix && (
                  <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 uppercase">
                    Hotfix
                  </span>
                )}

                <span className="text-xs text-muted-foreground truncate flex-1">
                  {d.issueTitle || d.branch}
                </span>

                <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
                  {d.siteLabel || d.siteName || d.environment}
                </span>

                {d.deployedBy && (
                  <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                    {d.deployedBy}
                  </span>
                )}

                {d.prUrl && (
                  <a href={d.prUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/30 hover:text-primary transition-colors" />
                  </a>
                )}

                <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-[70px] text-right">
                  {timeAgo(d.deployedAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 5: Site Overview */}
      {data.siteOverview.length > 0 && (
        <div>
          <SectionLabel icon={Globe}>
            Site Overview
          </SectionLabel>
          <div className="bg-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-foreground/5">
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Site</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Staging</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Production</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Last Deploy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.siteOverview.map((site) => (
                    <tr key={site.siteName} className="border-b border-foreground/5 last:border-0">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {site.siteLabel || site.siteName}
                      </td>
                      <td className="px-4 py-3">
                        {site.latestStaging ? (
                          <Link href={`/issue/${site.latestStaging.jiraKey}`} className="text-amber-600 dark:text-amber-400 hover:underline">
                            {site.latestStaging.jiraKey}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {site.latestProduction ? (
                          <Link href={`/issue/${site.latestProduction.jiraKey}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                            {site.latestProduction.jiraKey}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {site.lastDeployAt ? timeAgo(site.lastDeployAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
