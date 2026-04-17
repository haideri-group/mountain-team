"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemberTime {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  jiraSeconds: number;
  timedoctorSeconds: number;
  otherSeconds: number;
  totalSeconds: number;
  dailyAvgSeconds: number;
  daysLogged: number;
  daysInPeriod: number;
}

interface TimeTrackingReport {
  members: MemberTime[];
  teamTotal: number;
  teamDailyAvg: number;
  hasTimeDoctorData: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds === 0) return "0h";
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-xl rounded-lg ring-1 ring-foreground/10 shadow-lg px-3 py-2 space-y-1">
      <p className="text-xs font-bold font-mono">{data.displayName}</p>
      {data.jiraHours > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          <span className="text-[10px] font-mono">Issues: {formatTime(data.jiraSeconds)}</span>
        </div>
      )}
      {data.otherHours > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          <span className="text-[10px] font-mono">Other: {formatTime(data.otherSeconds)}</span>
        </div>
      )}
      <p className="text-xs font-bold font-mono pt-0.5 border-t border-foreground/5">
        Total: {formatTime(data.totalSeconds)}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {data.daysLogged}/{data.daysInPeriod} working days
      </p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TeamTimeTracking({ team }: { team?: string }) {
  const router = useRouter();
  const [data, setData] = useState<TimeTrackingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month">("week");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (team) params.set("team", team);
      const res = await fetch(`/api/reports/time-tracking?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [period, team]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="bg-card rounded-xl p-5 animate-pulse space-y-4">
        <div className="h-4 w-48 bg-muted rounded" />
        <div className="h-48 bg-muted/50 rounded-xl" />
      </div>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Team Time Tracking
          </h3>
        </div>
        <div className="flex flex-col items-center gap-2 py-8">
          <Clock className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No time tracking data</p>
        </div>
      </div>
    );
  }

  const { hasTimeDoctorData } = data;

  // Chart data
  const chartData = data.members.map((m) => ({
    ...m,
    jiraHours: +(m.jiraSeconds / 3600).toFixed(1),
    otherHours: +(m.otherSeconds / 3600).toFixed(1),
    totalHours: +(m.totalSeconds / 3600).toFixed(1),
    name: m.displayName.split(" ")[0],
  }));
  const maxHours = Math.max(...chartData.map((d) => d.jiraHours + d.otherHours), 1);

  return (
    <div className="bg-card rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Team Time Tracking
          </h3>
          {hasTimeDoctorData && (
            <div className="flex items-center gap-3 ml-3">
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
        <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider transition-all ${
                period === p
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "week" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 9, fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              domain={[0, Math.ceil(maxHours)]}
              tickFormatter={(v) => `${v}h`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.2 }} />
            <Bar
              dataKey="jiraHours"
              stackId="time"
              radius={hasTimeDoctorData ? [0, 0, 0, 0] : [0, 4, 4, 0]}
              maxBarSize={20}
              className="fill-primary/70"
            />
            {hasTimeDoctorData && (
              <Bar
                dataKey="otherHours"
                stackId="time"
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
                className="fill-amber-500/50"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team Members Table */}
      <div className="space-y-1">
        {data.members.map((m) => {
          const noTime = m.totalSeconds === 0;
          return (
            <div
              key={m.memberId}
              onClick={() => router.push(`/members/${m.memberId}`)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/20 cursor-pointer transition-colors"
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center text-[8px] font-bold font-mono text-muted-foreground shrink-0">
                  {getInitials(m.displayName)}
                </div>
              )}

              <span className="text-xs font-mono font-semibold flex-1 truncate">
                {m.displayName}
              </span>

              {/* Split columns when TD data exists */}
              {hasTimeDoctorData ? (
                <>
                  <span className="text-[10px] font-mono text-primary shrink-0 min-w-[44px] text-right">
                    {formatTime(m.jiraSeconds)}
                  </span>
                  <span className="text-[10px] font-mono text-amber-500 shrink-0 min-w-[44px] text-right">
                    {m.otherSeconds > 0 ? formatTime(m.otherSeconds) : "—"}
                  </span>
                </>
              ) : (
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {m.daysLogged}/{m.daysInPeriod}d
                </span>
              )}

              {noTime && (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              )}

              <span className={`text-xs font-bold font-mono shrink-0 min-w-[52px] text-right ${noTime ? "text-muted-foreground/50" : ""}`}>
                {formatTime(m.totalSeconds)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer totals */}
      <div className="flex items-center justify-between pt-3 border-t border-foreground/5">
        <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
          Team Total
        </span>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-muted-foreground">
            Avg {formatTime(data.teamDailyAvg)}/dev/day
          </span>
          <span className="text-sm font-bold font-mono">
            {formatTime(data.teamTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
