"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle } from "lucide-react";
import { ChartInfo } from "./chart-info";
import { formatDuration as formatTime } from "@/lib/utils";

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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
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
      <div className="bg-card rounded-xl p-5 animate-pulse space-y-3">
        <div className="h-4 w-48 bg-muted rounded" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 bg-muted/30 rounded-lg" />
        ))}
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
          <ChartInfo chartId="timeTracking" />
        </div>
        <div className="flex flex-col items-center gap-2 py-8">
          <Clock className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No time tracking data</p>
        </div>
      </div>
    );
  }

  const { hasTimeDoctorData } = data;
  const maxSeconds = Math.max(...data.members.map((m) => m.totalSeconds), 1);

  return (
    <div className="bg-card rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Team Time Tracking
          </h3>
          <ChartInfo chartId="timeTracking" />
          {hasTimeDoctorData && (
            <div className="flex items-center gap-3 ml-2">
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
              type="button"
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

      {/* Member Rows with Inline Bars */}
      <div className="space-y-1.5">
        {data.members.map((m) => {
          const noTime = m.totalSeconds === 0;
          const jiraPct = maxSeconds > 0 ? (m.jiraSeconds / maxSeconds) * 100 : 0;
          const otherPct = maxSeconds > 0 ? (m.otherSeconds / maxSeconds) * 100 : 0;

          return (
            <div
              key={m.memberId}
              onClick={() => router.push(`/members/${m.memberId}`)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/20 cursor-pointer transition-colors group"
            >
              {/* Avatar */}
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-[9px] font-bold font-mono text-muted-foreground shrink-0">
                  {getInitials(m.displayName)}
                </div>
              )}

              {/* Name */}
              <span className="text-xs font-mono font-semibold shrink-0 w-[130px] truncate group-hover:text-primary transition-colors">
                {m.displayName}
              </span>

              {/* Inline Bar */}
              <div className="flex-1 h-5 rounded-full bg-muted/20 overflow-hidden flex">
                {jiraPct > 0 && (
                  <div
                    className="h-full bg-primary/70 transition-all duration-300"
                    style={{ width: `${jiraPct}%` }}
                  />
                )}
                {hasTimeDoctorData && otherPct > 0 && (
                  <div
                    className="h-full bg-amber-500/50 transition-all duration-300"
                    style={{ width: `${otherPct}%` }}
                  />
                )}
              </div>

              {/* Days logged */}
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 w-[32px] text-right">
                {m.daysLogged}/{m.daysInPeriod}d
              </span>

              {/* Warning if no time */}
              {noTime && (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              )}

              {/* Total time */}
              <span className={`text-xs font-bold font-mono shrink-0 w-[60px] text-right ${noTime ? "text-muted-foreground/50" : ""}`}>
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
