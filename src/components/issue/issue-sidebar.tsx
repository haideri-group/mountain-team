"use client";

import Link from "next/link";
import {
  ExternalLink,
  Paperclip,
  FileText,
  Image as ImageIcon,
  GitBranch,
  GitPullRequest,
  GitCommit,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Phase1Data, Phase2Data, GitHubData } from "./issue-types";
import {
  PRIORITY_COLORS,
  PRIORITY_ICON_CLASS,
  getInitials,
  formatDateFull,
  formatFileSize,
} from "./issue-helpers";

// ─── Mini Cycle Time Bar Chart ────────────────────────────────────────────────

function CycleTimeChart({ currentCycleTime }: { currentCycleTime: number | null }) {
  // Generate 6 synthetic relative bars — last one is current (if available)
  const bars = [0.6, 0.45, 0.8, 0.55, 0.7, currentCycleTime != null ? 1 : 0.65];

  return (
    <div className="flex items-end gap-1 h-10">
      {bars.map((rel, i) => {
        const isCurrent = i === bars.length - 1;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-all",
              isCurrent ? "bg-primary" : "bg-primary/20",
            )}
            style={{ height: `${rel * 100}%` }}
          />
        );
      })}
    </div>
  );
}

// ─── Sidebar Props ────────────────────────────────────────────────────────────

interface IssueSidebarProps {
  phase1: Phase1Data;
  phase2: Phase2Data | null;
  phase2Loading: boolean;
  github: GitHubData | null;
  githubLoading: boolean;
  jiraBaseUrl: string;
  issueKey: string;
}

// ─── IssueSidebar Component ──────────────────────────────────────────────────

