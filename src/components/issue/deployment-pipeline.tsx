"use client";

import {
  Rocket,
  Server,
  Globe,
  GitBranch,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PipelineStage {
  stage: string;
  environment: string;
  reached: boolean;
  sites: Array<{
    siteName: string;
    siteLabel: string | null;
    deployedAt: string | null;
    branch: string | null;
    repoName: string | null;
  }>;
}

interface DeploymentPipelineProps {
  pipeline: PipelineStage[];
  isHotfix: boolean;
  loading: boolean;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

const stageIcons = {
  Staging: Server,
  Production: Globe,
  Main: GitBranch,
};

const stageColors = {
  Staging: {
    reached: "bg-amber-500",
    unreached: "bg-muted/30",
    text: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  Production: {
    reached: "bg-emerald-500",
    unreached: "bg-muted/30",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  Main: {
    reached: "bg-blue-500",
    unreached: "bg-muted/30",
    text: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  },
};

export function DeploymentPipeline({
  pipeline,
  isHotfix,
  loading,
}: DeploymentPipelineProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-1 flex-1" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-1 flex-1" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    );
  }

  const hasAnyDeployment = pipeline.some((s) => s.reached);
  if (!hasAnyDeployment) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
          Deployments
        </p>
        {isHotfix && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            HOTFIX
          </span>
        )}
      </div>

      {/* Pipeline visualization */}
      <div className="flex items-center gap-0">
        {pipeline.map((stage, idx) => {
          const colors = stageColors[stage.stage as keyof typeof stageColors] || stageColors.Main;
          const Icon = stageIcons[stage.stage as keyof typeof stageIcons] || GitBranch;

          return (
            <div key={stage.stage} className="flex items-center flex-1">
              {/* Stage circle */}
              <div className="flex flex-col items-center gap-1.5 min-w-[60px]">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
                    stage.reached ? colors.reached : colors.unreached
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${stage.reached ? "text-white" : "text-muted-foreground/40"}`}
                  />
                </div>
                <span
                  className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
                    stage.reached ? colors.text : "text-muted-foreground/40"
                  }`}
                >
                  {stage.stage}
                </span>
              </div>

              {/* Connector line */}
              {idx < pipeline.length - 1 && (
                <div className="flex-1 mx-1">
                  <div
                    className={`h-0.5 rounded-full transition-all ${
                      stage.reached ? colors.reached : "bg-muted/20"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Site details for reached stages */}
      <div className="space-y-2">
        {pipeline
          .filter((s) => s.reached && s.sites.length > 0)
          .map((stage) => {
            const colors = stageColors[stage.stage as keyof typeof stageColors] || stageColors.Main;
            return (
              <div key={stage.stage} className="space-y-1">
                {stage.sites.map((site) => (
                  <div
                    key={`${stage.stage}-${site.siteName}`}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/10"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}
                      >
                        {site.siteLabel || site.siteName}
                      </span>
                      {site.branch && (
                        <code className="text-[10px] text-muted-foreground">
                          {site.branch}
                        </code>
                      )}
                    </div>
                    {site.deployedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(site.deployedAt)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}
