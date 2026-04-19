import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { team_members } = await import("../src/lib/db/schema");
  const { or, like } = await import("drizzle-orm");

  const members = await db
    .select({ name: team_members.displayName, email: team_members.email, avatar: team_members.avatarUrl, source: team_members.sourceAvatarUrl })
    .from(team_members)
    .where(or(like(team_members.email, "%syed%"), like(team_members.displayName, "%Syed%")));

  for (const m of members) {
    const avatarType = !m.avatar ? "NULL" : m.avatar.startsWith("http") ? "EXTERNAL" : "R2_PATH";
    const sourceType = !m.source ? "NULL" : m.source.includes("google") ? "GOOGLE" : m.source.includes("gravatar") ? "GRAVATAR" : "ATLASSIAN";
    console.log(avatarType.padEnd(10), sourceType.padEnd(10), m.name.padEnd(30), m.email || "no email");
  }

  // Also show overall stats
  const all = await db.select({ avatar: team_members.avatarUrl, source: team_members.sourceAvatarUrl }).from(team_members);
  const r2 = all.filter(m => m.avatar && !m.avatar.startsWith("http")).length;
  const ext = all.filter(m => m.avatar?.startsWith("http")).length;
  const google = all.filter(m => m.source?.includes("google")).length;
  console.log(`\nTotal: ${all.length} | R2: ${r2} | External: ${ext} | Google source: ${google}`);

  process.exit(0);
}
main().catch(console.error);
