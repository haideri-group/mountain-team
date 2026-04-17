"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { APP_TIMEZONE } from "@/lib/config";
import type { PendingRelease } from "./types";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
  const dateOnlyStr = d.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
  const timePart = d.toLocaleTimeString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true });

  if (dateOnlyStr === todayStr) return `Today ${timePart}`;
  if (dateOnlyStr === yesterdayStr) return `Yesterday ${timePart}`;
  return d.toLocaleDateString("en-GB", { timeZone: APP_TIMEZONE, day: "numeric", month: "short" }) + ` ${timePart}`;
}

export function PendingReleasesTable({ releases }: { releases: PendingRelease[] }) {
  if (releases.length === 0) return null;

  return (
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
            {releases.map((pr, idx) => (
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
                      {pr.assigneeAvatar && <img src={pr.assigneeAvatar} alt="" className="h-4 w-4 rounded-full" />}
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
  );
}
