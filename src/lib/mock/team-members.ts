import type { TeamMember } from "@/types";

export const mockTeamMembers: TeamMember[] = [
  {
    id: "tm-01", jiraAccountId: "alex.kim", displayName: "Alex Kim",
    email: "alex.kim@tilemountain.co.uk", role: "Senior Frontend Developer",
    status: "active", joinedDate: "2024-01-15", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#3b82f6",
    teamId: null, teamName: null,
    createdAt: new Date("2024-01-15"), updatedAt: new Date(),
  },
  {
    id: "tm-02", jiraAccountId: "maria.rodriguez", displayName: "Maria Rodriguez",
    email: "maria.r@tilemountain.co.uk", role: "Senior Frontend Developer",
    status: "active", joinedDate: "2021-03-01", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#ef4444",
    teamId: null, teamName: null,
    createdAt: new Date("2021-03-01"), updatedAt: new Date(),
  },
  {
    id: "tm-03", jiraAccountId: "james.liu", displayName: "James Liu",
    email: "james.liu@tilemountain.co.uk", role: "Junior Frontend Developer",
    status: "on_leave", joinedDate: "2022-06-10", departedDate: null,
    capacity: 8, avatarUrl: null, color: "#f59e0b",
    teamId: null, teamName: null,
    createdAt: new Date("2022-06-10"), updatedAt: new Date(),
  },
  {
    id: "tm-04", jiraAccountId: "priya.shah", displayName: "Priya Shah",
    email: "priya.s@tilemountain.co.uk", role: "Senior Frontend Developer",
    status: "active", joinedDate: "2020-08-20", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#8b5cf6",
    teamId: null, teamName: null,
    createdAt: new Date("2020-08-20"), updatedAt: new Date(),
  },
  {
    id: "tm-05", jiraAccountId: "tom.nguyen", displayName: "Tom Nguyen",
    email: "tom.n@tilemountain.co.uk", role: "Mid Frontend Developer",
    status: "active", joinedDate: "2023-02-01", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#06b6d4",
    teamId: null, teamName: null,
    createdAt: new Date("2023-02-01"), updatedAt: new Date(),
  },
  {
    id: "tm-06", jiraAccountId: "emma.wilson", displayName: "Emma Wilson",
    email: "emma.w@tilemountain.co.uk", role: "Tech Lead",
    status: "active", joinedDate: "2019-11-15", departedDate: null,
    capacity: 8, avatarUrl: null, color: "#ec4899",
    teamId: null, teamName: null,
    createdAt: new Date("2019-11-15"), updatedAt: new Date(),
  },
  {
    id: "tm-07", jiraAccountId: "ryan.khan", displayName: "Ryan Khan",
    email: "ryan.k@tilemountain.co.uk", role: "Mid Frontend Developer",
    status: "active", joinedDate: "2023-09-01", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#14b8a6",
    teamId: null, teamName: null,
    createdAt: new Date("2023-09-01"), updatedAt: new Date(),
  },
  {
    id: "tm-08", jiraAccountId: "david.wang", displayName: "David Wang",
    email: "david.w@tilemountain.co.uk", role: "Mid Frontend Developer",
    status: "departed", joinedDate: "2020-02-01", departedDate: "2025-11-15",
    capacity: 10, avatarUrl: null, color: "#6b7280",
    teamId: null, teamName: null,
    createdAt: new Date("2020-02-01"), updatedAt: new Date("2025-11-15"),
  },
  {
    id: "tm-09", jiraAccountId: "sarah.jones", displayName: "Sarah Jones",
    email: "sarah.j@tilemountain.co.uk", role: "Senior Frontend Developer",
    status: "departed", joinedDate: "2019-01-10", departedDate: "2025-06-30",
    capacity: 10, avatarUrl: null, color: "#9ca3af",
    teamId: null, teamName: null,
    createdAt: new Date("2019-01-10"), updatedAt: new Date("2025-06-30"),
  },
  {
    id: "tm-10", jiraAccountId: "amir.hassan", displayName: "Amir Hassan",
    email: "amir.h@tilemountain.co.uk", role: "Mid Frontend Developer",
    status: "active", joinedDate: "2022-11-01", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#f97316",
    teamId: null, teamName: null,
    createdAt: new Date("2022-11-01"), updatedAt: new Date(),
  },
  {
    id: "tm-11", jiraAccountId: "lisa.chen", displayName: "Lisa Chen",
    email: "lisa.c@tilemountain.co.uk", role: "Junior Frontend Developer",
    status: "active", joinedDate: "2024-06-01", departedDate: null,
    capacity: 8, avatarUrl: null, color: "#a855f7",
    teamId: null, teamName: null,
    createdAt: new Date("2024-06-01"), updatedAt: new Date(),
  },
  {
    id: "tm-12", jiraAccountId: "omar.farooq", displayName: "Omar Farooq",
    email: "omar.f@tilemountain.co.uk", role: "Mid Frontend Developer",
    status: "active", joinedDate: "2023-04-15", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#0ea5e9",
    teamId: null, teamName: null,
    createdAt: new Date("2023-04-15"), updatedAt: new Date(),
  },
  {
    id: "tm-13", jiraAccountId: "nina.patel", displayName: "Nina Patel",
    email: "nina.p@tilemountain.co.uk", role: "Senior Frontend Developer",
    status: "active", joinedDate: "2021-09-01", departedDate: null,
    capacity: 10, avatarUrl: null, color: "#84cc16",
    teamId: null, teamName: null,
    createdAt: new Date("2021-09-01"), updatedAt: new Date(),
  },
  {
    id: "tm-14", jiraAccountId: "jake.murphy", displayName: "Jake Murphy",
    email: "jake.m@tilemountain.co.uk", role: "Junior Frontend Developer",
    status: "departed", joinedDate: "2022-01-15", departedDate: "2025-09-30",
    capacity: 8, avatarUrl: null, color: "#d4d4d4",
    teamId: null, teamName: null,
    createdAt: new Date("2022-01-15"), updatedAt: new Date("2025-09-30"),
  },
];

export function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

export function getActiveMembers() {
  return mockTeamMembers.filter((m) => m.status === "active");
}

export function getOnLeaveMembers() {
  return mockTeamMembers.filter((m) => m.status === "on_leave");
}

export function getDepartedMembers() {
  return mockTeamMembers.filter((m) => m.status === "departed");
}
