import type { Notification } from "@/types";

export const mockNotifications: Notification[] = [
  {
    id: "notif-01",
    type: "aging",
    title: "Task aging: 5 days in progress",
    message: "PROD-5532 · API timeout on user profile page — James Liu · BLOCKED",
    relatedIssueId: "iss-12",
    relatedMemberId: "tm-03",
    isRead: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  },
  {
    id: "notif-02",
    type: "aging",
    title: "Task aging: 4 days in progress",
    message: "BUTTERFLY-105 · Design system token migration — Priya Shah",
    relatedIssueId: "iss-16",
    relatedMemberId: "tm-04",
    isRead: false,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
  },
  {
    id: "notif-03",
    type: "aging",
    title: "Task aging: 3 days in progress",
    message: "PROD-5547 · Fix checkout 500 error on Safari — Maria Rodriguez",
    relatedIssueId: "iss-07",
    relatedMemberId: "tm-02",
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
  },
  {
    id: "notif-04",
    type: "overdue",
    title: "Overdue: deadline passed",
    message: "BUTTERFLY-95 · OAuth provider research doc — Emma Wilson · Due Mar 10 — 6 days overdue",
    relatedIssueId: "iss-27",
    relatedMemberId: "tm-06",
    isRead: false,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
  },
  {
    id: "notif-05",
    type: "capacity",
    title: "Capacity alert: over 100%",
    message: "Maria Rodriguez is at 110% capacity — 4 active + 3 queued tasks",
    relatedIssueId: null,
    relatedMemberId: "tm-02",
    isRead: false,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
  },
  {
    id: "notif-06",
    type: "completed",
    title: "Task completed on time",
    message: "PROD-5540 · Fix login redirect bug — Alex Kim",
    relatedIssueId: "iss-05",
    relatedMemberId: "tm-01",
    isRead: true,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
  },
];

export function getUnreadCount() {
  return mockNotifications.filter((n) => !n.isRead).length;
}

export function getNotificationsByType(type?: string) {
  if (!type || type === "all") return mockNotifications;
  return mockNotifications.filter((n) => n.type === type);
}
