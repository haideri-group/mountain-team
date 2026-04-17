"use client";

import { useState, useEffect } from "react";
import { ChartInfo } from "./chart-info";
import { Rocket, Loader2 } from "lucide-react";
import Link from "next/link";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";

interface PendingRelease {
  jiraKey: string;
  issueId: string | null;
  title: string | null;
  stagedAt: string | null;
  siteName: string | null;
  siteLabel: string | null;
  daysPending: number;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function getDaysColor(days: number): string {
  if (days >= 8) return "text-red-600 dark:text-red-400";
  if (days >= 3) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function getDaysBg(days: number): string {
  if (days >= 8) return "bg-red-50 dark:bg-red-950/20";
  if (days >= 3) return "bg-amber-50 dark:bg-amber-950/20";
  return "bg-emerald-50 dark:bg-emerald-950/20";
}

export function PendingReleases() {
  const [releases, setReleases] = useState<PendingRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/github/pending-releases");
        if (!res.ok) {
          if (res.status === 401) { setLoading(false); return; } // Not logged in
          throw new Error("Failed to fetch");
        }
        const data = await res.json();
        if (!cancelled) setReleases(data.releases || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Don't render if not logged in or loading failed silently
  if (!loading && releases.length === 0 && !error) {
    return null; // Hide section entirely when no pending releases
  }

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Pending Releases
          </h3>
          <ChartInfo chartId="pendingReleases" />
          {!loading && releases.length > 0 && (
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              {releases.length}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground py-4">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/20">
                {["Task", "Title", "Site", "Staged", "Pending"].map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr
                  key={`${r.jiraKey}-${r.siteName}`}
                  className="border-t border-border/30 hover:bg-muted/5 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/issue/${r.jiraKey}`}
                      className="text-xs font-bold font-mono text-primary hover:underline"
                    >
                      {r.jiraKey}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm text-foreground line-clamp-1">
                      {r.title || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-muted-foreground">
                      {r.siteLabel || r.siteName || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatDate(r.stagedAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${getDaysColor(r.daysPending)} ${getDaysBg(r.daysPending)}`}
                    >
                      {r.daysPending}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
