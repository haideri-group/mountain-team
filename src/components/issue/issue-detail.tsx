"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  ChevronRight,
  CheckSquare,
  Square,
  Link2,
  FileText,
} from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { Phase1Data, Phase2Data, GitHubData, ActivityEntry } from "./issue-types";
import { PRIORITY_COLORS, formatSmartDate, mergeActivity } from "./issue-helpers";
import { IssueSidebar } from "./issue-sidebar";
import { ActivityTabs } from "./issue-activity";

// ─── Main Component ──────────────────────────────────────────────────────────

interface IssueDetailProps {
  issueKey: string;
}

export function IssueDetail({ issueKey }: IssueDetailProps) {
  const router = useRouter();

  const [phase1, setPhase1] = useState<Phase1Data | null>(null);
  const [phase2, setPhase2] = useState<Phase2Data | null>(null);
  const [github, setGithub] = useState<GitHubData | null>(null);
  const [deploymentData, setDeploymentData] = useState<any>(null);
  const [phase1Loading, setPhase1Loading] = useState(true);
  const [phase2Loading, setPhase2Loading] = useState(true);
  const [githubLoading, setGithubLoading] = useState(true);
  const [deploymentLoading, setDeploymentLoading] = useState(true);
  const [phase1Error, setPhase1Error] = useState<string | null>(null);

  // Phase 1: DB data — instant
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPhase1Loading(true);
      setPhase1Error(null);
      try {
        const res = await fetch(`/api/issues/${issueKey}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error((json as { error?: string }).error ?? "Failed to load issue");
        }
        const data = (await res.json()) as Phase1Data;
        if (!cancelled) setPhase1(data);
      } catch (err) {
        if (!cancelled)
          setPhase1Error(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (!cancelled) setPhase1Loading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [issueKey]);

  // Phase 2: Live JIRA data — background
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPhase2Loading(true);
      try {
        const res = await fetch(`/api/issues/${issueKey}/jira`);
        if (!res.ok) return;
        const data = (await res.json()) as Phase2Data;
        if (!cancelled) setPhase2(data);
      } catch {
        // Phase 2 failure is non-fatal
      } finally {
        if (!cancelled) setPhase2Loading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [issueKey]);

  // Phase 3: GitHub data via JIRA dev-status — background
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setGithubLoading(true);
      try {
        const res = await fetch(`/api/issues/${issueKey}/github`);
        if (!res.ok) return;
        const data = (await res.json()) as GitHubData;
        if (!cancelled) setGithub(data);
      } catch {
        // GitHub failure is non-fatal
      } finally {
        if (!cancelled) setGithubLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [issueKey]);

  // Phase 4: Deployment tracking data — background
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setDeploymentLoading(true);
      try {
        const res = await fetch(`/api/issues/${issueKey}/deployments`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDeploymentData(data);
      } catch {
        // Deployment data failure is non-fatal
      } finally {
        if (!cancelled) setDeploymentLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [issueKey]);

  // ── Loading state ────────────────────────────────────────────────────────────
  if (phase1Loading) {
    return (
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-3" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-3" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-12 gap-6 mt-2">
          <div className="col-span-8 space-y-5">
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-3/4" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="bg-card rounded-xl p-8 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
          <div className="col-span-4 space-y-5">
            <div className="bg-muted/10 rounded-xl p-6 space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="bg-muted/10 rounded-xl p-6 space-y-3">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (phase1Error || !phase1) {
    return (
      <div className="bg-card rounded-xl p-16 flex flex-col items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <FileText className="h-7 w-7 text-destructive" />
        </div>
        <div className="text-center">
          <p className="font-bold font-mono uppercase tracking-widest text-sm">
            Issue Not Found
          </p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            {phase1Error ?? `${issueKey} could not be loaded`}
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-primary font-semibold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back
        </button>
      </div>
    );
  }

  const { issue, context } = phase1;
  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";
  const createdDisplay = formatSmartDate(issue.jiraCreatedAt);

  const activity: ActivityEntry[] = phase2
    ? mergeActivity(phase2.comments, phase2.changelog)
    : [];

  return (
    <div className="space-y-0">

      {/* ── Header Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-card border-b border-border/30 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
              <span>Projects</span>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="text-foreground font-semibold">{issue.boardName}</span>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="flex items-center gap-1">
                <span className="text-foreground font-bold">{issue.jiraKey}</span>
                {jiraBaseUrl && (
                  <a
                    href={`${jiraBaseUrl}/browse/${issue.jiraKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:opacity-70 transition-opacity"
                    aria-label="Open in JIRA"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Board
              </button>
              <span className="text-border/60 text-xs select-none">·</span>
              <button className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                History
              </button>
              <span className="text-border/60 text-xs select-none">·</span>
              <button className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                Attachments
              </button>
            </div>
          </div>

          {jiraBaseUrl && (
            <a
              href={`${jiraBaseUrl}/browse/${issue.jiraKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold font-mono uppercase tracking-widest text-white transition-opacity hover:opacity-90 shrink-0"
              style={{ background: "linear-gradient(135deg, #944a00, #ff8400)" }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in JIRA
            </a>
          )}
        </div>
      </div>

      {/* ── Body: 12-col grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6 p-6">

        {/* ── Left Column (8/12) ──────────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-8 space-y-6">

          {/* Title Section */}
          <div className="space-y-3">
            <p className="text-xs font-mono text-primary font-bold tracking-widest uppercase">
              Issue Tracking
            </p>
            <h1
              className={cn(
                "font-extrabold tracking-tight font-mono leading-tight",
                issue.title.length > 120 ? "text-xl" :
                issue.title.length > 80 ? "text-2xl" :
                issue.title.length > 50 ? "text-3xl" :
                "text-4xl",
              )}
            >
              {issue.title}
            </h1>
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              <IssueStatusBadge status={issue.status} />
              {issue.priority && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono uppercase tracking-wide"
                  style={{
                    color: PRIORITY_COLORS[issue.priority] ?? "#6b7280",
                    backgroundColor: `${PRIORITY_COLORS[issue.priority] ?? "#6b7280"}15`,
                  }}
                >
                  {issue.priority}
                </span>
              )}
              {issue.type && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/30 text-[10px] font-semibold font-mono uppercase tracking-wide text-muted-foreground">
                  {issue.type.replace(/_/g, " ")}
                </span>
              )}
              {issue.storyPoints != null && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold font-mono text-primary">
                  {issue.storyPoints}pt
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="bg-[#1a1a2e] text-white text-[10px] font-mono rounded px-2 py-1 shrink-0 inline-flex items-center gap-1.5">
                <IssueTypeIcon type={issue.type} size={14} />
                {issue.jiraKey}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                Created {createdDisplay}
              </span>
              {phase1.timeline.daysInCurrentStatus > 0 && (
                <span className={cn(
                  "flex items-center gap-1.5 text-[11px] font-mono font-semibold",
                  phase1.timeline.daysInCurrentStatus >= 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}>
                  <Clock className="h-3 w-3 shrink-0" />
                  {phase1.timeline.daysInCurrentStatus}d in <IssueStatusBadge status={issue.status} />
                </span>
              )}
              {issue.isOverdue && (
                <span className="text-[11px] font-mono font-bold text-destructive">
                  OVERDUE
                </span>
              )}
              {issue.isOnTime === true && (
                <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ON TIME
                </span>
              )}
              {issue.isOnTime === false && (
                <span className="text-[11px] font-mono font-bold text-destructive">
                  LATE
                </span>
              )}
            </div>
          </div>

          {/* Description Card */}
          <div className="bg-card rounded-xl p-8 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                Description
              </h2>
            </div>

            {(() => {
              // Prefer Phase 2 (live JIRA) if available, otherwise Phase 1 (DB cache)
              const desc = phase2?.description ?? phase1.issue.description;

              if (!desc && phase2Loading) {
                // No cached description and still fetching from JIRA
                return (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-9/12" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                );
              }

              if (desc) {
                return (
                  <div
                    className="jira-description prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: desc }}
                  />
                );
              }

              return (
                <p className="text-sm text-muted-foreground italic">
                  No description available.
                </p>
              );
            })()}
          </div>

          {/* Linked Issues */}
          {(phase2Loading || (phase2 && phase2.linkedIssues.length > 0)) && (
            <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                  Linked Issues
                </p>
              </div>

              {phase2Loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {phase2!.linkedIssues.map((linked) => (
                    <Link
                      key={linked.id}
                      href={`/issue/${linked.key}`}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors group"
                    >
                      <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-bold font-mono text-primary shrink-0">
                        {linked.key}
                      </span>
                      <span className="text-[11px] text-foreground truncate flex-1 min-w-0">
                        {linked.title}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-tasks */}
          {(phase2Loading || (phase2 && phase2.subtasks.length > 0)) && (
            <div className="bg-card rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-8 py-5 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                    Sub-tasks
                    {phase2 && (
                      <span className="ml-1.5 text-muted-foreground/60">
                        ({phase2.subtasks.length})
                      </span>
                    )}
                  </h2>
                </div>
                <button
                  disabled
                  className="text-[11px] font-mono text-primary/40 cursor-not-allowed select-none"
                >
                  Add Item
                </button>
              </div>

              {phase2Loading ? (
                <div className="divide-y divide-border/30">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-8 py-4">
                      <Skeleton className="h-4 w-4 rounded shrink-0" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {phase2!.subtasks.map((sub) => {
                    const isDone =
                      sub.status.toLowerCase().includes("done") ||
                      sub.status.toLowerCase().includes("closed");

                    return (
                      <div
                        key={sub.key}
                        className="flex items-center gap-3 px-8 py-4 hover:bg-muted/20 transition-colors"
                      >
                        <IssueTypeIcon type="subtask" size={16} className={isDone ? "opacity-40" : ""} />
                        <Link
                          href={`/issue/${sub.key}`}
                          className={cn(
                            "text-[10px] font-mono font-bold hover:underline shrink-0",
                            isDone ? "text-muted-foreground" : "text-primary",
                          )}
                        >
                          {sub.key}
                        </Link>
                        <span
                          className={cn(
                            "flex-1 min-w-0 text-sm truncate",
                            isDone && "line-through text-muted-foreground",
                          )}
                        >
                          {sub.title}
                        </span>
                        <span className="shrink-0">
                          <IssueStatusBadge
                            status={sub.status.toLowerCase().replace(/\s+/g, "_")}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Activity Section */}
          <ActivityTabs
            issueKey={issueKey}
            activity={activity}
            phase2Loading={phase2Loading}
          />
        </div>

        {/* ── Right Column (4/12) ─────────────────────────────────────────── */}
        <IssueSidebar
          phase1={phase1}
          phase2={phase2}
          phase2Loading={phase2Loading}
          github={github}
          githubLoading={githubLoading}
          deploymentData={deploymentData}
          deploymentLoading={deploymentLoading}
          jiraBaseUrl={jiraBaseUrl}
          issueKey={issueKey}
        />
      </div>
    </div>
  );
}
