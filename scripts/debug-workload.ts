import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { issues, team_members } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { calculateTaskWeight } = await import("../src/lib/workload/snapshots");

  const members = await db.select().from(team_members);
  const ateeq = members.find(m => m.displayName.includes("Ateeq"));
  if (!ateeq) { console.log("Ateeq not found"); process.exit(1); }
  console.log("Member:", ateeq.displayName, "| Capacity:", ateeq.capacity || 15);

  const memberIssues = await db.select().from(issues).where(eq(issues.assigneeId, ateeq.id));
  console.log("Total issues:", memberIssues.length);

  const byStatus: Record<string, number> = {};
  for (const i of memberIssues) {
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  }
  console.log("By status:", byStatus);

  const counted = ["todo", "in_progress", "in_review"];
  const activeIssues = memberIssues.filter(i => counted.includes(i.status));
  console.log("\nActive issues (counted for workload):", activeIssues.length);

  let totalWeight = 0;
  for (const i of activeIssues) {
    const w = calculateTaskWeight(i);
    totalWeight += w;
    console.log("  ", i.jiraKey, "| status:", i.status, "| type:", i.type, "| sp:", i.storyPoints, "| rp:", i.requestPriority, "| weight:", w);
  }

  const capacity = ateeq.capacity || 15;
  console.log("\nTotal weight:", totalWeight, "/ capacity:", capacity, "=", Math.round((totalWeight / capacity) * 100) + "%");

  // Also check other statuses that might be miscounted
  const other = memberIssues.filter(i => !counted.includes(i.status) && i.status !== "done" && i.status !== "closed");
  if (other.length > 0) {
    console.log("\nOther non-done statuses NOT counted:");
    for (const i of other) {
      console.log("  ", i.jiraKey, "| status:", i.status, "| type:", i.type);
    }
  }

  process.exit(0);
}
main().catch(console.error);
