"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
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
  );
}
