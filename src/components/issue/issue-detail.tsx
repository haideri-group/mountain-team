"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  ChevronRight,
  CheckSquare,
  Square,
  MessageSquare,
  Edit,
  Link2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  GitBranch,
  GitPullRequest,
  GitCommit,
  Loader2,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
} from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Phase1Data {
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
    jiraCreatedAt: string | null;
    jiraUpdatedAt: string | null;
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

interface Comment {
  id: string;
  author: string;
  authorAvatar: string | null;
  body: string;
  created: string;
}

interface ChangelogEntry {
  id: string;
  author: string;
  created: string;
  field: string;
  from: string | null;
  to: string | null;
}

interface Subtask {
  key: string;
  title: string;
  status: string;
}

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnail: string | null;
  created: string;
  author: string;
}

interface LinkedIssue {
  id: string;
  type: string;
  key: string;
  title: string;
  status: string;
}

interface TimeTracking {
  timeSpent: string | null;
  timeSpentSeconds: number;
  remainingEstimate: string | null;
  remainingEstimateSeconds: number;
  originalEstimate: string | null;
  originalEstimateSeconds: number;
}

interface Phase2Data {
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

type ActivityEntry =
  | { type: "comment"; id: string; author: string; authorAvatar: string | null; body: string; created: string }
  | { type: "change"; id: string; author: string; created: string; field: string; from: string | null; to: string | null };

interface GitHubBranch {
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

interface GitHubPR {
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

interface GitHubCommit {
  sha: string;
  message: string;
  url: string;
  date: string;
  author: string;
  authorAvatar: string | null;
}

interface GitHubData {
  branches: GitHubBranch[];
  pullRequests: GitHubPR[];
  commits: GitHubCommit[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  highest: "#ba1a1a",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#3b82f6",
  lowest: "#6b7280",
};

const PRIORITY_ICON_CLASS: Record<string, string> = {
  highest: "text-red-600",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-blue-500",
  lowest: "text-muted-foreground",
};


// ─── Helpers ──────────────────────────────────────────────────────────────────

const PKT = "Asia/Karachi";

function formatSmartDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();

  // Convert both to PKT date strings for comparison
  const todayPKT = now.toLocaleDateString("en-CA", { timeZone: PKT });
  const datePKT = d.toLocaleDateString("en-CA", { timeZone: PKT });

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayPKT = yesterday.toLocaleDateString("en-CA", { timeZone: PKT });

  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: PKT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (datePKT === todayPKT) return `Today at ${timePart}`;
  if (datePKT === yesterdayPKT) return `Yesterday at ${timePart}`;

