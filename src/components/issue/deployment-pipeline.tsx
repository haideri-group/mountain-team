"use client";

import { useState } from "react";
import {
  Rocket,
  Server,
  Globe,
  GitBranch,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TIMEZONE as PKT } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeploymentSite {
  siteName: string;
  siteLabel: string | null;
  deployedAt: string | null;
  branch: string | null;
  repoName: string | null;
}

interface PipelineStage {
  stage: string;
  environment: string;
  reached: boolean;
  sites: DeploymentSite[];
}

interface DeploymentPipelineProps {
  pipeline: PipelineStage[];
  isHotfix: boolean;
  loading: boolean;
}

// ─── Date Formatting ──────────────────────────────────────────────────────────

/**
 * Returns a compact date string like "10 Mar" or "Today" or "Yesterday"
 * for use in collapsed group summaries.
 */
function formatDateCompact(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();

  const todayPKT = now.toLocaleDateString("en-CA", { timeZone: PKT });
  const datePKT = d.toLocaleDateString("en-CA", { timeZone: PKT });

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayPKT = yesterday.toLocaleDateString("en-CA", { timeZone: PKT });

  if (datePKT === todayPKT) return "Today";
  if (datePKT === yesterdayPKT) return "Yesterday";

  return d.toLocaleDateString("en-GB", {
    timeZone: PKT,
    day: "numeric",
    month: "short",
  });
}

/**
 * Returns a full date+time string like "10 Mar at 4:38 PM"
 * for use in expanded per-site rows.
 */
function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();

  const todayPKT = now.toLocaleDateString("en-CA", { timeZone: PKT });
  const datePKT = d.toLocaleDateString("en-CA", { timeZone: PKT });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayPKT = yesterday.toLocaleDateString("en-CA", { timeZone: PKT });

  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: PKT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (datePKT === todayPKT) return `Today at ${timePart}`;
  if (datePKT === yesterdayPKT) return `Yesterday at ${timePart}`;

  const datePart = d.toLocaleDateString("en-GB", {
    timeZone: PKT,
    day: "numeric",
    month: "short",
  });

  return `${datePart} at ${timePart}`;
}

/**
 * Strips time from a PKT date string, yielding a date-only key "YYYY-MM-DD".
 * Used to detect whether all sites in a stage deployed on the same calendar day.
 */
function dateOnlyPKT(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-CA", { timeZone: PKT });
}

// ─── Stage Config ─────────────────────────────────────────────────────────────

type StageKey = "Staging" | "Production" | "Main";

interface StageConfig {
  icon: React.ComponentType<{ className?: string }>;
  dotClass: string;
  lineClass: string;
  labelClass: string;
  summaryBg: string;
  siteBg: string;
  checkColor: string;
}

const STAGE_CONFIG: Record<StageKey, StageConfig> = {
  Staging: {
    icon: Server,
    dotClass: "bg-amber-500",
    lineClass: "bg-amber-500",
    labelClass: "text-amber-600 dark:text-amber-400",
    summaryBg: "bg-amber-500/8",
    siteBg: "bg-amber-500/5",
    checkColor: "text-amber-500",
  },
  Production: {
    icon: Globe,
    dotClass: "bg-emerald-500",
    lineClass: "bg-emerald-500",
    labelClass: "text-emerald-600 dark:text-emerald-400",
    summaryBg: "bg-emerald-500/8",
    siteBg: "bg-emerald-500/5",
    checkColor: "text-emerald-500",
  },
  Main: {
    icon: GitBranch,
    dotClass: "bg-blue-500",
    lineClass: "bg-blue-500",
    labelClass: "text-blue-600 dark:text-blue-400",
    summaryBg: "bg-blue-500/8",
    siteBg: "bg-blue-500/5",
    checkColor: "text-blue-500",
  },
};

