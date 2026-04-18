"use client";

import Link from "next/link";
import { TrendingUp, Plus, Minus } from "lucide-react";
import { InfoButton } from "@/components/shared/info-modal";
import { formatSmartDate } from "@/components/issue/issue-helpers";

interface ScopeCreepEntry {
  jiraKey: string;
  addedAt: string;
  removedAt: string | null;
}

export function ScopeCreepPanel({ entries }: { entries: ScopeCreepEntry[] }) {
  // Sort most-recent first, then active-before-removed at the same timestamp.
  const sorted = [...entries].sort((a, b) => {
    const aTs = new Date(a.removedAt || a.addedAt).getTime();
    const bTs = new Date(b.removedAt || b.addedAt).getTime();
    return bTs - aTs;
  });

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Scope changes
          </h3>
          <InfoButton guideKey="scopeCreep" />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No issues added after the release was created. Scope stable.
        </p>
      ) : (
        <ul className="space-y-2 max-h-[260px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {sorted.map((e) => {
            const isRemoved = !!e.removedAt;
            return (
              <li
                key={`${e.jiraKey}-${e.addedAt}`}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/10 transition-colors"
              >
                {isRemoved ? (
                  <Minus className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                ) : (
                  <Plus className="h-3 w-3 text-amber-500 shrink-0" />
                )}
                <Link
                  href={`/issue/${e.jiraKey}`}
                  className="text-[11px] font-bold font-mono shrink-0 hover:underline text-foreground"
                >
                  {e.jiraKey}
                </Link>
                <span className="text-[10px] text-muted-foreground flex-1 truncate">
                  {isRemoved ? `Removed` : `Added`} {formatSmartDate(e.removedAt || e.addedAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
