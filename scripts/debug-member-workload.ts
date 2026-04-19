import "dotenv/config";

async function main() {
  const memberId = process.argv[2];
  if (!memberId) { console.log("Usage: yarn tsx scripts/debug-member-workload.ts tm_123"); process.exit(1); }

  const { db } = await import("../src/lib/db");
  const { issues, team_members } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { calculateTaskWeight, WORKLOAD_COUNTED_STATUSES } = await import("../src/lib/workload/snapshots");

  const [member] = await db.select().from(team_members).where(eq(team_members.id, memberId)).limit(1);
  if (!member) { console.log("Member not found"); process.exit(1); }

  console.log("Member:", member.displayName, "| Capacity:", member.capacity || 15);

  const memberIssues = await db.select().from(issues).where(eq(issues.assigneeId, memberId));
  const byStatus: Record<string, number> = {};
  for (const i of memberIssues) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  console.log("By status:", byStatus);

  const countedStatuses: readonly string[] = WORKLOAD_COUNTED_STATUSES;
  const active = memberIssues.filter(i => countedStatuses.includes(i.status));
  console.log("\nCounted issues:", active.length);

  let total = 0;
  for (const i of active) {
    const w = calculateTaskWeight(i);
    total += w;
    console.log("  ", i.jiraKey, "| status:", i.status, "| type:", i.type, "| sp:", i.storyPoints, "| weight:", w);
  }

  console.log("\nTotal weight:", total, "/ capacity:", member.capacity || 15, "=", Math.round((total / (member.capacity || 15)) * 100) + "%");
  process.exit(0);
}
main().catch(console.error);