const UNREACHED_CONFIG = {
  dotClass: "bg-muted/20",
  labelClass: "text-muted-foreground/30",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determines whether all deployed sites in a stage share the same calendar day.
 * Returns that shared date string if uniform, null if mixed or no sites have dates.
 */
function getConsensusDate(sites: DeploymentSite[]): string | null {
  const deployed = sites.filter((s) => s.deployedAt !== null);
  if (deployed.length === 0) return null;

  const days = new Set(deployed.map((s) => dateOnlyPKT(s.deployedAt!)));
  if (days.size !== 1) return null;

  // All on the same day — return the most recent timestamp for display
  const latest = deployed.reduce((a, b) =>
    new Date(a.deployedAt!) > new Date(b.deployedAt!) ? a : b,
  );
  return latest.deployedAt!;
}

// ─── Stage Group Component ────────────────────────────────────────────────────

interface StageGroupProps {
  stage: PipelineStage;
}

function StageGroup({ stage }: StageGroupProps) {
  const config =
    STAGE_CONFIG[stage.stage as StageKey] ?? STAGE_CONFIG.Main;

  const deployedSites = stage.sites.filter((s) => s.deployedAt !== null);
  const consensusDate = getConsensusDate(stage.sites);
  const hasMixedDates = deployedSites.length > 0 && consensusDate === null;

  // Mixed-date stages default to expanded so the user can see the variation
  const [isExpanded, setIsExpanded] = useState(hasMixedDates);

  const siteCount = stage.sites.length;
  const deployedCount = deployedSites.length;
  const allDeployed = siteCount > 0 && deployedCount === siteCount;

  // Single-site stages get no collapse toggle — always show the row
  const isSingleSite = siteCount === 1;
  const showToggle = !isSingleSite && siteCount > 0;
  const showExpanded = isSingleSite || isExpanded;

  const summaryLabel = (() => {
    if (siteCount === 0) return null;
    if (allDeployed && consensusDate) {
      return formatDateCompact(consensusDate);
    }
    if (allDeployed && hasMixedDates) {
      return `${deployedCount} site${deployedCount !== 1 ? "s" : ""}`;
    }
    if (deployedCount > 0) {
      return `${deployedCount}/${siteCount}`;
    }
    return null;
  })();

  return (
    <div className="space-y-1">
      {/* Collapsible summary header */}
      <button
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors text-left ${
          showToggle ? "cursor-pointer hover:bg-muted/10" : "cursor-default"
        } ${isExpanded && showToggle ? config.summaryBg : ""}`}
        onClick={() => showToggle && setIsExpanded((v) => !v)}
        aria-expanded={showExpanded}
        disabled={!showToggle}
      >
        {/* Stage label */}
        <span
          className={`text-[10px] font-mono font-bold uppercase tracking-widest flex-1 ${config.labelClass}`}
        >
          {stage.stage}
        </span>

        {/* Count pill */}
        {siteCount > 1 && (
          <span className="text-[9px] font-mono text-muted-foreground/50">
            {deployedCount}/{siteCount}
          </span>
        )}

        {/* Consensus date or "all deployed" check */}
        {summaryLabel && !isExpanded && (
          <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
            {summaryLabel}
          </span>
        )}

        {allDeployed && !hasMixedDates && !isExpanded && (
          <CheckCircle2
            className={`h-3.5 w-3.5 shrink-0 ${config.checkColor}`}
          />
        )}

        {/* Chevron */}
        {showToggle && (
          <span className="text-muted-foreground/40 shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        )}
      </button>

      {/* Expanded site rows */}
      {showExpanded && stage.sites.length > 0 && (
        <div className="space-y-0.5 pl-1">
          {stage.sites.map((site) => (
            <div
              key={`${stage.stage}-${site.siteName}`}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${config.siteBg}`}
            >
              {/* Site label */}
              <span className="text-[10px] font-mono font-semibold text-foreground/80 min-w-0 flex-1 truncate">
                {site.siteLabel ?? site.siteName}
              </span>

              {/* Branch — only when it differs meaningfully */}
              {site.branch && (
                <code className="text-[9px] font-mono text-muted-foreground/50 shrink-0 truncate max-w-[80px]">
                  {site.branch}
                </code>
              )}

              {/* Deploy date */}
              {site.deployedAt ? (
                <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 whitespace-nowrap">
                  {formatDateFull(site.deployedAt)}
                </span>
              ) : (
                <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0 italic">
                  pending
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Circles ─────────────────────────────────────────────────────────

interface PipelineCirclesProps {
  pipeline: PipelineStage[];
}

function PipelineCircles({ pipeline }: PipelineCirclesProps) {
  return (
    <div className="flex items-center">
      {pipeline.map((stage, idx) => {
        const config =
          STAGE_CONFIG[stage.stage as StageKey] ?? STAGE_CONFIG.Main;
        const Icon = config.icon;
        const isLast = idx === pipeline.length - 1;

        return (
          <div key={stage.stage} className="flex items-center flex-1">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1 min-w-[52px]">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center transition-all ${
                  stage.reached
                    ? config.dotClass
                    : UNREACHED_CONFIG.dotClass
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${
                    stage.reached
                      ? "text-white"
                      : "text-muted-foreground/25"
                  }`}
                />
              </div>
              <span
                className={`text-[8px] font-mono font-bold uppercase tracking-wider ${
                  stage.reached
                    ? config.labelClass
                    : UNREACHED_CONFIG.labelClass
                }`}
              >
                {stage.stage}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div className="flex-1 mx-0.5 mb-3.5">
                <div
                  className={`h-0.5 rounded-full transition-all ${
                    stage.reached ? config.lineClass : "bg-muted/15"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function PipelineSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-2.5 w-24" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-0.5 flex-1" />
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-0.5 flex-1" />
        <Skeleton className="h-7 w-7 rounded-full" />
      </div>
      <div className="space-y-1.5 pt-1">
        <Skeleton className="h-7 w-full rounded-lg" />
        <Skeleton className="h-7 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ─── DeploymentPipeline ───────────────────────────────────────────────────────

export function DeploymentPipeline({
  pipeline,
  isHotfix,
  loading,
}: DeploymentPipelineProps) {
  if (loading) return <PipelineSkeleton />;

  const hasAnyDeployment = pipeline.some((s) => s.reached);
  if (!hasAnyDeployment) return null;

  const reachedStages = pipeline.filter(
    (s) => s.reached && s.sites.length > 0,
  );

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
          Deployments
        </p>
        {isHotfix && (
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            HOTFIX
          </span>
        )}
        {loading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />
        )}
      </div>

      {/* Pipeline circles visualization */}
      <PipelineCircles pipeline={pipeline} />

      {/* Stage groups — only reached stages with sites */}
      {reachedStages.length > 0 && (
        <div className="space-y-0.5 pt-0.5">
          {reachedStages.map((stage) => (
            <StageGroup key={stage.stage} stage={stage} />
          ))}
        </div>
      )}
    </div>
  );
}
