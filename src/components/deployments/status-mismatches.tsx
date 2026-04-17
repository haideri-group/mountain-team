"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { getSiteLabel } from "@/lib/deployments/brand-resolver";
import type { Mismatch } from "./types";

export function StatusMismatches({ mismatches }: { mismatches: Mismatch[] }) {
  if (mismatches.length === 0) {
    return (
      <div className="bg-emerald-500/5 ring-1 ring-emerald-500/10 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold font-mono text-emerald-700 dark:text-emerald-400">All Clear</p>
          <p className="text-[10px] text-muted-foreground">No status mismatches detected. All deployed tasks have matching JIRA statuses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mismatches.map((m) => (
        <Link
          key={`${m.jiraKey}-${m.type}`}
          href={`/issue/${m.jiraKey}`}
          className={cn(
            "block rounded-xl p-4 transition-all hover:ring-1 hover:ring-foreground/10",
            m.type === "production_not_updated" ? "bg-red-500/5 ring-1 ring-red-500/10" :
            m.type === "partial_rollout" ? "bg-orange-500/5 ring-1 ring-orange-500/10" :
            "bg-amber-500/5 ring-1 ring-amber-500/10",
          )}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <AlertTriangle className={cn(
              "h-4 w-4 shrink-0",
              m.type === "production_not_updated" ? "text-red-500" :
              m.type === "partial_rollout" ? "text-orange-500" :
              "text-amber-500",
            )} />
            <div className="flex items-center gap-1.5">
              <IssueTypeIcon type={m.issueType} size={14} />
              <span className="text-sm font-bold font-mono" style={{ color: m.boardColor }}>{m.jiraKey}</span>
            </div>
            <span className="text-sm text-foreground truncate flex-1">{m.title}</span>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {m.daysSinceDeployment}d ago
            </span>
          </div>

          <div className="flex items-center gap-4 mt-2 ml-7 text-[10px] font-mono text-muted-foreground flex-wrap">
            <span>Status: <strong className="text-foreground">{m.jiraStatusName || m.status}</strong></span>
            {m.type !== "partial_rollout" && (
              <span>Deployed: <strong className="text-foreground">
                {m.environment} {m.siteLabel || m.siteName || ""}
                {m.deployedSites.length > 1 && ` (${m.deployedSites.length} sites)`}
              </strong></span>
            )}
            {m.assigneeName && <span>Assignee: <strong className="text-foreground">{m.assigneeName}</strong></span>}
            {m.brands && <span>Brands: <strong className="text-foreground">{m.brands}</strong></span>}
          </div>

          {/* Per-site deployment status for partial rollouts */}
          {m.type === "partial_rollout" && m.expectedSites && m.expectedSites.length > 0 && (
            <div className="mt-3 ml-7 flex flex-wrap gap-2">
              {m.expectedSites.map((site) => {
                const isDeployed = m.deployedSites.includes(site);
                return (
                  <span
                    key={site}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full",
                      isDeployed
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted/30 text-muted-foreground",
                    )}
                  >
                    {isDeployed ? (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    ) : (
                      <Circle className="h-2.5 w-2.5" />
                    )}
                    {getSiteLabel(site)}
                  </span>
                );
              })}
              <span className="text-[10px] font-mono text-muted-foreground self-center">
                {m.deployedSites.length}/{m.expectedSites.length} sites
              </span>
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
