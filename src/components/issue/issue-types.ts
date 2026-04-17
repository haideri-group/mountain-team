// ─── Issue Detail Types ──────────────────────────────────────────────────────

export interface Phase1Data {
  issue: {
    id: number;
    jiraKey: string;
    title: string;
    status: string;
    priority: string;
    type: string;
    startDate: string | null;
    dueDate: string | null;
    completedDate: string | null;
    cycleTime: number | null;
    storyPoints: number | null;
    labels: string[];
    description: string | null;
    jiraCreatedAt: string | null;
    jiraUpdatedAt: string | null;
    updatedAt: string | null;
    boardKey: string;
    boardName: string;
    boardColor: string;
    assigneeId: string | null;
    assigneeName: string | null;
    assigneeAvatarUrl: string | null;
    assigneeInitials: string | null;
    teamName: string | null;
    isOverdue: boolean;
    isOnTime: boolean | null;
    brands: string | null;
    website: string | null;
    requestPriority: string | null;
  };
  context: {
    assigneeStats: {
      totalDone: number;
      avgCycleTime: number;
      onTimePercentage: number;
    };
    boardStats: {
      totalOpen: number;
      totalDone: number;
      avgCycleTime: number;
      overdueCount: number;
    };
    cycleTimePercentile: number | null;
  };
  timeline: {
    created: string | null;
    started: string | null;
    due: string | null;
    completed: string | null;
    daysInCurrentStatus: number;
  };
}

export interface Comment {
  id: string;
  author: string;
  authorAvatar: string | null;
  body: string;
  created: string;
}

export interface ChangelogEntry {
  id: string;
  author: string;
  created: string;
  field: string;
  from: string | null;
  to: string | null;
}

export interface Subtask {
  key: string;
  title: string;
  status: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnail: string | null;
  created: string;
  author: string;
}

export interface LinkedIssue {
  id: string;
  type: string;
  key: string;
  title: string;
  status: string;
}

export interface TimeTracking {
  timeSpent: string | null;
  timeSpentSeconds: number;
  remainingEstimate: string | null;
  remainingEstimateSeconds: number;
  originalEstimate: string | null;
  originalEstimateSeconds: number;
}

export interface Phase2Data {
  description: string | null;
  comments: Comment[];
  changelog: ChangelogEntry[];
  subtasks: Subtask[];
  parentKey: string | null;
  parentTitle: string | null;
  attachments: Attachment[];
  linkedIssues: LinkedIssue[];
  timeTracking: TimeTracking | null;
  worklogs: {
    author: string;
    authorAvatar: string | null;
    timeSpent: string;
    timeSpentSeconds: number;
  }[];
}

export type ActivityEntry =
  | { type: "comment"; id: string; author: string; authorAvatar: string | null; body: string; created: string }
  | { type: "change"; id: string; author: string; created: string; field: string; from: string | null; to: string | null };

export interface GitHubBranch {
  name: string;
  url: string;
  repoName: string;
  repoUrl: string;
  lastCommit: {
    sha: string;
    message: string;
    url: string;
    date: string;
    author: string;
    authorAvatar: string | null;
  } | null;
}

export interface GitHubPR {
  id: string;
  title: string;
  status: string;
  url: string;
  commentCount: number;
  lastUpdate: string;
  repoName: string;
  author: string;
  authorAvatar: string | null;
  reviewers: { name: string; avatar: string; approved: boolean }[];
  sourceBranch: string;
  destBranch: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  url: string;
  date: string;
  author: string;
  authorAvatar: string | null;
}

export interface GitHubData {
  branches: GitHubBranch[];
  pullRequests: GitHubPR[];
  commits: GitHubCommit[];
}

export interface PaginatedComment {
  id: string;
  author: string;
  authorAvatar: string | null;
  body: string;
  created: string;
  updated: string;
}

export interface ThreadedComment {
  comment: PaginatedComment;
  replies: PaginatedComment[];
}

export interface IssueDetailProps {
  issueKey: string;
}
