"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Flame, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { getSiteLabel } from "@/lib/deployments/brand-resolver";
import type { Mismatch } from "./types";

const TYPE_LABEL: Record<Mismatch["type"], string> = {
  production_not_updated: "Status not updated",
  staging_status_behind: "Staging ahead of status",
  partial_rollout: "Partial rollout",
  closed_but_deployed: "Cancelled task shipped",
};

const SEVERITY_STYLES: Record<Mismatch["severity"], { ring: string; bg: string; iconColor: string; chip: string; icon: React.ComponentType<{ className?: string }> }> = {
  critical: {
    ring: "ring-1 ring-red-500/20",
    bg: "bg-red-500/5",
    iconColor: "text-red-500",
    chip: "bg-red-500/10 text-red-700 dark:text-red-400",
    icon: Flame,
  },
  warning: {
    ring: "ring-1 ring-amber-500/20",
    bg: "bg-amber-500/5",
    iconColor: "text-amber-500",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: AlertTriangle,
  },
  info: {
    ring: "ring-1 ring-sky-500/10",
    bg: "bg-sky-500/5",
    iconColor: "text-sky-500",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    icon: AlertTriangle,
  },
};

export function StatusMismatches({ mismatches }: { mismatches: Mismatch[] }) {
  if (mismatches.length === 0) {
    return (
      <div className="bg-emerald-500/5 ring-1 ring-emerald-500/10 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold font-mono text-emerald-700 dark:text-emerald-400">All Clear</p>
          <p className="text-[10px] text-muted-foreground">
            No status mismatches detected. All deployed tasks have matching JIRA statuses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mismatches.map((m) => {
        const sev = SEVERITY_STYLES[m.severity];
        const isShippedCancelled = m.type === "closed_but_deployed";
        const HeadIcon = isShippedCancelled ? XCircle : sev.icon;
        return (
          <Link
            key={`${m.type}-${m.jiraKey}-${m.siteName || "_"}`}
            href={`/issue/${m.jiraKey}`}
            className={cn(
              "block rounded-xl p-4 transition-all hover:ring-2 hover:ring-foreground/10",
              sev.bg,
              sev.ring,
              isShippedCancelled && "ring-1 ring-rose-500/30 bg-rose-500/5",
            )}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <HeadIcon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isShippedCancelled ? "text-rose-500" : sev.iconColor,
                )}
              />
              <div className="flex items-center gap-1.5">
                <IssueTypeIcon type={m.issueType} size={14} />
                <span className="text-sm font-bold font-mono" style={{ color: m.boardColor }}>
                  {m.jiraKey}
                </span>
              </div>
              <span className="text-sm text-foreground truncate flex-1">{m.title}</span>
              <span
                className={cn(
                  "text-[9px] font-bold font-mono uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                  isShippedCancelled
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                    : sev.chip,
                )}
              >
                {TYPE_LABEL[m.type]}
              </span>
              <span
                className={cn(
                  "text-[10px] font-mono shrink-0",
                  m.severity === "critical" ? "text-red-600 dark:text-red-400 font-bold" : "text-muted-foreground",
                )}
              >
                {m.daysSinceDeployment}d ago
              </span>
            </div>

            <div className="flex items-center gap-4 mt-2 ml-7 text-[10px] font-mono text-muted-foreground flex-wrap">
              <span>
                Status: <strong className="text-foreground">{m.jiraStatusName || m.status}</strong>
              </span>
              {m.type !== "partial_rollout" && (
                <span>
                  Deployed:{" "}
                  <strong className="text-foreground">
                    {m.environment} {m.siteLabel || m.siteName || ""}
                    {m.deployedSites.length > 1 && ` (${m.deployedSites.length} sites)`}
                  </strong>
                </span>
              )}
              {m.assigneeName && (
                <span>
                  Assignee: <strong className="text-foreground">{m.assigneeName}</strong>
                </span>
              )}
              {m.brands && (
                <span>
                  Brands: <strong className="text-foreground">{m.brands}</strong>
                </span>
              )}
            </div>

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
                      {isDeployed ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
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
        );
      })}
    </div>
  );
}
