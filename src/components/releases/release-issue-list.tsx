"use client";

import Link from "next/link";
import { Rocket, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import type { ReleaseDetailIssue } from "./types";

export function ReleaseIssueList({ issues }: { issues: ReleaseDetailIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="bg-card rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">No issues linked to this release yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl divide-y divide-foreground/5">
      {issues.map((i) => (
        <div key={i.jiraKey} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/5 transition-colors">
          {i.issueType && <IssueTypeIcon type={i.issueType} size={14} />}

          <Link
            href={`/issue/${i.jiraKey}`}
            className="text-[11px] font-bold font-mono shrink-0 hover:underline"
            style={{ color: i.boardColor }}
          >
            {i.jiraKey}
          </Link>

          <span className="text-xs text-foreground truncate flex-1 min-w-0">{i.title}</span>

          <IssueStatusBadge status={i.status} jiraStatusName={i.jiraStatusName} />

          {i.storyPoints !== null && i.storyPoints !== undefined && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded shrink-0">
              {i.storyPoints}pt
            </span>
          )}

          <DeploymentChip
            status={i.deploymentStatus}
            stagingSites={i.stagingSites}
            productionSites={i.productionSites}
          />

          {i.assigneeName && (
            <span className="text-[10px] font-mono text-muted-foreground shrink-0 hidden md:inline truncate max-w-[110px]">
              {i.assigneeName}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function DeploymentChip({
  status,
  stagingSites,
  productionSites,
}: {
  status: "production" | "staging" | null;
  stagingSites: string[];
  productionSites: string[];
}) {
  if (status === "production") {
    return (
      <span
        className={cn(
          "flex items-center gap-1 shrink-0",
          "text-[10px] font-mono text-emerald-600 dark:text-emerald-400",
        )}
        title={productionSites.length ? `Live on: ${productionSites.join(", ")}` : "In production"}
      >
        <Rocket className="h-3 w-3 text-emerald-500" />
        {productionSites.length > 0 && <span>×{productionSites.length}</span>}
      </span>
    );
  }
  if (status === "staging") {
    return (
      <span
        className="flex items-center gap-1 shrink-0 text-[10px] font-mono text-amber-600 dark:text-amber-400"
        title={stagingSites.length ? `Staged on: ${stagingSites.join(", ")}` : "In staging"}
      >
        <Server className="h-3 w-3 text-amber-500" />
        {stagingSites.length > 0 && <span>×{stagingSites.length}</span>}
      </span>
    );
  }
  return null;
}
