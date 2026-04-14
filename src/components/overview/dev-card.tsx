"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Check, Circle } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { IssueStatusBadge } from "./issue-status-badge";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { DeploymentIndicator } from "./deployment-indicator";
import type { MemberStatus } from "@/types";

interface EnrichedIssue {
  id: string;
  jiraKey: string;
  title: string;
  status: string;
  priority: string | null;
  type: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedDate: string | null;
  storyPoints: number | null;
  boardKey: string;
  boardColor: string;
  deploymentStatus: "production" | "staging" | null;
}

interface DevCardMember {
  id: string;
  displayName: string;
  email: string | null;
  role: string | null;
  status: MemberStatus;
  avatarUrl: string | null;
  capacity: number | null;
  currentIssue: EnrichedIssue | null;
  queuedIssues: EnrichedIssue[];
  recentDone: EnrichedIssue[];
  workloadPercentage: number;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function getWorkloadColor(pct: number): string {
  if (pct > 100) return "bg-red-500";
  if (pct >= 90) return "bg-orange-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-emerald-500";
}

function getWorkloadLabel(pct: number): string {
  if (pct > 100) return "Over capacity";
  if (pct >= 90) return "Full capacity";
  if (pct >= 50) return "Optimal";
  if (pct > 0) return "Under capacity";
  return "Available";
}

export function DevCard({ member }: { member: DevCardMember }) {
  const router = useRouter();
  const isIdle = !member.currentIssue && member.queuedIssues.length === 0;

  return (
    <div
      onClick={() => router.push(`/members/${member.id}`)}
      className={`bg-card rounded-xl overflow-hidden flex flex-col cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all ${
        member.status === "departed" ? "opacity-50" : ""
      }`}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center text-xs font-bold font-mono text-muted-foreground">
            {getInitials(member.displayName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-mono truncate">{member.displayName}</p>
          {member.role && (
            <p className="text-[11px] text-muted-foreground truncate">{member.role}</p>
          )}
        </div>
        <StatusBadge status={member.status} />
      </div>

      {/* Idle state */}
      {isIdle && member.status === "active" && (
        <div className="px-5 py-8 flex flex-col items-center gap-2 flex-1">
          <Inbox className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No tasks assigned</p>
        </div>
      )}

      {/* NOW — Current Task */}
      {member.currentIssue && (
        <div className="px-5 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
              Now
            </span>
          </div>
          <div className="rounded-lg bg-muted/20 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Link
                href={`/issue/${member.currentIssue!.jiraKey}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-bold font-mono hover:underline inline-flex items-center gap-1"
                style={{ color: member.currentIssue.boardColor }}
              >
                <IssueTypeIcon type={member.currentIssue.type} size={12} />
                {member.currentIssue.jiraKey}
              </Link>
              <DeploymentIndicator status={member.currentIssue.deploymentStatus} />
              <IssueStatusBadge status={member.currentIssue.status} />
            </div>
            <p className="text-xs text-foreground leading-relaxed line-clamp-2">
              {member.currentIssue.title}
            </p>
            {member.currentIssue.dueDate && (
              <p className="text-[10px] text-muted-foreground">
                Due {formatDate(member.currentIssue.dueDate)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* QUEUE — Upcoming Tasks */}
      {member.queuedIssues.length > 0 && (
        <div className="px-5 py-3">
          <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Queue ({member.queuedIssues.length})
          </p>
          <div className="space-y-1.5">
            {member.queuedIssues.slice(0, 3).map((issue) => (
              <div key={issue.id} className="flex items-center gap-2 py-1">
                {issue.startDate && (
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 whitespace-nowrap">
                    {formatDate(issue.startDate)}
                  </span>
                )}
                <Link
                  href={`/issue/${issue.jiraKey}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-bold font-mono shrink-0 hover:underline inline-flex items-center gap-1"
                  style={{ color: issue.boardColor }}
                >
                  <IssueTypeIcon type={issue.type} size={12} />
                  {issue.jiraKey}
                </Link>
                <DeploymentIndicator status={issue.deploymentStatus} />
                <span className="text-xs text-muted-foreground truncate">{issue.title}</span>
              </div>
            ))}
            {member.queuedIssues.length > 3 && (
              <p className="text-[10px] text-muted-foreground pl-1">
                +{member.queuedIssues.length - 3} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* DONE (7d) — Recent Completions */}
      {member.recentDone.length > 0 && (
        <div className="px-5 py-3">
          <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Done (7d)
          </p>
          <div className="space-y-1 opacity-60">
            {member.recentDone.slice(0, 3).map((issue) => (
              <div key={issue.id} className="flex items-center gap-2 py-0.5">
                <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                <Link
                  href={`/issue/${issue.jiraKey}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-mono text-muted-foreground shrink-0 hover:underline hover:text-foreground inline-flex items-center gap-1"
                >
                  <IssueTypeIcon type={issue.type} size={12} />
                  {issue.jiraKey}
                </Link>
                <DeploymentIndicator status={issue.deploymentStatus} />
                <span className="text-xs text-muted-foreground truncate">{issue.title}</span>
              </div>
            ))}
            {member.recentDone.length > 3 && (
              <p className="text-[10px] text-muted-foreground pl-5">
                +{member.recentDone.length - 3} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Workload Footer */}
      <div className="mt-auto px-5 py-4 bg-muted/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Workload
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {getWorkloadLabel(member.workloadPercentage)}
            </span>
            <span className="text-sm font-bold font-mono">
              {member.workloadPercentage}%
            </span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${getWorkloadColor(member.workloadPercentage)}`}
            style={{ width: `${Math.min(member.workloadPercentage, 100)}%` }}
          />
        </div>
        {isIdle && member.status === "active" && (
          <p className="text-[10px] text-muted-foreground mt-1.5">Available for assignment</p>
        )}
      </div>
    </div>
  );
}
