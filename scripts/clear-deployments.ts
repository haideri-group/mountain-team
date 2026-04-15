import "dotenv/config";

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.log("Usage: yarn tsx scripts/clear-deployments.ts PROD-5338");
    process.exit(1);
  }

  const { db } = await import("../src/lib/db");
  const { deployments } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const existing = await db.select().from(deployments).where(eq(deployments.jiraKey, key));
  console.log(`Found ${existing.length} deployments for ${key}`);

  if (existing.length > 0) {
    await db.delete(deployments).where(eq(deployments.jiraKey, key));
    console.log(`Deleted ${existing.length} deployments. Re-sync the issue to re-record with correct dates.`);
  }

  process.exit(0);
}
main().catch(console.error);