  return d.toLocaleDateString("en-GB", {
    timeZone: PKT,
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + ` at ${timePart}`;
}

function formatDateTime(dateStr: string): string {
  return formatSmartDate(dateStr);
}

function formatDateFull(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    timeZone: PKT,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

function mergeActivity(comments: Comment[], changelog: ChangelogEntry[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...comments.map((c) => ({ type: "comment" as const, ...c })),
    ...changelog.map((c) => ({ type: "change" as const, ...c })),
  ];
  return entries.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── Mini Cycle Time Bar Chart ────────────────────────────────────────────────

function CycleTimeChart({ currentCycleTime }: { currentCycleTime: number | null }) {
  // Generate 6 synthetic relative bars — last one is current (if available)
  const bars = [0.6, 0.45, 0.8, 0.55, 0.7, currentCycleTime != null ? 1 : 0.65];

  return (
    <div className="flex items-end gap-1 h-10">
      {bars.map((rel, i) => {
        const isCurrent = i === bars.length - 1;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-all",
              isCurrent ? "bg-primary" : "bg-primary/20",
            )}
            style={{ height: `${rel * 100}%` }}
          />
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface IssueDetailProps {
  issueKey: string;
}

// ─── Comment Threading ───────────────────────────────────────────────────────

interface ThreadedComment {
  comment: PaginatedComment;
  replies: PaginatedComment[];
}

function extractMentionedName(html: string): string | null {
  // Detect @mention at start: <p><a ... class="user-hover" ...>Name</a>
  const match = html.match(/^<p>\s*<a[^>]*class="user-hover"[^>]*>([^<]+)<\/a>/);
  return match ? match[1].trim() : null;
}

function buildThreads(comments: PaginatedComment[]): ThreadedComment[] {
  // Work in chronological order (oldest first) for correct parent-child linking
  const sorted = [...comments].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  );

  const threads: ThreadedComment[] = [];
  const threadByCommentId = new Map<string, ThreadedComment>();
  // Track the last comment by each author for reply matching
  const lastCommentByAuthor = new Map<string, string>(); // author → comment ID

  for (const c of sorted) {
    const mentioned = extractMentionedName(c.body);

    if (mentioned) {
      // Find the most recent comment by the mentioned person
      const parentId = lastCommentByAuthor.get(mentioned);
      if (parentId) {
        const parentThread = threadByCommentId.get(parentId);
        if (parentThread) {
          parentThread.replies.push(c);
          lastCommentByAuthor.set(c.author, c.id);
          continue;
        }
      }
    }

    // Root comment
    const thread: ThreadedComment = { comment: c, replies: [] };
    threads.push(thread);
    threadByCommentId.set(c.id, thread);
    lastCommentByAuthor.set(c.author, c.id);
  }

  // Reverse to show newest first (matching the API sort order)
  // But keep replies in chronological order under their parent
  threads.reverse();

  return threads;
}

function SingleComment({
  c,
  isReply = false,
  issueKey,
}: {
  c: PaginatedComment;
  isReply?: boolean;
  issueKey: string;
}) {
  const initials = getInitials(c.author);
  const jiraCommentUrl = `${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/browse/${issueKey}?focusedCommentId=${c.id}`;

  return (
    <div className={cn("flex gap-3 group/comment", isReply && "ml-11")}>
      <div className="shrink-0">
        {c.authorAvatar ? (
          <img
            src={c.authorAvatar}
            alt=""
            referrerPolicy="no-referrer"
            className={cn("rounded-full object-cover", isReply ? "h-6 w-6" : "h-8 w-8")}
          />
        ) : (
          <div
            className={cn(
              "rounded-full bg-[#1a1a2e] flex items-center justify-center font-bold font-mono text-white",
              isReply ? "h-6 w-6 text-[8px]" : "h-8 w-8 text-[10px]",
            )}
          >
            {initials}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("font-semibold", isReply ? "text-[11px]" : "text-[12px]")}>
            {c.author}
          </span>
          <span className={cn("text-muted-foreground", isReply ? "text-[10px]" : "text-[11px]")}>
            {formatSmartDate(c.created)}
          </span>
          <a
            href={jiraCommentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover/comment:opacity-100 transition-opacity text-muted-foreground/50 hover:text-primary"
            title="View in JIRA"
          >
            <Link2 className="h-3 w-3" />
          </a>
        </div>
        <div
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none leading-relaxed border border-border/30",
            "[&_a.user-hover]:text-primary [&_a.user-hover]:font-semibold [&_a.user-hover]:no-underline [&_a.user-hover]:hover:underline",
            isReply
              ? "rounded-lg p-3 text-[13px] bg-muted/5 border-l-2 border-l-primary/20"
              : "rounded-xl rounded-tl-none p-4 text-sm bg-muted/10",
          )}
          dangerouslySetInnerHTML={{ __html: c.body }}
        />
      </div>
    </div>
  );
}

function CommentThread({ comments, issueKey }: { comments: PaginatedComment[]; issueKey: string }) {
  const threads = buildThreads(comments);

  return (
    <div className="space-y-5">
      {threads.map((thread) => (
        <div key={`thread-${thread.comment.id}`} className="space-y-2">
          <SingleComment c={thread.comment} issueKey={issueKey} />
          {thread.replies.length > 0 && (
            <div className="space-y-2">
              {thread.replies.map((reply) => (
                <SingleComment key={`reply-${reply.id}`} c={reply} isReply issueKey={issueKey} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Activity Tabs Sub-component ─────────────────────────────────────────────

interface PaginatedComment {
  id: string;
  author: string;
  authorAvatar: string | null;
  body: string;
  created: string;
  updated: string;
}

function ActivityTabs({
  issueKey,
  activity,
  phase2Loading,
}: {
  issueKey: string;
  activity: ActivityEntry[];
  phase2Loading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"all" | "comments" | "history">("comments");

  // Paginated comment state (Comments tab only)
  const [paginatedComments, setPaginatedComments] = useState<PaginatedComment[]>([]);
  const [commentPage, setCommentPage] = useState(1);
  const [commentTotal, setCommentTotal] = useState(0);
  const [commentTotalPages, setCommentTotalPages] = useState(0);
  const [commentSort, setCommentSort] = useState<"desc" | "asc">("desc");
  const [commentLoading, setCommentLoading] = useState(false);

  // Fetch paginated comments when tab/page/sort changes
  useEffect(() => {
    if (activeTab !== "comments") return;

    let cancelled = false;
    setCommentLoading(true);

    const fetchComments = async () => {
      try {
        const res = await fetch(
          `/api/issues/${issueKey}/comments?page=${commentPage}&pageSize=10&sort=${commentSort}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setPaginatedComments(data.comments);
          setCommentTotal(data.total);
          setCommentTotalPages(data.totalPages);
        }
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setCommentLoading(false);
      }
    };

    void fetchComments();
    return () => { cancelled = true; };
  }, [issueKey, activeTab, commentPage, commentSort]);

  const comments = activity.filter((e) => e.type === "comment");
  const history = activity.filter((e) => e.type === "change");

  const visibleEntries =
    activeTab === "comments" ? comments :
    activeTab === "history" ? history :
    activity;

  const tabs = [
    { key: "all" as const, label: "All", count: activity.length },
    { key: "comments" as const, label: "Comments", count: activeTab === "comments" ? commentTotal : comments.length },
    { key: "history" as const, label: "History", count: history.length },
  ];

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border/30">
        <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "comments") setCommentPage(1);
              }}
              className={cn(
                "px-4 py-1.5 rounded-full text-[11px] font-bold font-mono uppercase tracking-wider transition-all",
                activeTab === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {!phase2Loading && tab.count > 0 && (
                <span className="ml-1 text-muted-foreground/50">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Sort toggle — Comments tab only */}
        {activeTab === "comments" && (
          <button
            onClick={() => {
              setCommentSort((s) => (s === "desc" ? "asc" : "desc"));
              setCommentPage(1);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all"
          >
            {commentSort === "desc" ? (
              <><ArrowDown className="h-3 w-3" /> Newest</>
            ) : (
              <><ArrowUp className="h-3 w-3" /> Oldest</>
            )}
          </button>
        )}
      </div>

      <div className="px-8 py-6 space-y-4">
        {/* === COMMENTS TAB (paginated from server) === */}
        {activeTab === "comments" && (
          <>
            {commentLoading ? (
              <div className="space-y-5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-16 w-full rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : paginatedComments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">No comments yet.</p>
            ) : (
              <CommentThread comments={paginatedComments} issueKey={issueKey} />
            )}

            {/* Pagination */}
            {commentTotalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-border/30">
                <p className="text-[10px] font-mono text-muted-foreground">
                  <span className="font-bold text-foreground">
                    {(commentPage - 1) * 10 + 1}–{Math.min(commentPage * 10, commentTotal)}
                  </span>{" "}
                  <span className="uppercase tracking-widest">of</span>{" "}
                  <span className="font-bold text-foreground">{commentTotal}</span>{" "}
                  <span className="uppercase tracking-widest text-muted-foreground/60">comments</span>
                </p>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setCommentPage((p) => Math.max(1, p - 1))}
                    disabled={commentPage <= 1}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                  {Array.from({ length: Math.min(commentTotalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (commentTotalPages <= 5) pageNum = i + 1;
                    else if (commentPage <= 3) pageNum = i + 1;
                    else if (commentPage >= commentTotalPages - 2) pageNum = commentTotalPages - 4 + i;
                    else pageNum = commentPage - 2 + i;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCommentPage(pageNum)}
                        className={cn(
                          "h-7 min-w-7 rounded-full px-1.5 text-xs font-mono font-bold tracking-wide transition-all",
                          commentPage === pageNum
                            ? "text-white shadow-[0_1px_4px_0_rgba(255,132,0,0.35)]"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                        )}
                        style={commentPage === pageNum ? { background: "linear-gradient(135deg, #944a00, #ff8400)" } : undefined}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCommentPage((p) => Math.min(commentTotalPages, p + 1))}
                    disabled={commentPage >= commentTotalPages}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  >
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* === ALL + HISTORY TABS (from Phase 2 data) === */}
        {activeTab !== "comments" && (
          <>
        {phase2Loading ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            {activeTab === "history"
              ? "No status changes recorded."
              : "No activity recorded yet."}
          </p>
        ) : (
          <div className="space-y-4">
            {visibleEntries.map((entry) => {
              if (entry.type === "comment") {
                const initials = getInitials(entry.author);
                return (
                  <div key={`comment-${entry.id}`} className="flex gap-3">
                    <div className="shrink-0">
                      {entry.authorAvatar ? (
                        <img
                          src={entry.authorAvatar}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-[#1a1a2e] flex items-center justify-center text-[10px] font-bold font-mono text-white">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[12px] font-semibold">{entry.author}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDateTime(entry.created)}
                        </span>
                      </div>
                      <div
                        className="rounded-xl rounded-tl-none bg-muted/10 p-4 border border-border/30 prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: entry.body }}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div key={`change-${entry.id}`} className="flex gap-3 items-start">
                  <div className="shrink-0 h-8 w-8 rounded-full bg-[#1a1a2e] flex items-center justify-center">
                    <Edit className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                      <span className="font-semibold">{entry.author}</span>
                      <span className="text-muted-foreground">changed</span>
                      <span className="font-semibold capitalize">{entry.field}</span>
                      {entry.from && (
                        <>
                          <span className="text-muted-foreground">from</span>
                          <span className="font-mono text-[11px] text-muted-foreground line-through">
                            {entry.from}
                          </span>
                        </>
                      )}
                      <span className="text-muted-foreground">to</span>
                      <span className="font-mono text-[11px] font-bold text-foreground">
                        {entry.to ?? "—"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDateTime(entry.created)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}

        {/* Comment Input — read-only placeholder */}
        {(activeTab === "all" || activeTab === "comments") && (
          <div className="pt-4 border-t border-border/30 space-y-3">
            <textarea
              disabled
              placeholder="Add a comment... (read-only)"
              rows={3}
              className="w-full resize-none rounded-xl bg-muted/10 border border-border/30 px-4 py-3 text-sm text-muted-foreground placeholder:text-muted-foreground/50 focus:outline-none cursor-not-allowed"
            />
            <div className="flex justify-end">
              <button
                disabled
                className="px-4 py-2 rounded-lg text-[11px] font-bold font-mono uppercase tracking-widest text-white/50 cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #944a00, #ff8400)", opacity: 0.4 }}
              >
                Submit Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function IssueDetail({ issueKey }: IssueDetailProps) {
  const router = useRouter();

  const [phase1, setPhase1] = useState<Phase1Data | null>(null);
  const [phase2, setPhase2] = useState<Phase2Data | null>(null);
  const [github, setGithub] = useState<GitHubData | null>(null);
  const [phase1Loading, setPhase1Loading] = useState(true);
  const [phase2Loading, setPhase2Loading] = useState(true);
  const [githubLoading, setGithubLoading] = useState(true);
  const [phase1Error, setPhase1Error] = useState<string | null>(null);

  // Phase 1: DB data — instant
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPhase1Loading(true);
      setPhase1Error(null);
      try {
        const res = await fetch(`/api/issues/${issueKey}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error((json as { error?: string }).error ?? "Failed to load issue");
        }
        const data = (await res.json()) as Phase1Data;
        if (!cancelled) setPhase1(data);
      } catch (err) {
        if (!cancelled)
          setPhase1Error(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (!cancelled) setPhase1Loading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [issueKey]);

  // Phase 2: Live JIRA data — background
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setPhase2Loading(true);
      try {
        const res = await fetch(`/api/issues/${issueKey}/jira`);
        if (!res.ok) return;
        const data = (await res.json()) as Phase2Data;
        if (!cancelled) setPhase2(data);
      } catch {
        // Phase 2 failure is non-fatal
      } finally {
        if (!cancelled) setPhase2Loading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [issueKey]);

  // Phase 3: GitHub data via JIRA dev-status — background
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setGithubLoading(true);
      try {
        const res = await fetch(`/api/issues/${issueKey}/github`);
        if (!res.ok) return;
        const data = (await res.json()) as GitHubData;
        if (!cancelled) setGithub(data);
      } catch {
        // GitHub failure is non-fatal
      } finally {
        if (!cancelled) setGithubLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [issueKey]);

  // ── Loading state ────────────────────────────────────────────────────────────
  if (phase1Loading) {
    return (
      <div className="space-y-5 p-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-3" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-3" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        {/* Body skeleton */}
        <div className="grid grid-cols-12 gap-6 mt-2">
          <div className="col-span-8 space-y-5">
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-3/4" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="bg-card rounded-xl p-8 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
          <div className="col-span-4 space-y-5">
            <div className="bg-muted/10 rounded-xl p-6 space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="bg-muted/10 rounded-xl p-6 space-y-3">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (phase1Error || !phase1) {
    return (
      <div className="bg-card rounded-xl p-16 flex flex-col items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <FileText className="h-7 w-7 text-destructive" />
        </div>
        <div className="text-center">
          <p className="font-bold font-mono uppercase tracking-widest text-sm">
            Issue Not Found
          </p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            {phase1Error ?? `${issueKey} could not be loaded`}
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-primary font-semibold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back
        </button>
      </div>
    );
  }

  const { issue, context } = phase1;
  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";
  const createdDisplay = formatSmartDate(issue.jiraCreatedAt);

  const activity: ActivityEntry[] = phase2
    ? mergeActivity(phase2.comments, phase2.changelog)
    : [];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0">

      {/* ── Header Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-card border-b border-border/30 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">

          {/* Left: Breadcrumb + nav links */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
              <span>Projects</span>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="text-foreground font-semibold">{issue.boardName}</span>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="flex items-center gap-1">
                <span className="text-foreground font-bold">{issue.jiraKey}</span>
                {jiraBaseUrl && (
                  <a
                    href={`${jiraBaseUrl}/browse/${issue.jiraKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:opacity-70 transition-opacity"
                    aria-label="Open in JIRA"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </span>
            </div>

            {/* Nav links */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to Board
              </button>
              <span className="text-border/60 text-xs select-none">·</span>
              <button className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                History
              </button>
              <span className="text-border/60 text-xs select-none">·</span>
              <button className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
                Attachments
              </button>
            </div>
          </div>

          {/* Right: CTA */}
          {jiraBaseUrl && (
            <a
              href={`${jiraBaseUrl}/browse/${issue.jiraKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold font-mono uppercase tracking-widest text-white transition-opacity hover:opacity-90 shrink-0"
              style={{ background: "linear-gradient(135deg, #944a00, #ff8400)" }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in JIRA
            </a>
          )}
        </div>
      </div>

      {/* ── Body: 12-col grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6 p-6">

        {/* ── Left Column (8/12) ──────────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-8 space-y-6">

          {/* Title Section */}
          <div className="space-y-3">
            <p className="text-xs font-mono text-primary font-bold tracking-widest uppercase">
              Issue Tracking
            </p>
            <h1
              className={cn(
                "font-extrabold tracking-tight font-mono leading-tight",
                issue.title.length > 120 ? "text-xl" :
                issue.title.length > 80 ? "text-2xl" :
                issue.title.length > 50 ? "text-3xl" :
                "text-4xl",
              )}
            >
              {issue.title}
            </h1>
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              <IssueStatusBadge status={issue.status} />
              {issue.priority && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono uppercase tracking-wide"
                  style={{
                    color: PRIORITY_COLORS[issue.priority] ?? "#6b7280",
                    backgroundColor: `${PRIORITY_COLORS[issue.priority] ?? "#6b7280"}15`,
                  }}
                >
                  {issue.priority}
                </span>
              )}
              {issue.type && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/30 text-[10px] font-semibold font-mono uppercase tracking-wide text-muted-foreground">
                  {issue.type.replace(/_/g, " ")}
                </span>
              )}
              {issue.storyPoints != null && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold font-mono text-primary">
                  {issue.storyPoints}pt
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="bg-[#1a1a2e] text-white text-[10px] font-mono rounded px-2 py-1 shrink-0 inline-flex items-center gap-1.5">
                <IssueTypeIcon type={issue.type} size={14} />
                {issue.jiraKey}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                Created {createdDisplay}
              </span>
              {phase1.timeline.daysInCurrentStatus > 0 && (
                <span className={cn(
                  "flex items-center gap-1.5 text-[11px] font-mono font-semibold",
                  phase1.timeline.daysInCurrentStatus >= 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                )}>
                  <Clock className="h-3 w-3 shrink-0" />
                  {phase1.timeline.daysInCurrentStatus}d in <IssueStatusBadge status={issue.status} />
                </span>
              )}
              {issue.isOverdue && (
                <span className="text-[11px] font-mono font-bold text-destructive">
                  OVERDUE
                </span>
              )}
              {issue.isOnTime === true && (
                <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ON TIME
                </span>
              )}
              {issue.isOnTime === false && (
                <span className="text-[11px] font-mono font-bold text-destructive">
                  LATE
                </span>
              )}
            </div>
          </div>

          {/* Description Card */}
          <div className="bg-card rounded-xl p-8 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                Description
              </h2>
            </div>

            {phase2Loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-9/12" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : phase2?.description ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_pre]:font-mono [&_pre]:text-xs [&_pre]:p-4 [&_pre]:bg-muted/30 [&_pre]:rounded-lg [&_pre]:border-l-4 [&_pre]:border-primary [&_code]:font-mono [&_code]:text-xs [&_code]:bg-muted/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded"
                dangerouslySetInnerHTML={{ __html: phase2.description }}
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No description available.
              </p>
            )}
          </div>

          {/* Sub-tasks Section */}
          {(phase2Loading || (phase2 && phase2.subtasks.length > 0)) && (
            <div className="bg-card rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-8 py-5 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                    Sub-tasks
                    {phase2 && (
                      <span className="ml-1.5 text-muted-foreground/60">
                        ({phase2.subtasks.length})
                      </span>
                    )}
                  </h2>
                </div>
                <button
                  disabled
                  className="text-[11px] font-mono text-primary/40 cursor-not-allowed select-none"
                >
                  Add Item
                </button>
              </div>

              {phase2Loading ? (
                <div className="divide-y divide-border/30">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-8 py-4">
                      <Skeleton className="h-4 w-4 rounded shrink-0" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {phase2!.subtasks.map((sub) => {
                    const isDone =
                      sub.status.toLowerCase().includes("done") ||
                      sub.status.toLowerCase().includes("closed");

                    return (
                      <div
                        key={sub.key}
                        className="flex items-center gap-3 px-8 py-4 hover:bg-muted/20 transition-colors"
                      >
                        <IssueTypeIcon type="subtask" size={16} className={isDone ? "opacity-40" : ""} />
                        <Link
                          href={`/issue/${sub.key}`}
                          className={cn(
                            "text-[10px] font-mono font-bold hover:underline shrink-0",
                            isDone ? "text-muted-foreground" : "text-primary",
                          )}
                        >
                          {sub.key}
                        </Link>
                        <span
                          className={cn(
                            "flex-1 min-w-0 text-sm truncate",
                            isDone && "line-through text-muted-foreground",
                          )}
                        >
                          {sub.title}
                        </span>
                        <span className="shrink-0">
                          <IssueStatusBadge
                            status={sub.status.toLowerCase().replace(/\s+/g, "_")}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Activity Section with Tabs */}
          <ActivityTabs
            issueKey={issueKey}
            activity={activity}
            phase2Loading={phase2Loading}
          />
        </div>

        {/* ── Right Column (4/12) ─────────────────────────────────────────── */}
        <div className="col-span-12 lg:col-span-4 space-y-5">

          {/* Status Card */}
          <div className="bg-muted/10 rounded-xl p-6 space-y-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
              Current Status
            </p>
            <button className="w-full flex items-center justify-center px-4 py-3 rounded-xl border-2 border-primary bg-primary/5 transition-colors hover:bg-primary/10">
              <span className="text-[13px] font-bold font-mono uppercase tracking-widest text-primary">
                {issue.status.replace(/_/g, " ")}
              </span>
            </button>

            {/* Assignee row */}
            {issue.assigneeName && (
              <div className="flex items-center gap-3 pt-1">
                {issue.assigneeAvatarUrl ? (
                  <img
                    src={issue.assigneeAvatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-[#1a1a2e] flex items-center justify-center text-[10px] font-bold font-mono text-white shrink-0">
                    {issue.assigneeInitials ?? getInitials(issue.assigneeName)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {issue.assigneeId ? (
                    <Link
                      href={`/members/${issue.assigneeId}`}
                      className="text-sm font-semibold hover:text-primary transition-colors block truncate"
                    >
                      {issue.assigneeName}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold block truncate">
                      {issue.assigneeName}
                    </span>
                  )}
                  {issue.teamName && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {issue.teamName}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Priority row */}
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: PRIORITY_COLORS[issue.priority] ?? PRIORITY_COLORS.medium }}
              />
              <span
                className={cn(
                  "text-[11px] font-mono font-bold uppercase tracking-wide",
                  PRIORITY_ICON_CLASS[issue.priority] ?? PRIORITY_ICON_CLASS.medium,
                )}
              >
                {issue.priority} priority
              </span>
            </div>

            {/* Assignee stats */}
            {issue.assigneeId && (
              <div className="pt-2 border-t border-border/20 space-y-1.5">
                <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
                  Performance
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
                  <span>{context.assigneeStats.totalDone} done</span>
                  <span>{context.assigneeStats.onTimePercentage}% on-time</span>
                  <span>{context.assigneeStats.avgCycleTime}d avg</span>
                </div>
              </div>
            )}
          </div>

          {/* Cycle Time Performance Card */}
          <div className="bg-muted/10 rounded-xl p-6 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
              Cycle Time Performance
            </p>
            <CycleTimeChart currentCycleTime={issue.cycleTime} />
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">T-7 Days</span>
              {issue.cycleTime != null ? (
                <span className="font-bold text-primary">
                  Current: {issue.cycleTime.toFixed(1)}d
                </span>
              ) : (
                <span className="text-muted-foreground">No data</span>
              )}
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
              Details
            </p>

            {/* 2-col grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              {/* Board */}
              <div className="space-y-1">
                <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                  Board
                </p>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: issue.boardColor }}
                  />
                  <span className="text-[11px] font-bold font-mono truncate">
                    {issue.boardKey}
                  </span>
                </div>
              </div>

              {/* Labels */}
              <div className="space-y-1">
                <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                  Labels
                </p>
                {issue.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {issue.labels.map((lbl) => (
                      <span
                        key={lbl}
                        className="inline-flex items-center px-1.5 py-0.5 bg-muted/30 text-[9px] font-bold font-mono rounded uppercase tracking-wide text-muted-foreground"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50">—</span>
                )}
              </div>

              {/* Due Date */}
              <div className="space-y-1">
                <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                  Due Date
                </p>
                <span
                  className={cn(
                    "text-[11px] font-mono font-semibold",
                    issue.isOverdue && !issue.completedDate
                      ? "text-destructive"
                      : "text-foreground",
                  )}
                >
                  {formatDateFull(issue.dueDate)}
                </span>
              </div>

              {/* Cycle Time */}
              <div className="space-y-1">
                <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                  Cycle Time
                </p>
                {issue.isOverdue && issue.cycleTime == null ? (
                  <span className="text-[11px] font-mono font-bold text-destructive">
                    Overdue
                  </span>
                ) : issue.cycleTime != null ? (
                  <span className="text-[11px] font-mono font-semibold text-foreground">
                    {issue.cycleTime.toFixed(1)}d
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/50">—</span>
                )}
              </div>

              {/* Type */}
              {issue.type && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                    Type
                  </p>
                  <span className="text-[11px] font-mono font-semibold capitalize">
                    {issue.type.replace(/_/g, " ")}
                  </span>
                </div>
              )}

              {/* Story Points */}
              {issue.storyPoints != null && (
                <div className="space-y-1">
                  <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                    Story Points
                  </p>
                  <span className="text-[11px] font-mono font-bold text-primary">
                    {issue.storyPoints}
                  </span>
                </div>
              )}
            </div>

            {/* Time Tracking — only shown if data exists */}
            {phase2?.timeTracking?.timeSpent && (() => {
              const tt = phase2.timeTracking!;
              const hasEstimate = tt.originalEstimateSeconds > 0;
              const pct = hasEstimate
                ? Math.round((tt.timeSpentSeconds / tt.originalEstimateSeconds) * 100)
                : 0;
              const isOver = pct > 100;
              const barColor = isOver ? "#ba1a1a" : "#ff8400";

              return (
                <div className="pt-2 border-t border-border/30 space-y-2">
                  <p className="text-[9px] font-bold font-mono uppercase tracking-widest text-muted-foreground/60">
                    Time Tracking
                  </p>

                  {hasEstimate ? (
                    <>
                      {/* Progress bar mode — has original estimate */}
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="font-bold" style={{ color: barColor }}>
                          {tt.timeSpent}
                        </span>
                        <span className="text-muted-foreground/60">
                          of {tt.originalEstimate}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground/50">
                        <span>{pct}% used</span>
                        {tt.remainingEstimate && tt.remainingEstimateSeconds > 0 && (
                          <span>{tt.remainingEstimate} remaining</span>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Text-only mode — no original estimate */
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground uppercase tracking-widest">Logged</span>
                      <span className="font-bold text-primary">{tt.timeSpent}</span>
                    </div>
                  )}

                  {/* Per-person breakdown */}
                  {phase2.worklogs && phase2.worklogs.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {phase2.worklogs.map((wl) => {
                        const totalSeconds = tt.timeSpentSeconds || 1;
                        const wlPct = Math.round((wl.timeSpentSeconds / totalSeconds) * 100);
                        return (
                          <div key={wl.author} className="flex items-center gap-2">
                            {wl.authorAvatar ? (
                              <img
                                src={wl.authorAvatar}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="h-4 w-4 rounded-full shrink-0"
                              />
                            ) : (
                              <div className="h-4 w-4 rounded-full bg-muted/50 flex items-center justify-center text-[7px] font-bold font-mono text-muted-foreground shrink-0">
                                {wl.author.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="text-[10px] font-mono truncate flex-1">{wl.author}</span>
                            <span className="text-[10px] font-mono font-bold text-muted-foreground shrink-0">{wl.timeSpent}</span>
                            <span className="text-[9px] font-mono text-muted-foreground/50 w-7 text-right shrink-0">{wlPct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Created / Updated */}
            <div className="pt-2 border-t border-border/30 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground uppercase tracking-widest">Created</span>
                <span className="font-semibold">{formatDateFull(issue.jiraCreatedAt)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground uppercase tracking-widest">Updated</span>
                <span className="font-semibold">{formatDateFull(issue.jiraUpdatedAt)}</span>
              </div>
              {context.cycleTimePercentile != null && (
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground uppercase tracking-widest">Percentile</span>
                  <span className="font-bold text-primary">
                    {context.cycleTimePercentile}th
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* GitHub Integration */}
          {(githubLoading || (github && (github.branches.length > 0 || github.pullRequests.length > 0))) && (
            <div className="bg-card rounded-xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 fill-foreground" viewBox="0 0 16 16">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" fillRule="evenodd" />
                  </svg>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                    GitHub Integration
                  </p>
                </div>
                {githubLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>

              {githubLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-full rounded-lg" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-full rounded-lg" />
                </div>
              ) : github && (
                <div className="space-y-5">
                  {/* Branches */}
                  {github.branches.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
                        Branches ({github.branches.length})
                      </p>
                      <div className="space-y-1.5">
                        {github.branches.map((b) => (
                          <a
                            key={b.name + b.repoName}
                            href={b.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GitBranch className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-mono font-bold truncate">{b.name}</p>
                                <p className="text-[9px] text-muted-foreground/60 truncate">{b.repoName}</p>
                              </div>
                            </div>
                            <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pull Requests */}
                  {github.pullRequests.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
                        Pull Requests ({github.pullRequests.length})
                      </p>
                      <div className="space-y-1.5">
                        {github.pullRequests.map((pr) => (
                          <a
                            key={pr.id}
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <GitPullRequest
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  pr.status === "OPEN" ? "text-emerald-500" :
                                  pr.status === "MERGED" ? "text-purple-500" :
                                  "text-red-500",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-mono font-bold truncate">
                                  {pr.id} {pr.title}
                                </p>
                                <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
                                  <span>→ {pr.destBranch}</span>
                                  {pr.commentCount > 0 && <span>{pr.commentCount} comment{pr.commentCount > 1 ? "s" : ""}</span>}
                                  {pr.reviewers.length > 0 && (
                                    <div className="flex -space-x-1">
                                      {pr.reviewers.slice(0, 3).map((r, i) => (
                                        <img
                                          key={i}
                                          src={r.avatar}
                                          alt={r.name}
                                          referrerPolicy="no-referrer"
                                          className="h-3 w-3 rounded-full ring-1 ring-card"
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 text-[8px] font-bold font-mono uppercase rounded-sm shrink-0 ml-2",
                                pr.status === "OPEN" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
                                pr.status === "MERGED" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" :
                                "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
                              )}
                            >
                              {pr.status === "DECLINED" ? "Closed" : pr.status.toLowerCase()}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Commits */}
                  {github.commits.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 font-bold">
                        Recent Commits ({github.commits.length})
                      </p>
                      <div className="space-y-1.5">
                        {github.commits.map((c) => (
                          <a
                            key={c.sha}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GitCommit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono font-bold text-primary">{c.sha}</span>
                                  <span className="text-[11px] truncate">{c.message}</span>
                                </div>
                              </div>
                            </div>
                            <span className="text-[9px] font-mono text-muted-foreground/60 whitespace-nowrap ml-2">{c.date}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Attachments Section */}
          {(phase2Loading || (phase2 && phase2.attachments.length > 0)) && (
            <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                  Attachments
                  {phase2 && (
                    <span className="ml-1 text-muted-foreground/60">
                      ({phase2.attachments.length})
                    </span>
                  )}
                </p>
              </div>

              {phase2Loading ? (
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {phase2!.attachments.map((att) => {
                    const isImage = att.mimeType.startsWith("image/");
                    return (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative group rounded-lg overflow-hidden bg-muted/20 border border-border/30 hover:border-primary/40 transition-colors aspect-[4/3] flex items-center justify-center"
                      >
                        {isImage && att.thumbnail ? (
                          <img
                            src={att.thumbnail}
                            alt={att.filename}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 p-2 text-muted-foreground">
                            {isImage ? (
                              <ImageIcon className="h-5 w-5" />
                            ) : (
                              <FileText className="h-5 w-5" />
                            )}
                            <span className="text-[9px] font-mono font-bold uppercase text-center leading-tight">
                              {att.filename.split(".").pop()?.toUpperCase()}
                            </span>
                          </div>
                        )}
                        {/* Filename overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[9px] font-mono text-white truncate">{att.filename}</p>
                          <p className="text-[8px] text-white/60">{formatFileSize(att.size)}</p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Linked Issues Section */}
          {(phase2Loading || (phase2 && phase2.linkedIssues.length > 0)) && (
            <div className="bg-card rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground font-bold">
                  Linked Issues
                </p>
              </div>

              {phase2Loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {phase2!.linkedIssues.map((linked) => (
                    <Link
                      key={linked.id}
                      href={`/issue/${linked.key}`}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors group"
                    >
                      <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-bold font-mono text-primary shrink-0">
                        {linked.key}
                      </span>
                      <span className="text-[11px] text-foreground truncate flex-1 min-w-0">
                        {linked.title}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
