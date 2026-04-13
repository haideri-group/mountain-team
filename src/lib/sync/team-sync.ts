import { db } from "@/lib/db";
import { team_members, syncLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  fetchAllTeamMembers,
  fetchJiraUserDetails,
  fetchCurrentUserAccountId,
  type JiraUserDetails,
  type MemberWithTeam,
} from "@/lib/jira/atlassian-teams";
import { matchFromDirectory } from "@/lib/google/directory";

// --- Constants ---

const MEMBER_COLORS = [
  "#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4",
  "#ec4899", "#14b8a6", "#f97316", "#a855f7", "#0ea5e9",
  "#84cc16", "#d946ef", "#f43f5e", "#6366f1", "#10b981",
  "#e11d48", "#7c3aed", "#0891b2",
];

// --- Types ---

export interface TeamSyncResult {
  added: number;
  departed: number;
  updated: number;
  rejoined: number;
  unchanged: number;
  emailsMatched: number;
  total: number;
  errors: string[];
  adminAccountId: string;
}

// --- Helpers ---

function pickColor(usedColors: Set<string>): string {
  const available = MEMBER_COLORS.filter((c) => !usedColors.has(c));
  if (available.length > 0) return available[0];
  return MEMBER_COLORS[usedColors.size % MEMBER_COLORS.length];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// --- Core Sync ---

async function syncTeamMembers(): Promise<TeamSyncResult> {
  const result: TeamSyncResult = {
    added: 0,
    departed: 0,
    updated: 0,
    rejoined: 0,
    unchanged: 0,
    emailsMatched: 0,
    total: 0,
    errors: [],
    adminAccountId: "",
  };

  // 1. Fetch admin's accountId to exclude
  const adminAccountId = await fetchCurrentUserAccountId();
  result.adminAccountId = adminAccountId;

  // 2. Fetch all team members with team info from Atlassian Teams API
  const allTeamMembers = await fetchAllTeamMembers();

  // Exclude admin
  const filteredMembers = allTeamMembers.filter(
    (m) => m.accountId !== adminAccountId,
  );

  // Build team lookup: accountId → { teamId, teamName }
  const teamLookup = new Map<string, MemberWithTeam>(
    filteredMembers.map((m) => [m.accountId, m]),
  );

  // 3. Fetch current DB members
  const dbMembers = await db.select().from(team_members);
  const dbByAccountId = new Map(
    dbMembers.map((m) => [m.jiraAccountId, m]),
  );

  // 4. Safety check: if API returns 0 members but DB has active members, abort
  const activeDbCount = dbMembers.filter((m) => m.status === "active" || m.status === "on_leave").length;
  if (filteredMembers.length === 0 && activeDbCount > 0) {
    throw new Error(
      `Teams API returned 0 members but DB has ${activeDbCount} active members. Aborting to prevent false departures.`,
    );
  }

  // 5. Resolve user details for all team members (parallel with resilience)
  const filteredAccountIds = filteredMembers.map((m) => m.accountId);
  const detailResults = await Promise.allSettled(
    filteredAccountIds.map((id) => fetchJiraUserDetails(id)),
  );

  const resolvedUsers: JiraUserDetails[] = [];
  for (let i = 0; i < detailResults.length; i++) {
    const r = detailResults[i];
    if (r.status === "fulfilled") {
      // Skip bots and inactive users
      if (r.value.accountType === "atlassian" && r.value.active) {
        resolvedUsers.push(r.value);
      }
    } else {
      result.errors.push(
        `Failed to fetch details for ${filteredAccountIds[i]}: ${r.reason}`,
      );
    }
  }

  const teamAccountIdSet = new Set(resolvedUsers.map((u) => u.accountId));
  const usedColors = new Set(dbMembers.map((m) => m.color).filter(Boolean) as string[]);

  // 6. Process each resolved user (new or update)
  for (const user of resolvedUsers) {
    const existing = dbByAccountId.get(user.accountId);

    const memberTeam = teamLookup.get(user.accountId);

    if (!existing) {
      // NEW member
      const color = pickColor(usedColors);
      usedColors.add(color);

      await db.insert(team_members).values({
        id: `tm_${Date.now()}_${result.added}`,
        jiraAccountId: user.accountId,
        displayName: user.displayName,
        email: user.emailAddress || null,
        role: null,
        status: "active",
        joinedDate: today(),
        departedDate: null,
        capacity: 10,
        avatarUrl: user.avatarUrls?.["48x48"] || null,
        color,
        teamId: memberTeam?.teamId || null,
        teamName: memberTeam?.teamName || null,
      });
      result.added++;
    } else if (existing.status === "departed") {
      // REJOINING member (was departed, now back in team)
      await db
        .update(team_members)
        .set({
          status: "active",
          departedDate: null,
          displayName: user.displayName,
          email: user.emailAddress || existing.email,
          avatarUrl: user.avatarUrls?.["48x48"] || existing.avatarUrl,
          teamId: memberTeam?.teamId || existing.teamId,
          teamName: memberTeam?.teamName || existing.teamName,
        })
        .where(eq(team_members.id, existing.id));
      result.rejoined++;
    } else {
      // EXISTING member (active or on_leave) -- update JIRA-managed fields only
      const nameChanged = existing.displayName !== user.displayName;
      const emailChanged =
        user.emailAddress && existing.email !== user.emailAddress;
      const avatarChanged =
        user.avatarUrls?.["48x48"] &&
        existing.avatarUrl !== user.avatarUrls["48x48"];
      const teamChanged =
        memberTeam && existing.teamId !== memberTeam.teamId;

      if (nameChanged || emailChanged || avatarChanged || teamChanged) {
        await db
          .update(team_members)
          .set({
            displayName: user.displayName,
            ...(emailChanged ? { email: user.emailAddress } : {}),
            ...(avatarChanged
              ? { avatarUrl: user.avatarUrls["48x48"] }
              : {}),
            ...(teamChanged
              ? { teamId: memberTeam.teamId, teamName: memberTeam.teamName }
              : {}),
          })
          .where(eq(team_members.id, existing.id));
        result.updated++;
      } else {
        result.unchanged++;
      }
    }
  }

  // 7. Mark departed: DB members (active/on_leave) NOT in team anymore
  for (const dbMember of dbMembers) {
    if (
      (dbMember.status === "active" || dbMember.status === "on_leave") &&
      !teamAccountIdSet.has(dbMember.jiraAccountId)
    ) {
      await db
        .update(team_members)
        .set({
          status: "departed",
          departedDate: today(),
        })
        .where(eq(team_members.id, dbMember.id));
      result.departed++;
    }
  }

  result.total =
    result.added +
    result.departed +
    result.updated +
    result.rejoined +
    result.unchanged;

  return result;
}

// --- Public Wrapper ---

export async function runTeamSync(googleAccessToken?: string): Promise<{
  logId: string;
  result: TeamSyncResult;
}> {
  const logId = `sync_${Date.now()}`;

  // Create running log entry
  await db.insert(syncLogs).values({
    id: logId,
    type: "team_sync",
    status: "running",
    memberCount: 0,
    issueCount: 0,
  });

  try {
    const result = await syncTeamMembers();

    // Match emails and avatars from Google Directory if token is available
    if (googleAccessToken) {
      try {
        const allMembers = await db.select().from(team_members);
        const membersToMatch = allMembers
          .filter((m) => m.status !== "departed")
          .map((m) => ({
            id: m.id,
            displayName: m.displayName,
            email: m.email,
          }));

        if (membersToMatch.length > 0) {
          const matchMap = await matchFromDirectory(
            googleAccessToken,
            membersToMatch,
          );

          for (const [memberId, match] of matchMap) {
            const updates: Record<string, string | null> = {};
            if (match.email) updates.email = match.email;
            // Don't overwrite JIRA/Gravatar avatars with Google photos (Google rate-limits lh3.googleusercontent.com)
            // Only set avatar from Google if member has no avatar at all
            if (match.photoUrl) {
              const [existing] = await db.select({ avatarUrl: team_members.avatarUrl }).from(team_members).where(eq(team_members.id, memberId)).limit(1);
              if (!existing?.avatarUrl) {
                updates.avatarUrl = match.photoUrl;
              }
            }

            if (Object.keys(updates).length > 0) {
              await db
                .update(team_members)
                .set(updates)
                .where(eq(team_members.id, memberId));
              result.emailsMatched++;
            }
          }
        }
      } catch (dirError) {
        result.errors.push(
          `Google Directory matching failed: ${dirError instanceof Error ? dirError.message : "Unknown error"}`,
        );
      }
    }

    // Update log to completed
    await db
      .update(syncLogs)
      .set({
        status: "completed",
        completedAt: new Date(),
        memberCount: result.total,
        error:
          result.errors.length > 0 ? result.errors.join("; ") : null,
      })
      .where(eq(syncLogs.id, logId));

    return { logId, result };
  } catch (error) {
    // Update log to failed
    await db
      .update(syncLogs)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(syncLogs.id, logId));

    throw error;
  }
}
