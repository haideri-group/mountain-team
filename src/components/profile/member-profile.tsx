"use client";

import { useState, useEffect } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ProfileHeader } from "./profile-header";
import { StatsStrip } from "./stats-strip";
import { CurrentWork } from "./current-work";
import { MonthlyChart } from "./monthly-chart";
import { TaskHistoryTable } from "./task-history-table";
import { TimeTracking } from "./time-tracking";

// Shape of GET /api/team/[id]/profile. Each child component
// (ProfileHeader, StatsStrip, CurrentWork, MonthlyChart, TaskHistoryTable)
// owns its own prop contract but does not export its types — this boundary
// passes through server data to the children. Properly typing every field
// here means re-declaring ~6 interfaces; leaving it loose keeps the file
// small while child-prop validation still runs at each call site. Follow-up
// (tracked separately): extract a shared `src/types/profile.ts` and remove
// the escape hatch.
/* eslint-disable @typescript-eslint/no-explicit-any */
type MemberProfileData = {
  member: any;
  stats: any;
  currentIssue: any;
  queuedIssues: any[];
  inReviewIssues: any[];
  recentDone: any[];
  allIssues: any[];
  monthlyData: any[];
  boards: Array<{ id: string; jiraKey: string; name: string; color: string | null }>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

interface MemberProfileProps {
  memberId: string;
  isAdmin?: boolean;
}

export function MemberProfile({ memberId, isAdmin = false }: MemberProfileProps) {
  const [data, setData] = useState<MemberProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/team/${memberId}/profile`);
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to load profile");
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [memberId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">
          Loading profile...
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <p className="text-sm text-destructive">{error || "Profile not found"}</p>
        <Link
          href="/overview"
          className="text-sm text-primary font-semibold hover:underline"
        >
          Back to Overview
        </Link>
      </div>
    );
  }

  const { member, stats, currentIssue, queuedIssues, inReviewIssues, allIssues, monthlyData, boards } = data;
  const isDeparted = member.status === "departed";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/overview"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Overview
      </Link>

      {/* Profile Header */}
      <ProfileHeader member={member} />

      {/* Stats Strip */}
      <StatsStrip stats={stats} isDeparted={isDeparted} />

      {/* Time Tracking (hidden for departed members) */}
      {!isDeparted && <TimeTracking memberId={memberId} isAdmin={isAdmin} />}

      {/* Current Work + Monthly Chart (side by side on large screens) */}
      {!isDeparted && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <CurrentWork
              currentIssue={currentIssue}
              queuedIssues={queuedIssues}
              inReviewIssues={inReviewIssues}
              workloadPercentage={stats.workloadPercentage}
            />
          </div>
          <div>
            <MonthlyChart data={monthlyData} />
          </div>
        </div>
      )}

      {/* Departed: just show monthly chart full width */}
      {isDeparted && (
        <div className="opacity-70">
          <MonthlyChart data={monthlyData} />
        </div>
      )}

      {/* Task History Table */}
      <div className={isDeparted ? "opacity-70" : ""}>
        <TaskHistoryTable issues={allIssues} boards={boards} />
      </div>
    </div>
  );
}
