import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { team_members } = await import("../src/lib/db/schema");
  const { ne } = await import("drizzle-orm");

  const members = await db
    .select({
      name: team_members.displayName,
      avatar: team_members.avatarUrl,
      source: team_members.sourceAvatarUrl,
      hash: team_members.avatarHash,
    })
    .from(team_members)
    .where(ne(team_members.status, "departed"));

  console.log(`${members.length} active members:\n`);
  for (const m of members) {
    const avatarType = !m.avatar ? "NULL"
      : m.avatar.startsWith("http") ? "EXTERNAL"
      : m.avatar.startsWith("avatars/") ? "R2_PATH"
      : "OTHER";
    const sourceType = !m.source ? "NULL"
      : m.source.includes("google") ? "GOOGLE"
      : m.source.includes("gravatar") ? "GRAVATAR"
      : m.source.includes("atlassian") || m.source.includes("atl-paas") ? "ATLASSIAN"
      : "OTHER";
    console.log(
      avatarType.padEnd(10),
      sourceType.padEnd(12),
      m.name.padEnd(32),
      (m.avatar || "NULL").substring(0, 50),
    );
  }

  const r2Count = members.filter(m => m.avatar && !m.avatar.startsWith("http")).length;
  const extCount = members.filter(m => m.avatar && m.avatar.startsWith("http")).length;
  const nullCount = members.filter(m => !m.avatar).length;
  console.log(`\nR2 paths: ${r2Count}, External URLs: ${extCount}, NULL: ${nullCount}`);

  process.exit(0);
}
main().catch(console.error);
