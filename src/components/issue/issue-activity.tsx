"use client";

import { useState, useEffect } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Edit,
  Link2,
} from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ActivityEntry, PaginatedComment, ThreadedComment } from "./issue-types";
import { formatSmartDate, formatDateTime, getInitials } from "./issue-helpers";

// ─── Comment Threading ───────────────────────────────────────────────────────

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

// ─── Activity Tabs Component ─────────────────────────────────────────────────

export function ActivityTabs({
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
                        {entry.to ?? "\u2014"}
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
