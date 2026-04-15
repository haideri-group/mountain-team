import type { Comment, ChangelogEntry, ActivityEntry } from "./issue-types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PRIORITY_COLORS: Record<string, string> = {
  highest: "#ba1a1a",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#3b82f6",
  lowest: "#6b7280",
};

export const PRIORITY_ICON_CLASS: Record<string, string> = {
  highest: "text-red-600",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-blue-500",
  lowest: "text-muted-foreground",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { APP_TIMEZONE } from "@/lib/config";
export const PKT = APP_TIMEZONE;

export function formatSmartDate(dateStr: string | null | undefined): string {
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

export function formatDateTime(dateStr: string): string {
  return formatSmartDate(dateStr);
}

export function formatDateFull(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    timeZone: PKT,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export function mergeActivity(comments: Comment[], changelog: ChangelogEntry[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...comments.map((c) => ({ type: "comment" as const, ...c })),
    ...changelog.map((c) => ({ type: "change" as const, ...c })),
  ];
  return entries.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
