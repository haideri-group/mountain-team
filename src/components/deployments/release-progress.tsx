"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Rocket,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import type { Release } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No date";
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00Z`);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Release Card ────────────────────────────────────────────────────────────

function ReleaseCard({ release }: { release: Release }) {
  const [expanded, setExpanded] = useState(false);

  const days = daysUntil(release.releaseDate);
  const totalIssues = release.issuesTotal || release.issues.length;
  const donePercent = totalIssues > 0 ? Math.round((release.issuesDone / totalIssues) * 100) : 0;
  const stagingPercent = totalIssues > 0 ? Math.round((release.issuesDeployedStaging / totalIssues) * 100) : 0;
  const productionPercent = totalIssues > 0 ? Math.round((release.issuesDeployedProduction / totalIssues) * 100) : 0;

  // Determine if this is FE or BE release
  const isFE = release.name.toLowerCase().includes("fe ");
  const isBE = release.name.toLowerCase().includes("be ");

  return (
    <div className={cn(
      "bg-card rounded-xl overflow-hidden",
      release.overdue && !release.released && "ring-1 ring-amber-500/20",
    )}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
              release.released ? "bg-emerald-500/10" : release.overdue ? "bg-amber-500/10" : "bg-primary/10",
            )}>
              {release.released ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Package className={cn("h-4 w-4", release.overdue ? "text-amber-500" : "text-primary")} />
              )}
            </div>
            <div>
              <h4 className="text-sm font-bold font-mono">{release.name}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                {(isFE || isBE) && (
                  <span className={cn(
                    "text-[8px] font-bold font-mono px-1.5 py-0.5 rounded-full uppercase",
                    isFE ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                  )}>
                    {isFE ? "Frontend" : "Backend"}
                  </span>
                )}
                <span className="text-[10px] font-mono text-muted-foreground">
                  {release.projectKey}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right">
            {release.released ? (
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                Released {formatDate(release.releaseDate)}
              </span>
            ) : release.releaseDate ? (
              <div>
                <span className={cn(
                  "text-[10px] font-mono font-bold",
                  release.overdue ? "text-amber-500" : days !== null && days <= 3 ? "text-orange-500" : "text-muted-foreground",
                )}>
                  {release.overdue ? "Overdue" : days !== null ? `${days}d left` : ""}
                </span>
                <p className="text-[10px] font-mono text-muted-foreground/60">
                  Due {formatDate(release.releaseDate)}
                </p>
              </div>
            ) : (
              <span className="text-[10px] font-mono text-muted-foreground/50">No date set</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="px-5 pb-3 space-y-2.5">
        {/* Issue Status */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60">
              Issue Status
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              {release.issuesDone}/{totalIssues} done
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/20 overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${donePercent}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${totalIssues > 0 ? Math.round((release.issuesInProgress / totalIssues) * 100) : 0}%` }} />
            <div className="h-full bg-muted/40" style={{ width: `${totalIssues > 0 ? Math.round((release.issuesToDo / totalIssues) * 100) : 0}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[8px] font-mono text-muted-foreground flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {release.issuesDone} Done
            </span>
            <span className="text-[8px] font-mono text-muted-foreground flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {release.issuesInProgress} In Progress
            </span>
            <span className="text-[8px] font-mono text-muted-foreground flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted/40" /> {release.issuesToDo} To Do
            </span>
          </div>
        </div>

        {/* Deployment Coverage */}
        {(release.issuesDeployedStaging > 0 || release.issuesDeployedProduction > 0) && (
          <div>
            <span className="text-[9px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60 mb-1 block">
              Deployment Coverage
            </span>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Server className="h-3 w-3 text-amber-500 shrink-0" />
                <div className="flex-1 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${stagingPercent}%` }} />
                </div>
                <span className="text-[9px] font-mono text-muted-foreground w-[40px] text-right">
                  {release.issuesDeployedStaging}/{totalIssues}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Rocket className="h-3 w-3 text-emerald-500 shrink-0" />
                <div className="flex-1 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${productionPercent}%` }} />
                </div>
                <span className="text-[9px] font-mono text-muted-foreground w-[40px] text-right">
                  {release.issuesDeployedProduction}/{totalIssues}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expandable Issue List */}
      {release.issues.length > 0 && (
        <div className="border-t border-foreground/5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-muted/10 transition-colors"
          >
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
              {release.issues.length} Issues
            </span>
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {expanded && (
            <div className="px-5 pb-3 space-y-1 max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {release.issues.map((issue) => (
                <Link
                  key={issue.jiraKey}
                  href={`/issue/${issue.jiraKey}`}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/10 transition-colors"
                >
                  <IssueTypeIcon type={issue.issueType} size={12} />
                  <span className="text-[11px] font-bold font-mono shrink-0" style={{ color: issue.boardColor }}>
                    {issue.jiraKey}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate flex-1">{issue.title}</span>
                  {issue.deploymentStatus === "production" && (
                    <Rocket className="h-3 w-3 text-emerald-500 shrink-0" />
                  )}
                  {issue.deploymentStatus === "staging" && (
                    <Server className="h-3 w-3 text-amber-500 shrink-0" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Release Progress Section ────────────────────────────────────────────────

type ReleaseFilter = "unreleased" | "released" | "all";
type ReleaseSort = "date" | "progress" | "issues";

export function ReleaseProgress({
  upcoming,
  recent,
}: {
  upcoming: Release[];
  recent: Release[];
}) {
  const [filter, setFilter] = useState<ReleaseFilter>("unreleased");
  const [sort, setSort] = useState<ReleaseSort>("date");

  const allReleases = [...upcoming, ...recent];
  if (allReleases.length === 0) return null;

  // Filter
  const filtered = allReleases.filter((r) => {
    if (filter === "unreleased") return !r.released;
    if (filter === "released") return r.released;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "progress") {
      const aPct = a.issuesTotal > 0 ? a.issuesDone / a.issuesTotal : 0;
      const bPct = b.issuesTotal > 0 ? b.issuesDone / b.issuesTotal : 0;
      return bPct - aPct;
    }
    if (sort === "issues") return b.issuesTotal - a.issuesTotal;
    // Default: date (newest first, unreleased with dates first)
    const aDate = a.releaseDate || "9999";
    const bDate = b.releaseDate || "9999";
    if (!a.released && !b.released) return aDate.localeCompare(bDate); // upcoming: soonest first
    return bDate.localeCompare(aDate); // released: newest first
  });

  return (
    <div className="space-y-3">
      {/* Filter + Sort controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
          {([
            { key: "unreleased" as const, label: "Unreleased" },
            { key: "released" as const, label: "Released" },
            { key: "all" as const, label: "All" },
          ]).map((opt) => (
            <button
              type="button"
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider transition-all",
                filter === opt.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
          <span>Sort:</span>
          {([
            { key: "date" as const, label: "Date" },
            { key: "progress" as const, label: "Progress" },
            { key: "issues" as const, label: "Issues" },
          ]).map((opt) => (
            <button
              type="button"
              key={opt.key}
              onClick={() => setSort(opt.key)}
              className={cn(
                "px-2 py-0.5 rounded transition-colors",
                sort === opt.key
                  ? "bg-muted/40 text-foreground font-semibold"
                  : "hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Release cards */}
      {sorted.length === 0 ? (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">No {filter === "all" ? "" : filter} releases found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </div>
      )}
    </div>
  );
}
