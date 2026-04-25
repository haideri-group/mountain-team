"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChartInfo } from "./chart-info";
import { TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

interface DeveloperRankRow {
  memberId: string;
  memberName: string;
  memberInitials: string;
  avatarUrl?: string | null;
  doneCount: number;
  missedCount: number;
  onTimePercentage: number;
  avgCycleTime: number;
  trend: "up" | "down" | "steady";
}

interface DeveloperRankingProps {
  data: DeveloperRankRow[];
}

type SortKey = "doneCount" | "missedCount" | "onTimePercentage" | "avgCycleTime";
type SortDir = "asc" | "desc";

function TrendIcon({ trend }: { trend: "up" | "down" | "steady" }) {
  if (trend === "up")
    return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === "down")
    return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function SortIcon({
  col,
  active,
  dir,
}: {
  col: SortKey;
  active: SortKey;
  dir: SortDir;
}) {
  if (active !== col)
    return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3 text-primary" />
  ) : (
    <ChevronDown className="h-3 w-3 text-primary" />
  );
}

export function DeveloperRanking({ data }: DeveloperRankingProps) {
  const [sortKey, setSortKey] = useState<SortKey>("doneCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold font-mono uppercase tracking-wider">
              Developer Ranking
            </h3>
            <ChartInfo chartId="developerRanking" />
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const mul = sortDir === "asc" ? 1 : -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * mul;
  });

  const headerCell =
    "px-4 py-3 text-left text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground select-none";
  const sortableCell = `${headerCell} cursor-pointer hover:text-foreground transition-colors`;

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Developer Ranking
          </h3>
          <ChartInfo chartId="developerRanking" />
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {data.length} developers
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/20">
              <th className={`${headerCell} w-10`}>#</th>
              <th className={headerCell}>Developer</th>
              <th
                className={sortableCell}
                onClick={() => handleSort("doneCount")}
              >
                <span className="flex items-center gap-1">
                  Completed
                  <SortIcon col="doneCount" active={sortKey} dir={sortDir} />
                </span>
              </th>
              <th
                className={sortableCell}
                onClick={() => handleSort("missedCount")}
              >
                <span className="flex items-center gap-1">
                  Missed
                  <SortIcon col="missedCount" active={sortKey} dir={sortDir} />
                </span>
              </th>
              <th
                className={sortableCell}
                onClick={() => handleSort("onTimePercentage")}
              >
                <span className="flex items-center gap-1">
                  On-Time %
                  <SortIcon
                    col="onTimePercentage"
                    active={sortKey}
                    dir={sortDir}
                  />
                </span>
              </th>
              <th
                className={sortableCell}
                onClick={() => handleSort("avgCycleTime")}
              >
                <span className="flex items-center gap-1">
                  Avg Cycle
                  <SortIcon
                    col="avgCycleTime"
                    active={sortKey}
                    dir={sortDir}
                  />
                </span>
              </th>
              <th className={headerCell}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((dev, idx) => (
              <tr
                key={dev.memberId}
                className="border-t border-muted/20 hover:bg-muted/10 transition-colors"
              >
                {/* Rank */}
                <td className="px-4 py-3 text-xs font-bold font-mono text-muted-foreground tabular-nums">
                  {idx + 1}
                </td>

                {/* Developer */}
                <td className="px-4 py-3">
                  <Link
                    href={`/members/${dev.memberId}`}
                    className="flex items-center gap-3 group"
                  >
                    {dev.avatarUrl ? (
                      <Image
                        src={dev.avatarUrl}
                        alt={dev.memberName}
                        width={28}
                        height={28}
                        unoptimized
                        className="h-7 w-7 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold font-mono shrink-0"
                        style={{ backgroundColor: "#ff8400" }}
                      >
                        {dev.memberInitials}
                      </div>
                    )}
                    <span className="text-sm font-semibold truncate max-w-[160px] group-hover:text-primary transition-colors">
                      {dev.memberName}
                    </span>
                  </Link>
                </td>

                {/* Completed */}
                <td className="px-4 py-3 text-sm font-bold font-mono tabular-nums">
                  {dev.doneCount}
                </td>

                {/* Missed */}
                <td className="px-4 py-3 text-sm font-mono tabular-nums">
                  <span
                    className={
                      dev.missedCount > 0
                        ? "text-red-600 dark:text-red-400 font-bold"
                        : "text-muted-foreground"
                    }
                  >
                    {dev.missedCount}
                  </span>
                </td>

                {/* On-Time % */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${dev.onTimePercentage}%`,
                          backgroundColor:
                            dev.onTimePercentage >= 90
                              ? "#166534"
                              : dev.onTimePercentage >= 70
                                ? "#f59e0b"
                                : "#ba1a1a",
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold font-mono tabular-nums">
                      {dev.onTimePercentage.toFixed(0)}%
                    </span>
                  </div>
                </td>

                {/* Avg Cycle */}
                <td className="px-4 py-3 text-xs font-mono tabular-nums text-muted-foreground">
                  {dev.avgCycleTime.toFixed(1)}d
                </td>

                {/* Trend */}
                <td className="px-4 py-3">
                  <TrendIcon trend={dev.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
