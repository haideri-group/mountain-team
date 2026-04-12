import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { notifications } = await import("../src/lib/db/schema");

  console.log("Clearing notifications table (to allow schema push)...");
  await db.delete(notifications);
  console.log("Done. Now run: yarn db:push");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
