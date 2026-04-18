"use client";

import {
  useState,
  useRef,
  useCallback,
} from "react";
import Link from "next/link";
import {
  Flame,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Users,
} from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { cn } from "@/lib/utils";

// ---- Types ----

interface WorkloadTask {
  jiraKey: string;
  title: string;
  status: string;
  storyPoints: number | null;
  type: string | null;
  boardKey: string;
  boardColor: string;
  weight: number;
}

interface TrendPoint {
  week: string;
  percentage: number;
}

interface WorkloadMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  teamName: string | null;
  capacity: number;
  status: "active" | "on_leave" | "departed";
  assignedCount: number;
  inProgressCount: number;
  activePoints: number;
  completedCount: number;
  percentage: number;
  level: "idle" | "under" | "optimal" | "high" | "over";
  tasks: WorkloadTask[];
  totalTaskCount: number;
  trend: TrendPoint[];
  trendDirection: "up" | "down" | "steady";
  burnoutRisk: boolean;
  weeksOverCapacity: number;
}

interface CapacityChartProps {
  members: WorkloadMember[];
}

// ---- Helpers ----

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function getLevelForPercentage(pct: number): "idle" | "under" | "optimal" | "high" | "over" {
  if (pct === 0) return "idle";
  if (pct < 50) return "under";
  if (pct < 80) return "optimal";
  if (pct <= 100) return "high";
  return "over";
}

function getBarColor(level: WorkloadMember["level"]): string {
  switch (level) {
    case "over":
      return "bg-orange-500";
    case "high":
      return "bg-orange-500";
    case "optimal":
      return "bg-amber-400";
    case "under":
      return "bg-emerald-500";
    case "idle":
      return "bg-muted/30";
  }
}

function getDotColor(level: "idle" | "under" | "optimal" | "high" | "over"): string {
  switch (level) {
    case "over":
      return "bg-red-500";
    case "high":
      return "bg-orange-500";
    case "optimal":
      return "bg-amber-400";
    case "under":
      return "bg-emerald-500";
    case "idle":
      return "bg-muted-foreground/30";
  }
}

function getPercentageColor(level: WorkloadMember["level"]): string {
  switch (level) {
    case "over":
      return "text-red-600";
    case "high":
      return "text-orange-500";
    case "optimal":
      return "text-foreground";
    case "under":
      return "text-emerald-600";
    case "idle":
      return "text-muted-foreground";
  }
}

// ---- Sparkline ----

function TrendSparkline({
  trend,
  trendDirection,
}: {
  trend: TrendPoint[];
  trendDirection: "up" | "down" | "steady";
}) {
  const TrendIcon =
    trendDirection === "up"
      ? ArrowUp
      : trendDirection === "down"
        ? ArrowDown
        : ArrowRight;

  const trendColor =
    trendDirection === "up"
      ? "text-red-500"
      : trendDirection === "down"
        ? "text-emerald-500"
        : "text-muted-foreground";

  // Pad to 8 dots if we have fewer
  const dots: (TrendPoint | null)[] = [
    ...Array(Math.max(0, 8 - trend.length)).fill(null),
    ...trend,
  ];

  return (
    <div className="flex items-center gap-1">
      {/* 8 dots */}
      <div className="flex items-center gap-0.5">
        {dots.map((point, i) => {
          const isCurrentWeek = i === dots.length - 1;
          const level = point ? getLevelForPercentage(point.percentage) : "idle";
          return (
            <div
              key={i}
              title={point ? `${point.week}: ${point.percentage}%` : undefined}
              className={cn(
                "rounded-full transition-all",
                getDotColor(level),
                point ? "opacity-100" : "opacity-20",
                isCurrentWeek ? "h-2.5 w-2.5" : "h-1.5 w-1.5",
              )}
            />
          );
        })}
      </div>

      {/* Direction arrow */}
      <TrendIcon className={cn("h-3 w-3 ml-0.5 shrink-0", trendColor)} />
    </div>
  );
}

// ---- Hover Tooltip ----

interface TooltipState {
  memberId: string;
  top: number;
  left: number;
}

