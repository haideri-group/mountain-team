import "dotenv/config";

// STATUS_MAP from normalizer — duplicated here for seeding
const STATUS_MAP: Record<string, string> = {
  "to do": "todo", "backlog": "todo", "open": "todo", "new": "todo",
  "selected for development": "todo", "reopened": "todo", "reopend": "todo",
  "re opened": "todo", "reopen": "todo",
  "on hold": "on_hold", "triage": "on_hold", "awaiting triage": "on_hold",
  "pending": "on_hold", "blocked": "on_hold", "merge conflict": "on_hold",
  "in progress": "in_progress", "in development": "in_progress", "inprogress": "in_progress",
  "in review": "in_review", "code review": "in_review", "code reveiw": "in_review",
  "peer review": "in_review", "developed": "in_review",
  "ready for testing": "ready_for_testing", "ready for testin": "ready_for_testing",
  "ready for end to end test": "ready_for_testing", "ready for end to end testing": "ready_for_testing",
  "in testing": "ready_for_testing", "testing": "ready_for_testing", "testing phase": "ready_for_testing",
  "qa": "ready_for_testing", "qa tes": "ready_for_testing", "ready for qa": "ready_for_testing",
  "user acceptance testing": "ready_for_testing", "test complete pending bugs": "ready_for_testing",
  "ready for live": "ready_for_live", "ready for deployment": "ready_for_live",
  "ready for release": "ready_for_live", "ready for deploy": "ready_for_live",
  "ready to deploy": "ready_for_live", "ready for production": "ready_for_live",
  "ready for delivery": "ready_for_live", "published live": "ready_for_live",
  "post live testing": "post_live_testing", "post-live testing": "post_live_testing",
  "postlive testing": "post_live_testing", "post live": "post_live_testing",
  "plt": "post_live_testing", "hypercare": "post_live_testing",
  "done": "done", "resolved": "done", "complete": "done",
  "ticket completed": "done", "launched": "done",
  "closed": "closed", "cancelled": "closed", "canceled": "closed",
  "won't do": "closed", "rejected": "closed", "declined": "closed",
};

async function main() {
  const { db } = await import("../src/lib/db");
  const { statusMappings } = await import("../src/lib/db/schema");

  console.log("Seeding status_mappings table...\n");

  let inserted = 0;
  let skipped = 0;

  for (const [jiraName, stage] of Object.entries(STATUS_MAP)) {
    // Capitalize first letter of each word for display
    const displayName = jiraName
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const id = `smap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      await db
        .insert(statusMappings)
        .values({
          id,
          jiraStatusName: displayName,
          workflowStage: stage,
          isAutoMapped: false,
        })
        .onDuplicateKeyUpdate({
          set: { workflowStage: stage },
        });
      inserted++;
    } catch {
      skipped++;
    }

    // Small delay to avoid duplicate IDs
    await new Promise((r) => setTimeout(r, 5));
  }

  console.log(`Done! Inserted: ${inserted}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
