"use client";

import { Circle, Inbox } from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";

interface EnrichedIssue {
  id: string;
  jiraKey: string;
  title: string;
  status: string;
  priority: string | null;
  type: string | null;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  boardKey: string;
  boardColor: string;
}

interface CurrentWorkProps {
  currentIssue: EnrichedIssue | null;
  queuedIssues: EnrichedIssue[];
  inReviewIssues: EnrichedIssue[];
  workloadPercentage: number;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}

function getWorkloadColor(pct: number): string {
  if (pct > 100) return "bg-red-500";
  if (pct >= 90) return "bg-orange-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-emerald-500";
}

function IssueRow({ issue }: { issue: EnrichedIssue }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/10 transition-colors">
      <a
        href={`${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/browse/${issue.jiraKey}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-bold font-mono shrink-0 hover:underline"
        style={{ color: issue.boardColor }}
      >
        {issue.jiraKey}
      </a>
      <span className="text-sm text-foreground truncate flex-1">
        {issue.title}
      </span>
      <IssueStatusBadge status={issue.status} />
      {issue.dueDate && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {formatDate(issue.dueDate)}
        </span>
      )}
      {issue.storyPoints != null && (
        <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
          {issue.storyPoints}pt
        </span>
      )}
    </div>
  );
}

export function CurrentWork({
  currentIssue,
  queuedIssues,
  inReviewIssues,
  workloadPercentage,
}: CurrentWorkProps) {
  const hasWork =
    currentIssue || queuedIssues.length > 0 || inReviewIssues.length > 0;

  return (
    <div className="bg-card rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold font-mono">Current Work</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Workload</span>
          <span className="text-sm font-bold font-mono">
            {workloadPercentage}%
          </span>
          <div className="w-24 h-2 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={`h-full rounded-full ${getWorkloadColor(workloadPercentage)}`}
              style={{
                width: `${Math.min(workloadPercentage, 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {!hasWork && (
        <div className="flex flex-col items-center gap-2 py-8">
          <Inbox className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No tasks currently assigned
          </p>
        </div>
      )}

      {/* NOW */}
      {currentIssue && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
              Working on Now
            </span>
          </div>
          <div className="rounded-lg bg-muted/15 p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <a
                href={`${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/browse/${currentIssue.jiraKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold font-mono hover:underline"
                style={{ color: currentIssue.boardColor }}
              >
                {currentIssue.jiraKey}
              </a>
              <IssueStatusBadge status={currentIssue.status} />
              {currentIssue.storyPoints != null && (
                <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                  {currentIssue.storyPoints}pt
                </span>
              )}
            </div>
            <p className="text-sm text-foreground">{currentIssue.title}</p>
            {currentIssue.dueDate && (
              <p className="text-xs text-muted-foreground">
                Due {formatDate(currentIssue.dueDate)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* In Review / Testing / Ready for Live */}
      {inReviewIssues.length > 0 && (
        <div>
          <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">
            In Review / Testing ({inReviewIssues.length})
          </p>
          <div className="space-y-0.5">
            {inReviewIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        </div>
      )}

      {/* Queue */}
      {queuedIssues.length > 0 && (
        <div>
          <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Queue ({queuedIssues.length})
          </p>
          <div className="space-y-0.5">
            {queuedIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
