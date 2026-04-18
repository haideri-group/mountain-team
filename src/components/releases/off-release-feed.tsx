"use client";

import Link from "next/link";
import { useState } from "react";
import { Flame, Tag, Ghost, Rocket, Server, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import type { OffReleaseCategory, OffReleaseDeployment, OffReleaseResponse } from "./types";

function formatWhen(dateStr: string): string {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function categoryConfig(cat: OffReleaseCategory) {
  switch (cat) {
    case "hotfix":
      return { label: "Hotfix", icon: Flame, color: "text-rose-500", bg: "bg-rose-500/10" };
    case "untagged":
      return { label: "Untagged", icon: Tag, color: "text-amber-500", bg: "bg-amber-500/10" };
    case "orphan":
      return { label: "Orphan", icon: Ghost, color: "text-slate-400", bg: "bg-slate-500/10" };
  }
}

function EnvIcon({ env }: { env: string }) {
  if (env === "production" || env === "canonical") {
    return <Rocket className="h-3 w-3 text-emerald-500" />;
  }
  return <Server className="h-3 w-3 text-amber-500" />;
}

export function OffReleaseFeed({ data, loading }: { data: OffReleaseResponse | null; loading: boolean }) {
  const [category, setCategory] = useState<OffReleaseCategory | "all">("all");

  if (loading && !data) {
    return (
      <div className="bg-card rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading off-release deployments…</p>
      </div>
    );
  }

  if (!data) return null;

  const filtered =
    category === "all"
      ? data.deployments
      : data.deployments.filter((d) => d.category === category);

  const windowLabel = data.windowDays === 1 ? "last 24h" : `last ${data.windowDays} days`;

  return (
    <div className="space-y-3">
      {/* Category pills */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CategoryPill
            active={category === "all"}
            onClick={() => setCategory("all")}
            label="All"
            count={data.counts.total}
          />
          <CategoryPill
            active={category === "hotfix"}
            onClick={() => setCategory("hotfix")}
            label="Hotfix"
            count={data.counts.hotfix}
            accent="rose"
          />
          <CategoryPill
            active={category === "untagged"}
            onClick={() => setCategory("untagged")}
            label="Untagged"
            count={data.counts.untagged}
            accent="amber"
          />
          <CategoryPill
            active={category === "orphan"}
            onClick={() => setCategory("orphan")}
            label="Orphan"
            count={data.counts.orphan}
            accent="slate"
          />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider">
          {windowLabel}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {category === "all"
              ? "No off-release deployments in this window — every deploy was tied to a release."
              : `No ${category} deployments in this window.`}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl divide-y divide-foreground/5">
          {filtered.map((d) => (
            <OffReleaseRow key={d.id} deployment={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryPill({
  active,
  onClick,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: "rose" | "amber" | "slate";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider transition-all",
        active
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/10",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "text-[9px] px-1.5 py-0.5 rounded-full",
          active ? "bg-background" : "bg-muted/30",
          accent === "rose" && count > 0 && "text-rose-500",
          accent === "amber" && count > 0 && "text-amber-500",
          accent === "slate" && count > 0 && "text-slate-400",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function OffReleaseRow({ deployment: d }: { deployment: OffReleaseDeployment }) {
  const cfg = categoryConfig(d.category);
  const Icon = cfg.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/5 transition-colors">
      {/* Category chip */}
      <div
        className={cn(
          "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
          cfg.bg,
        )}
        title={cfg.label}
      >
        <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
      </div>

      {/* Issue type */}
      {d.issueType && <IssueTypeIcon type={d.issueType} size={12} />}

      {/* JIRA key */}
      <Link
        href={`/issue/${d.jiraKey}`}
        className="text-[11px] font-bold font-mono shrink-0 hover:underline"
        style={{ color: d.boardColor }}
      >
        {d.jiraKey}
      </Link>

      {/* Title */}
      <span className="text-xs text-foreground truncate flex-1 min-w-0">
        {d.issueTitle || <span className="italic text-muted-foreground">No issue record</span>}
      </span>

      {/* Env + site */}
      <div className="flex items-center gap-1.5 shrink-0">
        <EnvIcon env={d.environment} />
        {d.siteLabel && (
          <span className="text-[10px] font-mono text-muted-foreground">{d.siteLabel}</span>
        )}
      </div>

      {/* Branch */}
      <div className="hidden md:flex items-center gap-1 shrink-0 text-[10px] font-mono text-muted-foreground/70 max-w-[180px]">
        <GitBranch className="h-3 w-3" />
        <span className="truncate">{d.branch}</span>
      </div>

      {/* Time */}
      <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 w-[60px] text-right">
        {formatWhen(d.deployedAt)}
      </span>
    </div>
  );
}
