"use client";

import Link from "next/link";
import { Package, CheckCircle2, Rocket, Server, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReleaseStatusPill } from "./release-status-pill";
import type { ReleaseListItem } from "./types";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No date";
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ReleaseOverviewCard({ release }: { release: ReleaseListItem }) {
  const total = release.issuesTotal || release.memberCount;
  const donePct = total > 0 ? Math.round((release.issuesDone / total) * 100) : 0;
  const inProgressPct = total > 0 ? Math.round((release.issuesInProgress / total) * 100) : 0;
  const toDoPct = total > 0 ? Math.round((release.issuesToDo / total) * 100) : 0;
  const stagingPct = total > 0 ? Math.round((release.issuesDeployedStaging / total) * 100) : 0;
  const productionPct = total > 0 ? Math.round((release.issuesDeployedProduction / total) * 100) : 0;

  const isFE = release.name.toLowerCase().includes("fe ");
  const isBE = release.name.toLowerCase().includes("be ");

  return (
    <Link
      href={`/releases/${release.id}`}
      className={cn(
        "group relative block bg-card rounded-xl overflow-hidden hover:bg-card/90 transition-colors",
        release.overdue && !release.released && "ring-1 ring-amber-500/20",
      )}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                release.released ? "bg-emerald-500/10" : release.overdue ? "bg-amber-500/10" : "bg-primary/10",
              )}
            >
              {release.released ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Package className={cn("h-4 w-4", release.overdue ? "text-amber-500" : "text-primary")} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold font-mono truncate">{release.name}</h4>
                <ReleaseStatusPill status={release.readiness.status} size="sm" />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {(isFE || isBE) && (
                  <span
                    className={cn(
                      "text-[8px] font-bold font-mono px-1.5 py-0.5 rounded-full uppercase",
                      isFE
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-purple-500/10 text-purple-600 dark:text-purple-400",
                    )}
                  >
                    {isFE ? "Frontend" : "Backend"}
                  </span>
                )}
                <span className="text-[10px] font-mono text-muted-foreground">{release.projectKey}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/80 mt-1 truncate">{release.readiness.reason}</p>
            </div>
          </div>

          <div className="text-right shrink-0">
            {release.released ? (
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                Released {formatDate(release.releaseDate)}
              </span>
            ) : release.releaseDate ? (
              <div>
                <span
                  className={cn(
                    "text-[10px] font-mono font-bold",
                    release.overdue
                      ? "text-amber-500"
                      : release.daysUntilDue !== null && release.daysUntilDue <= 3
                        ? "text-orange-500"
                        : "text-muted-foreground",
                  )}
                >
                  {release.overdue
                    ? "Overdue"
                    : release.daysUntilDue !== null
                      ? `${release.daysUntilDue}d left`
                      : ""}
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

      {/* Progress */}
      <div className="px-5 pb-4 space-y-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60">
              Issue Status
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              {release.issuesDone}/{total} done
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/20 overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${donePct}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${inProgressPct}%` }} />
            <div className="h-full bg-muted/40" style={{ width: `${toDoPct}%` }} />
          </div>
        </div>

        {(release.issuesDeployedStaging > 0 || release.issuesDeployedProduction > 0) && (
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold font-mono uppercase tracking-wider text-muted-foreground/60">
              Deployment Coverage
            </span>
            <div className="flex items-center gap-2">
              <Server className="h-3 w-3 text-amber-500 shrink-0" />
              <div className="flex-1 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${stagingPct}%` }} />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground w-[40px] text-right">
                {release.issuesDeployedStaging}/{total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Rocket className="h-3 w-3 text-emerald-500 shrink-0" />
              <div className="flex-1 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${productionPct}%` }} />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground w-[40px] text-right">
                {release.issuesDeployedProduction}/{total}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Hover arrow */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
