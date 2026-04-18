"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { SiteStatus } from "./types";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SiteOverviewTable({ sites }: { sites: SiteStatus[] }) {
  if (sites.length === 0) return null;

  return (
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
            {sites.map((site) => (
              <tr key={site.siteName} className="border-b border-foreground/5 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {site.siteLabel || site.siteName}
                    </span>
                    {site.isStale && (
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        title={`No deployments for ${site.daysSinceLastDeploy}d`}
                      >
                        Stale
                      </span>
                    )}
                    {!site.lastDeployAt && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
                        Never
                      </span>
                    )}
                  </div>
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
                <td
                  className={cn(
                    "px-4 py-3 text-right",
                    site.isStale ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground",
                  )}
                >
                  {site.lastDeployAt ? timeAgo(site.lastDeployAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