function MemberTooltip({
  member,
  style,
  onClose,
}: {
  member: WorkloadMember;
  style: React.CSSProperties;
  onClose: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const VISIBLE_TASKS = 5;
  const extraTasks = member.totalTaskCount - VISIBLE_TASKS;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 w-[300px] bg-popover ring-1 ring-foreground/10 shadow-2xl rounded-xl overflow-hidden"
      style={style}
      onMouseLeave={onClose}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2.5 bg-muted/20">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <Link
            href={`/members/${member.id}`}
            className="text-sm font-bold font-mono hover:underline text-foreground truncate max-w-[160px]"
            onClick={onClose}
          >
            {member.displayName}
          </Link>
          <span
            className={cn(
              "text-sm font-bold font-mono shrink-0",
              getPercentageColor(member.level),
            )}
          >
            {member.percentage}%
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {member.totalTaskCount} task{member.totalTaskCount !== 1 ? "s" : ""} ·{" "}
          {member.activePoints} pts / {member.capacity} capacity
        </p>
      </div>

      {/* Task list */}
      {member.tasks.length > 0 ? (
        <div className="px-4 py-2.5 space-y-2">
          {member.tasks.slice(0, VISIBLE_TASKS).map((task) => (
            <div
              key={task.jiraKey}
              className="flex items-start gap-2 group"
            >
              <IssueTypeIcon type={task.type} size={12} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/issue/${task.jiraKey}`}
                  className="text-[11px] font-bold font-mono hover:underline shrink-0"
                  style={{ color: task.boardColor }}
                  onClick={onClose}
                >
                  {task.jiraKey}
                </Link>
                <span className="text-[11px] text-muted-foreground ml-1.5 truncate inline-block max-w-[160px] align-bottom">
                  {task.title}
                </span>
              </div>
              <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
                {task.weight > 0 ? `${task.weight}pt` : "—"}
              </span>
            </div>
          ))}
          {extraTasks > 0 && (
            <p className="text-[10px] text-muted-foreground pl-4">
              +{extraTasks} more task{extraTasks !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 text-[11px] text-muted-foreground">
          No active tasks
        </div>
      )}

      {/* Footer CTA */}
      <div className="px-4 pb-3.5 pt-1">
        <Link
          href={`/members/${member.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold font-mono text-primary hover:underline"
          onClick={onClose}
        >
          View profile →
        </Link>
      </div>
    </div>
  );
}

// ---- Single Bar Row ----

function BarRow({
  member,
  onHover,
  onLeave,
  isHovered,
}: {
  member: WorkloadMember;
  onHover: (id: string, e: React.MouseEvent<HTMLDivElement>) => void;
  onLeave: () => void;
  isHovered: boolean;
}) {
  // Scale: 150% = full bar width. So 100% capacity = 66.7% of visual bar.
  // This ensures even 150% members stay within the container.
  const maxScale = 150;
  const barPct = Math.min(member.percentage, maxScale);
  const mainBarWidth = Math.min(member.percentage, 100) / maxScale * 100; // 0-66.7%
  const overflowBarWidth = member.percentage > 100
    ? (Math.min(member.percentage, maxScale) - 100) / maxScale * 100
    : 0;
  const capacityLinePos = (100 / maxScale) * 100; // 66.7% position

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2.5 rounded-lg px-2 transition-colors",
        isHovered ? "bg-muted/20" : "hover:bg-muted/10",
      )}
    >
      {/* Left: avatar + name — fixed 180px */}
      <div className="flex w-[180px] shrink-0 items-center gap-2.5 min-w-0">
        <Link
          href={`/members/${member.id}`}
          className="shrink-0 hover:opacity-80 transition-opacity"
        >
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={member.displayName}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-[10px] font-bold font-mono text-muted-foreground">
              {getInitials(member.displayName)}
            </div>
          )}
        </Link>
        <Link
          href={`/members/${member.id}`}
          className="text-xs font-semibold text-foreground hover:underline truncate leading-tight"
        >
          {member.displayName}
        </Link>
      </div>

      {/* Center: bar track */}
      <div
        className="relative flex-1 h-7 cursor-pointer"
        onMouseEnter={(e) => onHover(member.id, e)}
        onMouseLeave={onLeave}
      >
        {/* Background track */}
        <div className="absolute inset-0 rounded-md bg-muted/20" />

        {/* Main bar (0–100% capacity, scaled to fit) */}
        {mainBarWidth > 0 && (
          <div
            className={cn(
              "absolute left-0 top-0 h-full rounded-l-md transition-all duration-500",
              overflowBarWidth === 0 ? "rounded-r-md" : "rounded-r-none",
              getBarColor(member.level),
            )}
            style={{ width: `${mainBarWidth}%` }}
          />
        )}

        {/* Overflow bar (>100% — red portion, scaled) */}
        {overflowBarWidth > 0 && (
          <div
            className="absolute top-0 h-full rounded-r-md bg-red-500 transition-all duration-500"
            style={{
              left: `${mainBarWidth}%`,
              width: `${overflowBarWidth}%`,
            }}
          />
        )}

        {/* 100% capacity line */}
        <div
          className="absolute top-0 h-full w-px border-l border-dashed border-foreground/20"
          style={{ left: `${capacityLinePos}%` }}
        />

        {/* Idle placeholder text */}
        {member.level === "idle" && (
          <span className="absolute inset-0 flex items-center pl-3 text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
            Idle
          </span>
        )}
      </div>

      {/* Right: percentage + sparkline + burnout */}
      <div className="flex w-[140px] shrink-0 items-center justify-end gap-2">
        {/* Trend sparkline */}
        {member.trend.length > 0 && (
          <TrendSparkline
            trend={member.trend}
            trendDirection={member.trendDirection}
          />
        )}

        {/* Percentage */}
        <span
          className={cn(
            "w-[44px] text-right text-sm font-bold font-mono",
            getPercentageColor(member.level),
          )}
        >
          {member.percentage}%
        </span>

        {/* Burnout flame */}
        {member.burnoutRisk && (
          <div
            title={`100%+ for ${member.weeksOverCapacity} consecutive week${member.weeksOverCapacity !== 1 ? "s" : ""}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center"
          >
            <Flame className="h-4 w-4 text-orange-500" />
          </div>
        )}
        {!member.burnoutRisk && <div className="w-5 shrink-0" />}
      </div>
    </div>
  );
}

// ---- Main Chart ----

export function CapacityChart({ members }: CapacityChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleBarHover = useCallback(
    (memberId: string, e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const POPOVER_WIDTH = 300;
      const POPOVER_HEIGHT = 220; // estimate

      let left = rect.right + window.scrollX + 10;
      let top = rect.top + window.scrollY - 8;

      // Flip left if overflowing right edge
      if (left + POPOVER_WIDTH > window.innerWidth + window.scrollX - 16) {
        left = rect.left + window.scrollX - POPOVER_WIDTH - 10;
      }

      // Clamp top to viewport
      const maxTop = window.innerHeight + window.scrollY - POPOVER_HEIGHT - 16;
      if (top > maxTop) top = maxTop;
      if (top < window.scrollY + 8) top = window.scrollY + 8;

      setTooltip({ memberId, top, left });
    },
    [],
  );

  const handleLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (members.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 flex flex-col items-center gap-3 text-center">
        <Users className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No team members found.</p>
      </div>
    );
  }

  const hoveredMember = tooltip
    ? members.find((m) => m.id === tooltip.memberId)
    : null;

  return (
    <>
      <div className="bg-card rounded-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
            Capacity Distribution
          </span>
          <div className="flex items-center gap-4">
            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {(
                [
                  { label: "Idle", color: "bg-muted/40" },
                  { label: "Under", color: "bg-emerald-500" },
                  { label: "Optimal", color: "bg-amber-400" },
                  { label: "High", color: "bg-orange-500" },
                  { label: "Over", color: "bg-red-500" },
                ] as const
              ).map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={cn("h-2 w-2 rounded-full", color)} />
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 mb-1 px-2">
          <div className="w-[180px] shrink-0" />
          <div className="relative flex-1">
            {/* 100% marker label */}
            <span className="absolute right-0 -top-1 text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">
              100%
            </span>
          </div>
          <div className="w-[140px] shrink-0" />
        </div>

        {/* Bar rows */}
        <div className="relative space-y-0.5">
          {members.map((member) => (
            <BarRow
              key={member.id}
              member={member}
              onHover={handleBarHover}
              onLeave={handleLeave}
              isHovered={tooltip?.memberId === member.id}
            />
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-5 pt-4 border-t border-muted/20 flex items-center justify-between flex-wrap gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {members.length} member{members.length !== 1 ? "s" : ""} · Sorted by workload descending
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            Hover a bar for task breakdown
          </span>
        </div>
      </div>

      {/* Fixed tooltip portal */}
      {tooltip && hoveredMember && (
        <MemberTooltip
          member={hoveredMember}
          style={{ top: tooltip.top, left: tooltip.left }}
          onClose={handleLeave}
        />
      )}
    </>
  );
}
