import type {
  VelocityDataPoint,
  TaskTypeBreakdown,
  DeveloperRanking,
  HeatmapCell,
  WeeklyPulsePoint,
  TurnaroundBucket,
  OverviewMetrics,
  WorkloadData,
} from "@/types";

export const overviewMetrics: OverviewMetrics = {
  teamMembers: 14,
  activeIssues: 47,
  inProgress: 23,
  overdueTasks: 5,
  overdueChange: 2, // +2 from last week
};

export const velocityData: VelocityDataPoint[] = [
  { period: "Oct", prodCount: 24, projectCount: 14, total: 38 },
  { period: "Nov", prodCount: 19, projectCount: 11, total: 30 },
  { period: "Dec", prodCount: 28, projectCount: 16, total: 44 },
  { period: "Jan", prodCount: 22, projectCount: 13, total: 35 },
  { period: "Feb", prodCount: 31, projectCount: 18, total: 49 },
  { period: "Mar", prodCount: 26, projectCount: 15, total: 41 },
];

export const taskTypeBreakdown: TaskTypeBreakdown[] = [
  { type: "Bug Fix", count: 145, percentage: 42, color: "#ff8400" },
  { type: "Story", count: 112, percentage: 33, color: "#000066" },
  { type: "CMS Change", count: 65, percentage: 19, color: "#804200" },
  { type: "Enhancement", count: 20, percentage: 6, color: "#166534" },
];

export const developerRankings: DeveloperRanking[] = [
  { memberId: "tm-04", memberName: "Priya Shah", memberInitials: "PS", doneCount: 42, missedCount: 2, onTimePercentage: 95, avgCycleTime: 1.8, trend: "up" },
  { memberId: "tm-01", memberName: "Alex Kim", memberInitials: "AK", doneCount: 38, missedCount: 3, onTimePercentage: 92, avgCycleTime: 2.3, trend: "up" },
  { memberId: "tm-06", memberName: "Emma Wilson", memberInitials: "EW", doneCount: 35, missedCount: 4, onTimePercentage: 89, avgCycleTime: 2.5, trend: "steady" },
  { memberId: "tm-05", memberName: "Tom Nguyen", memberInitials: "TN", doneCount: 40, missedCount: 5, onTimePercentage: 88, avgCycleTime: 2.1, trend: "down" },
  { memberId: "tm-02", memberName: "Maria Rodriguez", memberInitials: "MR", doneCount: 44, missedCount: 7, onTimePercentage: 84, avgCycleTime: 3.2, trend: "down" },
];

