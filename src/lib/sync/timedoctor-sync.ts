import { db } from "@/lib/db";
import { timedoctorEntries, team_members, syncLogs } from "@/lib/db/schema";
import { eq, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  isTimeDoctorConfigured,
  fetchTDUsers,
  fetchTDWorklogs,
  type TDWorklogEntry,
} from "@/lib/timedoctor/client";
import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TDSyncResult {
  usersMatched: number;
  entriesUpserted: number;
  errors: string[];
}

// ─── User Matching ───────────────────────────────────────────────────────────

/**
 * Match Time Doctor users to team_members by email.
 * Updates team_members.tdUserId for matched users.
 * Returns count of newly matched users.
 */
async function matchUsers(): Promise<number> {
  const tdUsers = await fetchTDUsers();
  if (tdUsers.length === 0) return 0;

  const members = await db
    .select({ id: team_members.id, email: team_members.email, tdUserId: team_members.tdUserId })
    .from(team_members)
    .where(inArray(team_members.status, ["active", "on_leave"]));

  const emailToMember = new Map(
    members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m]),
  );

  let matched = 0;
  for (const tdUser of tdUsers) {
    if (!tdUser.email) continue;
    const member = emailToMember.get(tdUser.email.toLowerCase());
    if (member && member.tdUserId !== String(tdUser.id)) {
      await db
        .update(team_members)
        .set({ tdUserId: String(tdUser.id) })
        .where(eq(team_members.id, member.id));
      matched++;
    }
  }

  return matched;
}

// ─── Core Sync ───────────────────────────────────────────────────────────────

export async function syncTimeDoctorEntries(sinceDays = 7): Promise<TDSyncResult> {
  const result: TDSyncResult = { usersMatched: 0, entriesUpserted: 0, errors: [] };

  if (!isTimeDoctorConfigured()) {
    result.errors.push("Time Doctor not configured");
    return result;
  }

  // Step 1: Match users if needed
  try {
    const unmatchedCount = await db
      .select({ id: team_members.id })
      .from(team_members)
      .where(isNull(team_members.tdUserId))
      .then((rows) => rows.length);

    if (unmatchedCount > 0) {
      result.usersMatched = await matchUsers();
    }
  } catch (err) {
    result.errors.push(`User matching failed: ${err instanceof Error ? err.message : String(err)}`);
    // Continue — we can still sync for already-matched users
  }

  // Step 2: Load matched members
  const matchedMembers = await db
    .select({ id: team_members.id, tdUserId: team_members.tdUserId })
    .from(team_members)
    .where(isNotNull(team_members.tdUserId));

  if (matchedMembers.length === 0) {
    result.errors.push("No team members matched with Time Doctor users");
    return result;
  }

  const tdUserIdToMemberId = new Map(
    matchedMembers.map((m) => [m.tdUserId!, m.id]),
  );
  const tdUserIds = matchedMembers.map((m) => m.tdUserId!);

  // Step 3: Fetch worklogs from Time Doctor
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);
  const fromStr = sinceDate.toISOString().split("T")[0];
  const toStr = new Date().toISOString().split("T")[0];

  let entries: TDWorklogEntry[] = [];
  try {
    entries = await fetchTDWorklogs(fromStr, toStr, tdUserIds);
  } catch (err) {
    result.errors.push(`Worklog fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  // Step 4: Upsert entries
  for (const entry of entries) {
    const tdUserId = String(entry.userId);
    const memberId = tdUserIdToMemberId.get(tdUserId);
    if (!memberId) continue;

    const durationSeconds = entry.length || entry.duration || 0;
    if (durationSeconds <= 0) continue;

    const started = entry.start ? new Date(entry.start) : null;
    if (!started || isNaN(started.getTime())) continue;

    // Build a unique worklog ID from TD data
    const tdWorklogId = entry.id
      ? String(entry.id)
      : `td-${tdUserId}-${started.getTime()}-${durationSeconds}`;

    try {
      await db
        .insert(timedoctorEntries)
        .values({
          id: crypto.randomUUID(),
          tdWorklogId,
          memberId,
          tdUserId,
          taskName: entry.taskName || null,
          projectName: entry.projectName || null,
          started,
          durationSeconds,
        })
        .onDuplicateKeyUpdate({
          set: {
            durationSeconds,
            taskName: entry.taskName || null,
            projectName: entry.projectName || null,
          },
        });

      result.entriesUpserted++;
    } catch (err) {
      result.errors.push(`Entry upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ─── Entry point with logging ────────────────────────────────────────────────

export async function runTimeDoctorSync(
  sinceDays = 7,
): Promise<{ logId: string; result: TDSyncResult }> {
  const logId = crypto.randomUUID();

  await db.insert(syncLogs).values({
    id: logId,
    type: "timedoctor_sync",
    status: "running",
  });

  try {
    const result = await syncTimeDoctorEntries(sinceDays);

    await db
      .update(syncLogs)
      .set({
        status: "completed",
        completedAt: new Date(),
        issueCount: result.entriesUpserted,
        memberCount: result.usersMatched,
        error: result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null,
      })
      .where(eq(syncLogs.id, logId));

    return { logId, result };
  } catch (err) {
    await db
      .update(syncLogs)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(syncLogs.id, logId));

    throw err;
  }
}
