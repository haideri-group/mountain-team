import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { githubRepos, githubBranchMappings } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const repos = await db.select().from(githubRepos);
  console.log(`${repos.length} tracked repos:\n`);

  for (const repo of repos) {
    console.log(`${repo.fullName} (ID: ${repo.id})`);
    console.log(`  Webhook: ${repo.webhookActive ? "Active" : "Not set"}`);
    console.log(`  Last backfill: ${repo.lastBackfillAt || "Never"}`);

    const mappings = await db.select().from(githubBranchMappings).where(eq(githubBranchMappings.repoId, repo.id));
    console.log(`  Mappings (${mappings.length}):`);
    for (const m of mappings) {
      console.log(`    ${m.branchPattern.padEnd(25)} → ${m.environment.padEnd(12)} site=${m.siteName || "(all)"} isAllSites=${m.isAllSites}`);
    }

    // Check if 'stage' is mapped
    const stageMapping = mappings.find(m => m.branchPattern === "stage");
    console.log(`  'stage' branch mapped: ${stageMapping ? "YES → " + stageMapping.environment : "NO"}`);
    console.log("");
  }

  // Check deployments for PROD-5338
  const { deployments } = await import("../src/lib/db/schema");
  const { like } = await import("drizzle-orm");
  const deploys = await db.select().from(deployments).where(eq(deployments.jiraKey, "PROD-5338"));
  console.log(`Deployments for PROD-5338: ${deploys.length}`);
  for (const d of deploys) {
    console.log(`  ${d.environment} | ${d.siteName} | ${d.branch} | ${d.deployedAt}`);
  }

  process.exit(0);
}
main().catch(console.error);