export function IssueSidebar({
  phase1,
  phase2,
  phase2Loading,
  github,
  githubLoading,
  jiraBaseUrl,
  issueKey,
}: IssueSidebarProps) {
  const { issue, context } = phase1;

  return (
    <div className="col-span-12 lg:col-span-4 space-y-5">

      {/* Status Card */}
      <div className="bg-muted/10 rounded-xl p-6 space-y-4">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
          Current Status
        </p>
        <button className="w-full flex items-center justify-center px-4 py-3 rounded-xl border-2 border-primary bg-primary/5 transition-colors hover:bg-primary/10">
          <span className="text-[13px] font-bold font-mono uppercase tracking-widest text-primary">
            {issue.status.replace(/_/g, " ")}
          </span>
        </button>

        {/* Assignee row */}
        {issue.assigneeName && (
          <div className="flex items-center gap-3 pt-1">
            {issue.assigneeAvatarUrl ? (
              <img
                src={issue.assigneeAvatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-[#1a1a2e] flex items-center justify-center text-[10px] font-bold font-mono text-white shrink-0">
                {issue.assigneeInitials ?? getInitials(issue.assigneeName)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {issue.assigneeId ? (
                <Link
                  href={`/members/${issue.assigneeId}`}
                  className="text-sm font-semibold hover:text-primary transition-colors block truncate"
                >
                  {issue.assigneeName}
                </Link>
              ) : (
                <span className="text-sm font-semibold block truncate">
                  {issue.assigneeName}
                </span>
              )}
              {issue.teamName && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {issue.teamName}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Priority row */}
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: PRIORITY_COLORS[issue.priority] ?? PRIORITY_COLORS.medium }}
          />
          <span
            className={cn(
              "text-[11px] font-mono font-bold uppercase tracking-wide",
              PRIORITY_ICON_CLASS[issue.priority] ?? PRIORITY_ICON_CLASS.medium,
            )}
          >
            {issue.priority} priority
          </span>
        </div>

        {/* Assignee stats */}
        {issue.assigneeId && (
          <div className="pt-2 border-t border-border/20 space-y-1.5">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
              Performance
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
              <span>{context.assigneeStats.totalDone} done</span>
              <span>{context.assigneeStats.onTimePercentage}% on-time</span>
              <span>{context.assigneeStats.avgCycleTime}d avg</span>
            </div>
          </div>
        )}
      </div>

      {/* Cycle Time Performance Card */}
      <div className="bg-muted/10 rounded-xl p-6 space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
          Cycle Time Performance
        </p>
        <CycleTimeChart currentCycleTime={issue.cycleTime} />
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-muted-foreground">T-7 Days</span>
          {issue.cycleTime != null ? (
            <span className="font-bold text-primary">
              Current: {issue.cycleTime.toFixed(1)}d
            </span>
          ) : (
            <span className="text-muted-foreground">No data</span>
          )}
        </div>
      </div>

      {/* Details Card */}
      <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
          Details
        </p>

        {/* 2-col grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {/* Board */}
          <div className="space-y-1">
            <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
              Board
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: issue.boardColor }}
              />
              <span className="text-[11px] font-bold font-mono truncate">
                {issue.boardKey}
              </span>
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-1">
            <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
              Labels
            </p>
            {issue.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((lbl) => (
                  <span
                    key={lbl}
                    className="inline-flex items-center px-1.5 py-0.5 bg-muted/30 text-[9px] font-bold font-mono rounded uppercase tracking-wide text-muted-foreground"
                  >
                    {lbl}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground/50">—</span>
            )}
          </div>

          {/* Due Date */}
          <div className="space-y-1">
            <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
              Due Date
            </p>
            <span
              className={cn(
                "text-[11px] font-mono font-semibold",
                issue.isOverdue && !issue.completedDate
                  ? "text-destructive"
                  : "text-foreground",
              )}
            >
              {formatDateFull(issue.dueDate)}
            </span>
          </div>

          {/* Cycle Time */}
          <div className="space-y-1">
            <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
              Cycle Time
            </p>
            {issue.isOverdue && issue.cycleTime == null ? (
              <span className="text-[11px] font-mono font-bold text-destructive">
                Overdue
              </span>
            ) : issue.cycleTime != null ? (
              <span className="text-[11px] font-mono font-semibold text-foreground">
                {issue.cycleTime.toFixed(1)}d
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/50">—</span>
            )}
          </div>

          {/* Type */}
          {issue.type && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                Type
              </p>
              <span className="text-[11px] font-mono font-semibold capitalize">
                {issue.type.replace(/_/g, " ")}
              </span>
            </div>
          )}

          {/* Story Points */}
          {issue.storyPoints != null && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                Story Points
              </p>
              <span className="text-[11px] font-mono font-bold text-primary">
                {issue.storyPoints}
              </span>
            </div>
          )}

          {/* Brands */}
          {issue.brands && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                Brands
              </p>
              <div className="flex flex-wrap gap-1">
                {issue.brands.split(",").map((b) => b.trim()).filter(Boolean).map((brand) => (
                  <span
                    key={brand}
                    className="inline-flex items-center px-1.5 py-0.5 bg-primary/8 text-[9px] font-bold font-mono rounded text-primary/80"
                  >
                    {brand}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Website */}
          {issue.website && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                Website
              </p>
              <span className="text-[11px] font-mono text-foreground">
                {issue.website}
              </span>
            </div>
          )}

          {/* Request Priority */}
          {issue.requestPriority && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                Request Priority
              </p>
              <span className="text-[11px] font-mono font-semibold text-foreground">
                {issue.requestPriority}
              </span>
            </div>
          )}
        </div>

        {/* Time Tracking — only shown if data exists */}
        {phase2?.timeTracking?.timeSpent && (() => {
          const tt = phase2.timeTracking!;
          const hasEstimate = tt.originalEstimateSeconds > 0;
          const pct = hasEstimate
            ? Math.round((tt.timeSpentSeconds / tt.originalEstimateSeconds) * 100)
            : 0;
          const isOver = pct > 100;
          const barColor = isOver ? "#ba1a1a" : "#ff8400";

          return (
            <div className="pt-2 border-t border-border/30 space-y-2">
              <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                Time Tracking
              </p>

              {hasEstimate ? (
                <>
                  {/* Progress bar mode — has original estimate */}
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="font-bold" style={{ color: barColor }}>
                      {tt.timeSpent}
                    </span>
                    <span className="text-muted-foreground/60">
                      of {tt.originalEstimate}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
                    <span>{pct}% used</span>
                    {tt.remainingEstimate && tt.remainingEstimateSeconds > 0 && (
                      <span>{tt.remainingEstimate} remaining</span>
                    )}
                  </div>
                </>
              ) : (
                /* Text-only mode — no original estimate */
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground uppercase tracking-widest">Logged</span>
                  <span className="font-bold text-primary">{tt.timeSpent}</span>
                </div>
              )}

              {/* Per-person breakdown */}
              {phase2.worklogs && phase2.worklogs.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {phase2.worklogs.map((wl) => {
                    const totalSeconds = tt.timeSpentSeconds || 1;
                    const wlPct = Math.round((wl.timeSpentSeconds / totalSeconds) * 100);
                    return (
                      <div key={wl.author} className="flex items-center gap-2">
                        {wl.authorAvatar ? (
                          <img
                            src={wl.authorAvatar}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-4 w-4 rounded-full shrink-0"
                          />
                        ) : (
                          <div className="h-4 w-4 rounded-full bg-muted/50 flex items-center justify-center text-[7px] font-bold font-mono text-muted-foreground shrink-0">
                            {wl.author.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-[10px] font-mono truncate flex-1">{wl.author}</span>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground shrink-0">{wl.timeSpent}</span>
                        <span className="text-[9px] font-mono text-muted-foreground/50 w-7 text-right shrink-0">{wlPct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Created / Updated */}
        <div className="pt-2 border-t border-border/30 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-muted-foreground uppercase tracking-widest">Created</span>
            <span className="font-semibold">{formatDateFull(issue.jiraCreatedAt)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-muted-foreground uppercase tracking-widest">Updated</span>
            <span className="font-semibold">{formatDateFull(issue.jiraUpdatedAt)}</span>
          </div>
          {context.cycleTimePercentile != null && (
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground uppercase tracking-widest">Percentile</span>
              <span className="font-bold text-primary">
                {context.cycleTimePercentile}th
              </span>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Integration */}
      {(githubLoading || (github && (github.branches.length > 0 || github.pullRequests.length > 0))) && (
        <div className="bg-card rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 fill-foreground" viewBox="0 0 16 16">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" fillRule="evenodd" />
              </svg>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                GitHub Integration
              </p>
            </div>
            {githubLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {githubLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ) : github && (
            <div className="space-y-5">
              {/* Branches */}
              {github.branches.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
                    Branches ({github.branches.length})
                  </p>
                  <div className="space-y-1.5">
                    {github.branches.map((b) => (
                      <a
                        key={b.name + b.repoName}
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GitBranch className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono font-bold truncate">{b.name}</p>
                            <p className="text-[9px] text-muted-foreground/60 truncate">{b.repoName}</p>
                          </div>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Pull Requests */}
              {github.pullRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
                    Pull Requests ({github.pullRequests.length})
                  </p>
                  <div className="space-y-1.5">
                    {github.pullRequests.map((pr) => (
                      <a
                        key={pr.id}
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <GitPullRequest
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              pr.status === "OPEN" ? "text-emerald-500" :
                              pr.status === "MERGED" ? "text-purple-500" :
                              "text-red-500",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-mono font-bold truncate">
                              {pr.id} {pr.title}
                            </p>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
                              <span>→ {pr.destBranch}</span>
                              {pr.commentCount > 0 && <span>{pr.commentCount} comment{pr.commentCount > 1 ? "s" : ""}</span>}
                              {pr.reviewers.length > 0 && (
                                <div className="flex -space-x-1">
                                  {pr.reviewers.slice(0, 3).map((r, i) => (
                                    <img
                                      key={i}
                                      src={r.avatar}
                                      alt={r.name}
                                      referrerPolicy="no-referrer"
                                      className="h-3 w-3 rounded-full ring-1 ring-card"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 text-[8px] font-bold font-mono uppercase rounded-sm shrink-0 ml-2",
                            pr.status === "OPEN" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
                            pr.status === "MERGED" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" :
                            "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
                          )}
                        >
                          {pr.status === "DECLINED" ? "Closed" : pr.status.toLowerCase()}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Commits */}
              {github.commits.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
                    Recent Commits ({github.commits.length})
                  </p>
                  <div className="space-y-1.5">
                    {github.commits.map((c) => (
                      <a
                        key={c.sha}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GitCommit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold text-primary">{c.sha}</span>
                              <span className="text-[11px] truncate">{c.message}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground/60 whitespace-nowrap ml-2">{c.date}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Attachments Section */}
      {(phase2Loading || (phase2 && phase2.attachments.length > 0)) && (
        <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
              Attachments
              {phase2 && (
                <span className="ml-1 text-muted-foreground/60">
                  ({phase2.attachments.length})
                </span>
              )}
            </p>
          </div>

          {phase2Loading ? (
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {phase2!.attachments.map((att) => {
                const isImage = att.mimeType.startsWith("image/");
                return (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative group rounded-lg overflow-hidden bg-muted/20 border border-border/30 hover:border-primary/40 transition-colors aspect-[4/3] flex items-center justify-center"
                  >
                    {isImage && att.thumbnail ? (
                      <img
                        src={att.thumbnail}
                        alt={att.filename}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 p-2 text-muted-foreground">
                        {isImage ? (
                          <ImageIcon className="h-5 w-5" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                        <span className="text-[9px] font-mono font-bold uppercase text-center leading-tight">
                          {att.filename.split(".").pop()?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Filename overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[9px] font-mono text-white truncate">{att.filename}</p>
                      <p className="text-[8px] text-white/60">{formatFileSize(att.size)}</p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
