import type { Board } from "@/types";

export const mockBoards: Board[] = [
  {
    id: "board-01", jiraKey: "PROD", name: "Production Board",
    color: "#ff8400", description: "Continuous production board — bugs, fixes, CMS changes",
    isTracked: true, createdAt: new Date("2020-01-01"),
  },
  {
    id: "board-02", jiraKey: "BUTTERFLY", name: "Social Logins",
    color: "#000066", description: "Social login integration project (Google, Apple, SSO)",
    isTracked: true, createdAt: new Date("2025-12-01"),
  },
  {
    id: "board-03", jiraKey: "EAGLE", name: "E-commerce Platform Rebuild",
    color: "#9333ea", description: "Complete e-commerce platform rebuild with new checkout flow",
    isTracked: false, createdAt: new Date("2025-06-01"),
  },
  {
    id: "board-04", jiraKey: "DOLPHIN", name: "Customer Portal Redesign",
    color: "#0891b2", description: "Customer-facing portal with account management",
    isTracked: false, createdAt: new Date("2025-09-01"),
  },
  {
    id: "board-05", jiraKey: "FALCON", name: "Performance Monitoring",
    color: "#dc2626", description: "Frontend performance monitoring and optimization",
    isTracked: false, createdAt: new Date("2026-01-01"),
  },
];

export function getTrackedBoards() {
  return mockBoards.filter((b) => b.isTracked);
}

export function getBoardByKey(key: string) {
  return mockBoards.find((b) => b.jiraKey === key);
}

export function getBoardColor(jiraKey: string): string {
  const prefix = jiraKey.split("-")[0];
  return mockBoards.find((b) => b.jiraKey === prefix)?.color ?? "#6b7280";
}
