"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Clock, RefreshCw } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PeriodSummary {
  jira: number;
  timedoctor: number;
  other: number;
  total: number;
}

interface TimeTrackingData {
  summary: {
    today: PeriodSummary;
    yesterday: PeriodSummary;
    thisWeek: PeriodSummary;
    thisMonth: PeriodSummary;
  };
  dailyBreakdown: {
    date: string;
    label: string;
    jiraSeconds: number;
    timedoctorSeconds: number;
    otherSeconds: number;
    totalSeconds: number;
    isToday: boolean;
  }[];
  recentWorklogs: {
    jiraKey: string;
    issueTitle: string;
    boardKey: string;
    boardColor: string;
    date: string;
    seconds: number;
  }[];
  recentOtherWork: {
    taskName: string;
    projectName: string | null;
    date: string;
    seconds: number;
  }[];
  hasTimeDoctorData: boolean;
  lastSyncedAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds === 0) return "0h";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  const d = new Date(`${dateStr}T12:00:00+05:00`);
  return d.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", month: "short", day: "numeric" });
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-xl rounded-lg ring-1 ring-foreground/10 shadow-lg px-3 py-2 space-y-1">
      <p className="text-[10px] font-mono text-muted-foreground">{data.date}</p>
      {data.jiraHours > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          <span className="text-xs font-mono">Issues: {formatTime(data.jiraSeconds)}</span>
        </div>
      )}
      {data.otherHours > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          <span className="text-xs font-mono">Other: {formatTime(data.otherSeconds)}</span>
        </div>
      )}
      <p className="text-xs font-bold font-mono pt-0.5 border-t border-foreground/5">
        Total: {formatTime(data.totalSeconds)}
      </p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TimeTracking({ memberId }: { memberId: string }) {
  const [data, setData] = useState<TimeTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/team/${memberId}/time-tracking`);
      if (res.ok) setData(await res.json());
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/sync/worklogs?days=3", { method: "POST" });
      await fetchData();
    } catch {
      // Silent fail
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl p-5 space-y-4 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted/50 rounded-xl" />
          ))}
        </div>
        <div className="h-36 bg-muted/50 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, dailyBreakdown, recentWorklogs, recentOtherWork, hasTimeDoctorData, lastSyncedAt } = data;
  const hasAnyData = summary.today.total > 0 || summary.yesterday.total > 0 || summary.thisWeek.total > 0 || summary.thisMonth.total > 0;

  const summaryCards: { label: string; data: PeriodSummary }[] = [
    { label: "Today", data: summary.today },
    { label: "Yesterday", data: summary.yesterday },
    { label: "This Week", data: summary.thisWeek },
    { label: "This Month", data: summary.thisMonth },
  ];

  // Chart data
  const chartData = dailyBreakdown.map((d) => ({
    ...d,
    jiraHours: +(d.jiraSeconds / 3600).toFixed(1),
    otherHours: +(d.otherSeconds / 3600).toFixed(1),
    totalHours: +(d.totalSeconds / 3600).toFixed(1),
  }));
  const maxHours = Math.max(...chartData.map((d) => d.jiraHours + d.otherHours), 1);

  return (
    <div className="bg-card rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Time Tracking
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {lastSyncedAt && (
            <span className="text-[10px] font-mono text-muted-foreground">
              Synced {timeAgo(lastSyncedAt)}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-md hover:bg-muted/30 transition-colors disabled:opacity-50"
            title="Refresh time tracking data"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!hasAnyData && recentWorklogs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <Clock className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No time logged</p>
          <p className="text-[10px] text-muted-foreground/60">
            Worklogs from JIRA{hasTimeDoctorData ? " and Time Doctor" : ""} will appear here once synced
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {summaryCards.map((card) => (
              <div key={card.label} className="bg-muted/20 rounded-xl p-4">
                <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  {card.label}
                </p>
                <p className="text-xl font-bold font-mono">
                  {formatTime(card.data.total)}
                </p>
                {hasTimeDoctorData && card.data.total > 0 && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    <span className="text-primary">{formatTime(card.data.jira)}</span>
                    {card.data.other > 0 && (
                      <span className="text-amber-500"> + {formatTime(card.data.other)}</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Daily Activity Chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                Daily Activity (14 days)
              </p>
              {hasTimeDoctorData && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-[9px] font-mono text-muted-foreground">Issues</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-[9px] font-mono text-muted-foreground">Other</span>
                  </div>
                </div>
              )}
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, Math.ceil(maxHours)]}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Bar
                    dataKey="jiraHours"
                    stackId="time"
                    radius={hasTimeDoctorData ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                    maxBarSize={24}
                    className="fill-primary"
                  />
                  {hasTimeDoctorData && (
                    <Bar
                      dataKey="otherHours"
                      stackId="time"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={24}
                      className="fill-amber-500/60"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent JIRA Worklogs */}
          {recentWorklogs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">
                {hasTimeDoctorData ? "Issue Work (7 days)" : "Recent Work (7 days)"}
              </p>
              <div className="space-y-1.5">
                {recentWorklogs.slice(0, 8).map((wl, idx) => (
                  <div key={`${wl.jiraKey}-${wl.date}-${idx}`} className="flex items-center gap-3 py-1.5">
                    <Link
                      href={`/issue/${wl.jiraKey}`}
                      className="text-xs font-bold font-mono shrink-0 hover:underline"
                      style={{ color: wl.boardColor }}
                    >
                      {wl.jiraKey}
                    </Link>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {wl.issueTitle}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                      {formatDateLabel(wl.date)}
                    </span>
                    <span className="text-xs font-bold font-mono shrink-0">
                      {formatTime(wl.seconds)}
                    </span>
                  </div>
                ))}
                {recentWorklogs.length > 8 && (
                  <p className="text-[10px] text-muted-foreground pl-1">
                    +{recentWorklogs.length - 8} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Recent Other Work (Time Doctor) */}
          {hasTimeDoctorData && recentOtherWork.length > 0 && (
            <div>
              <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
                Other Work (7 days)
              </p>
              <div className="space-y-1.5 opacity-80">
                {recentOtherWork.slice(0, 6).map((work, idx) => (
                  <div key={`${work.taskName}-${work.date}-${idx}`} className="flex items-center gap-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-xs font-mono font-semibold truncate flex-1">
                      {work.taskName}
                    </span>
                    {work.projectName && (
                      <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                        {work.projectName}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                      {formatDateLabel(work.date)}
                    </span>
                    <span className="text-xs font-bold font-mono shrink-0">
                      {formatTime(work.seconds)}
                    </span>
                  </div>
                ))}
                {recentOtherWork.length > 6 && (
                  <p className="text-[10px] text-muted-foreground pl-4">
                    +{recentOtherWork.length - 6} more
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
