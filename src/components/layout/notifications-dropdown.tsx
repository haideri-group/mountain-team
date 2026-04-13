"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Clock,
  AlarmClock,
  AlertTriangle,
  CheckCircle2,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type NotificationType = "aging" | "overdue" | "capacity" | "completed" | "unblocked" | "deployed";

type TabKey = "all" | "aging" | "overdue" | "capacity" | "deployed";

interface RelatedIssue {
  jiraKey: string;
  title: string;
  status: string;
}

interface RelatedMember {
  displayName: string;
  avatarUrl: string | null;
}

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedIssueId: string | null;
  relatedMemberId: string | null;
  isRead: boolean;
  createdAt: string;
  relatedIssue: RelatedIssue | null;
  relatedMember: RelatedMember | null;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatBadgeCount(count: number): string {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

// ─── Notification Icon ───────────────────────────────────────────────────────

function NotificationIcon({ type, isRead }: { type: NotificationType; isRead: boolean }) {
  const base = "h-4 w-4 shrink-0";
  const dimmed = isRead ? "opacity-40" : "";

  switch (type) {
    case "aging":
      return <Clock className={cn(base, dimmed, "text-orange-500")} />;
    case "overdue":
      return <AlarmClock className={cn(base, dimmed, "text-destructive")} />;
    case "capacity":
      return <AlertTriangle className={cn(base, dimmed, "text-warning")} />;
    case "completed":
    case "unblocked":
      return <CheckCircle2 className={cn(base, dimmed, "text-success")} />;
    case "deployed":
      return <Rocket className={cn(base, dimmed, "text-emerald-500")} />;
    default:
      return <Bell className={cn(base, dimmed, "text-muted-foreground")} />;
  }
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const ALL_TABS: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "aging", label: "Aging" },
  { key: "overdue", label: "Overdue" },
  { key: "capacity", label: "Capacity", adminOnly: true },
  { key: "deployed", label: "Deployed" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotificationsDropdown({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ── Poll unread count every 30s ────────────────────────────────────────────
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/count");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.count ?? 0);
    } catch {
      // Silently fail — badge is non-critical
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // ── Fetch full list on open ────────────────────────────────────────────────
  const fetchNotifications = useCallback(async (type?: string) => {
    setIsLoading(true);
    try {
      const url = type && type !== "all"
        ? `/api/notifications?type=${type}`
        : "/api/notifications";
      const res = await fetch(url);
      if (!res.ok) return;
      const data: NotificationsResponse = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications(activeTab);
    }
  }, [isOpen, activeTab, fetchNotifications]);

  // ── Click outside + Escape ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // ── Mark all read ──────────────────────────────────────────────────────────
  async function handleMarkAllRead(e: React.MouseEvent) {
    e.preventDefault();
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-all-read" }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Silent fail
    }
  }

  // ── Mark single read + navigate ────────────────────────────────────────────
  async function handleNotificationClick(notif: Notification) {
    if (!notif.isRead) {
      try {
        await fetch(`/api/notifications/${notif.id}`, { method: "PATCH" });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Silent fail
      }
    }

    setIsOpen(false);

    if (notif.relatedIssue?.jiraKey) {
      router.push(`/issue/${notif.relatedIssue.jiraKey}`);
    } else if (notif.relatedMemberId) {
      router.push(`/members/${notif.relatedMemberId}`);
    }
  }

  const badge = formatBadgeCount(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      {/* ── Bell Trigger ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          "relative p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isOpen ? "bg-accent" : "hover:bg-accent",
        )}
      >
        <Bell className="h-5 w-5 text-foreground" />
        {badge && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5",
              "text-[10px] font-bold font-mono text-white leading-none select-none",
            )}
          >
            {badge}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "absolute right-0 top-full mt-2 z-50",
            "w-[400px] max-h-[500px] flex flex-col overflow-hidden",
            "bg-popover/95 backdrop-blur-xl",
            "ring-1 ring-foreground/10 shadow-2xl rounded-xl",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
                Notifications
              </h2>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-bold font-mono">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 pb-3 shrink-0">
            {ALL_TABS.filter((tab) => !tab.adminOnly || isAdmin).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium font-mono transition-colors",
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-input text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px bg-foreground/5 shrink-0" />

          {/* List */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="h-2 w-2 rounded-full bg-muted mt-2 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                <Bell className="h-8 w-8 opacity-30" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <ul role="list" className="py-2">
                {notifications.map((notif) => (
                  <li key={notif.id}>
                    <button
                      onClick={() => handleNotificationClick(notif)}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                        "hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50",
                        notif.isRead && "opacity-50",
                      )}
                    >
                      {/* Unread dot */}
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 rounded-full shrink-0 transition-colors",
                          notif.isRead ? "bg-transparent" : "bg-primary",
                        )}
                        aria-hidden="true"
                      />

                      {/* Icon */}
                      <span className="mt-0.5 shrink-0">
                        <NotificationIcon type={notif.type} isRead={notif.isRead} />
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug truncate">
                          {notif.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        {notif.relatedIssue && (
                          <span className="inline-block mt-1 text-[10px] font-mono font-semibold text-primary/80 uppercase tracking-wide">
                            {notif.relatedIssue.jiraKey}
                          </span>
                        )}
                      </div>

                      {/* Time */}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0 font-mono">
                        {timeAgo(notif.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
