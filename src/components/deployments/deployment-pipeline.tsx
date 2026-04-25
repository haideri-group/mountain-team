"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { DeploymentIndicator } from "@/components/overview/deployment-indicator";
import type { PipelineTask } from "./types";

function getInitials(name: string): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase() || "?";
}

function PipelineColumn({
  title,
  tasks,
  color,
}: {
  title: string;
  tasks: PipelineTask[];
  color: string;
}) {
  return (
    <div className="flex flex-col min-w-[240px] flex-1">
      <div className={cn("flex items-center justify-between px-3 py-2 rounded-t-lg", color)}>
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-foreground">
          {title}
        </span>
        <span className="text-[10px] font-bold font-mono text-foreground/70">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 bg-muted/10 rounded-b-lg p-2 space-y-1.5 min-h-[100px] max-h-[500px] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-muted/40 scrollbar-track-transparent hover:scrollbar-thumb-muted/60"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-muted) transparent" }}>
        {tasks.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/50 text-center py-4">No tasks</p>
        ) : (
          tasks.map((task) => (
            <Link
              key={task.jiraKey}
              href={`/issue/${task.jiraKey}`}
              className="block bg-card rounded-lg p-2.5 hover:ring-1 hover:ring-primary/20 transition-all space-y-1"
            >
              <div className="flex items-center gap-1.5">
                <IssueTypeIcon type={task.issueType} size={12} />
                <span className="text-[11px] font-bold font-mono" style={{ color: task.boardColor }}>
                  {task.jiraKey}
                </span>
                <DeploymentIndicator status={task.deploymentStatus} />
                {task.daysInStatus >= 3 && (
                  <span className="text-[9px] font-mono text-amber-500 ml-auto">{task.daysInStatus}d</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{task.title}</p>
              {task.expectedSites && task.expectedSites.length > 0 && task.deployedSites.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round((task.deployedSites.length / task.expectedSites.length) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[8px] font-mono text-muted-foreground shrink-0">
                    {task.deployedSites.length}/{task.expectedSites.length}
                  </span>
                </div>
              )}
              {task.assigneeName && (
                <div className="flex items-center gap-1.5">
                  {task.assigneeAvatar ? (
                    // unoptimized: tiny multi-domain avatars (see issue-activity.tsx for full reasoning)
                    <Image src={task.assigneeAvatar} alt="" width={14} height={14} unoptimized referrerPolicy="no-referrer" className="h-3.5 w-3.5 rounded-full" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full bg-muted/50 flex items-center justify-center text-[6px] font-bold font-mono text-muted-foreground">
                      {getInitials(task.assigneeName)}
                    </div>
                  )}
                  <span className="text-[9px] text-muted-foreground truncate">{task.assigneeName}</span>
                </div>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export function DeploymentPipelineView({ pipeline }: {
  pipeline: {
    readyForTesting: PipelineTask[];
    readyForLive: PipelineTask[];
    rollingOut: PipelineTask[];
    postLiveTesting: PipelineTask[];
  };
}) {
  return (
    <div className="grid grid-cols-4 gap-3 overflow-x-auto pb-2">
      <PipelineColumn title="Ready for Testing" tasks={pipeline.readyForTesting} color="bg-amber-500/10" />
      <PipelineColumn title="Ready for Live" tasks={pipeline.readyForLive} color="bg-orange-500/10" />
      <PipelineColumn title="Rolling Out" tasks={pipeline.rollingOut} color="bg-emerald-500/10" />
      <PipelineColumn title="Post Live Testing" tasks={pipeline.postLiveTesting} color="bg-blue-500/10" />
    </div>
  );
}
