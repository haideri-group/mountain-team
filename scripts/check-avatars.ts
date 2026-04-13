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
    })
    .from(team_members)
    .where(ne(team_members.status, "departed"));

  for (const m of members) {
    const src = m.source || "(no source)";
    const isDefault = src.includes("universal_avatar") || src.includes("default-avatar") || src.includes("10508/avatar") || !m.source;
    console.log(
      (isDefault ? "❌" : "✅"),
      m.name.padEnd(35),
      src.substring(0, 90),
    );
  }

  const defaults = members.filter(m => {
    const src = m.source || "";
    return !src || src.includes("universal_avatar") || src.includes("default-avatar") || src.includes("10508/avatar");
  });
  console.log(`\n${defaults.length} of ${members.length} members have default/missing avatars`);

  process.exit(0);
}

main().catch(console.error);
