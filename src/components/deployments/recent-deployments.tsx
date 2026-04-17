"use client";

import Link from "next/link";
import { Rocket, Server, Globe, GitBranch, ExternalLink } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import type { RecentDeployment } from "./types";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function RecentDeploymentsFeed({ deployments }: { deployments: RecentDeployment[] }) {
  if (deployments.length === 0) {
    return (
      <div className="bg-card rounded-xl flex flex-col items-center gap-2 py-12">
        <Rocket className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No deployments found</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl divide-y divide-foreground/5">
      {deployments.map((d) => (
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
            <IssueTypeIcon type={d.issueType} size={12} />
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
      ))}
    </div>
  );
}