export const heatmapData: HeatmapCell[] = [
  // Alex Kim
  { memberId: "tm-01", memberName: "Alex K.", month: "Oct", count: 22, level: "medium" },
  { memberId: "tm-01", memberName: "Alex K.", month: "Nov", count: 28, level: "high" },
  { memberId: "tm-01", memberName: "Alex K.", month: "Dec", count: 20, level: "medium" },
  { memberId: "tm-01", memberName: "Alex K.", month: "Jan", count: 32, level: "high" },
  { memberId: "tm-01", memberName: "Alex K.", month: "Feb", count: 26, level: "high" },
  { memberId: "tm-01", memberName: "Alex K.", month: "Mar", count: 12, level: "low" },
  // Maria Rodriguez
  { memberId: "tm-02", memberName: "Maria R.", month: "Oct", count: 30, level: "high" },
  { memberId: "tm-02", memberName: "Maria R.", month: "Nov", count: 24, level: "medium" },
  { memberId: "tm-02", memberName: "Maria R.", month: "Dec", count: 28, level: "high" },
  { memberId: "tm-02", memberName: "Maria R.", month: "Jan", count: 22, level: "medium" },
  { memberId: "tm-02", memberName: "Maria R.", month: "Feb", count: 26, level: "high" },
  { memberId: "tm-02", memberName: "Maria R.", month: "Mar", count: 14, level: "low" },
  // Priya Shah
  { memberId: "tm-04", memberName: "Priya S.", month: "Oct", count: 26, level: "high" },
  { memberId: "tm-04", memberName: "Priya S.", month: "Nov", count: 30, level: "high" },
  { memberId: "tm-04", memberName: "Priya S.", month: "Dec", count: 18, level: "medium" },
  { memberId: "tm-04", memberName: "Priya S.", month: "Jan", count: 28, level: "high" },
  { memberId: "tm-04", memberName: "Priya S.", month: "Feb", count: 24, level: "medium" },
  { memberId: "tm-04", memberName: "Priya S.", month: "Mar", count: 10, level: "low" },
  // Emma Wilson
  { memberId: "tm-06", memberName: "Emma W.", month: "Oct", count: 18, level: "medium" },
  { memberId: "tm-06", memberName: "Emma W.", month: "Nov", count: 20, level: "medium" },
  { memberId: "tm-06", memberName: "Emma W.", month: "Dec", count: 14, level: "low" },
  { memberId: "tm-06", memberName: "Emma W.", month: "Jan", count: 22, level: "medium" },
  { memberId: "tm-06", memberName: "Emma W.", month: "Feb", count: 18, level: "medium" },
  { memberId: "tm-06", memberName: "Emma W.", month: "Mar", count: 8, level: "minimal" },
  // Tom Nguyen
  { memberId: "tm-05", memberName: "Tom N.", month: "Oct", count: 20, level: "medium" },
  { memberId: "tm-05", memberName: "Tom N.", month: "Nov", count: 12, level: "low" },
  { memberId: "tm-05", memberName: "Tom N.", month: "Dec", count: 22, level: "medium" },
  { memberId: "tm-05", memberName: "Tom N.", month: "Jan", count: 24, level: "medium" },
  { memberId: "tm-05", memberName: "Tom N.", month: "Feb", count: 28, level: "high" },
  { memberId: "tm-05", memberName: "Tom N.", month: "Mar", count: 10, level: "low" },
  // James Liu
  { memberId: "tm-03", memberName: "James L.", month: "Oct", count: 10, level: "low" },
  { memberId: "tm-03", memberName: "James L.", month: "Nov", count: 14, level: "low" },
  { memberId: "tm-03", memberName: "James L.", month: "Dec", count: 16, level: "medium" },
  { memberId: "tm-03", memberName: "James L.", month: "Jan", count: 12, level: "low" },
  { memberId: "tm-03", memberName: "James L.", month: "Feb", count: 6, level: "minimal", annotation: "On leave 2 weeks" },
  { memberId: "tm-03", memberName: "James L.", month: "Mar", count: 4, level: "minimal", annotation: "On leave" },
];

export const weeklyPulseData: WeeklyPulsePoint[] = [
  { week: "W1", created: 15, completed: 13 },
  { week: "W2", created: 18, completed: 16 },
  { week: "W3", created: 14, completed: 17 },
  { week: "W4", created: 20, completed: 18 },
  { week: "W5", created: 16, completed: 20 },
  { week: "W6", created: 12, completed: 9 },
];

export const turnaroundData: TurnaroundBucket[] = [
  { label: "< 1 day", count: 142, color: "#166534" },
  { label: "1-2 days", count: 108, color: "#ff8400" },
  { label: "3-5 days", count: 68, color: "#804200" },
  { label: "5+ days", count: 24, color: "#ba1a1a" },
];

export const workloadData: WorkloadData[] = [
  { memberId: "tm-02", memberName: "Maria R.", assignedCount: 11, completedCount: 6, percentage: 110, level: "over" },
  { memberId: "tm-05", memberName: "Tom N.", assignedCount: 9, completedCount: 5, percentage: 92, level: "high" },
  { memberId: "tm-01", memberName: "Alex K.", assignedCount: 8, completedCount: 5, percentage: 85, level: "high" },
  { memberId: "tm-04", memberName: "Priya S.", assignedCount: 7, completedCount: 4, percentage: 72, level: "optimal" },
  { memberId: "tm-06", memberName: "Emma W.", assignedCount: 6, completedCount: 4, percentage: 60, level: "optimal" },
  { memberId: "tm-03", memberName: "James L.", assignedCount: 4, completedCount: 2, percentage: 45, level: "under" },
  { memberId: "tm-10", memberName: "Amir H.", assignedCount: 5, completedCount: 3, percentage: 55, level: "optimal" },
  { memberId: "tm-11", memberName: "Lisa C.", assignedCount: 3, completedCount: 1, percentage: 30, level: "under" },
  { memberId: "tm-12", memberName: "Omar F.", assignedCount: 5, completedCount: 3, percentage: 50, level: "optimal" },
  { memberId: "tm-13", memberName: "Nina P.", assignedCount: 6, completedCount: 4, percentage: 65, level: "optimal" },
  { memberId: "tm-07", memberName: "Ryan K.", assignedCount: 0, completedCount: 0, percentage: 0, level: "under" },
];
