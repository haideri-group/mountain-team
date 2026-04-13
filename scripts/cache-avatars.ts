import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { team_members } = await import("../src/lib/db/schema");
  const { isR2Configured } = await import("../src/lib/r2/client");
  const { cacheAvatar } = await import("../src/lib/r2/avatars");
  const { eq } = await import("drizzle-orm");

  if (!isR2Configured()) {
    console.error("❌ R2 is not configured. Set CLOUDFLARE_R2_* env vars in .env");
    process.exit(1);
  }

  const r2PublicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, "");
  console.log(`R2 public URL: ${r2PublicUrl}`);
  console.log("");

  // Find members with external avatar URLs (not already R2)
  const members = await db.select().from(team_members);
  const toMigrate = members.filter(
    (m) =>
      m.avatarUrl &&
      !m.avatarUrl.startsWith(r2PublicUrl) &&
      m.status !== "departed",
  );

  console.log(`Found ${toMigrate.length} members with external avatars to cache.`);
  console.log("");

  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of toMigrate) {
    process.stdout.write(`  ${member.displayName}... `);

    try {
      const result = await cacheAvatar(
        member.id,
        member.avatarUrl!,
        member.sourceAvatarUrl,
        member.avatarHash,
      );

      if (result) {
        await db
          .update(team_members)
          .set({
            avatarUrl: result.r2UrlSmall,
            sourceAvatarUrl: result.sourceUrl,
            avatarHash: result.hash,
          })
          .where(eq(team_members.id, member.id));
        console.log(`✅ cached (sm + lg)`);
        cached++;
      } else {
        console.log(`⏭️  skipped (unchanged)`);
        skipped++;
      }
    } catch (err) {
      console.log(`❌ error: ${err instanceof Error ? err.message : "unknown"}`);
      failed++;
    }

    // Small delay
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("");
  console.log(`Done! Cached: ${cached}, Skipped: ${skipped}, Failed: ${failed}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
