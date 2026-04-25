import "dotenv/config";

async function main() {
  const { db } = await import("../src/lib/db");
  const { team_members } = await import("../src/lib/db/schema");
  const { like } = await import("drizzle-orm");

  // Find the member
  const members = await db
    .select()
    .from(team_members)
    .where(like(team_members.email, "%zafar%"));

  if (members.length === 0) {
    // Try by name
    const byName = await db.select().from(team_members).where(like(team_members.displayName, "%Zafar%"));
    if (byName.length === 0) {
      console.log("Member not found by email or name containing 'zafar'");
      // List all members with their emails
      const all = await db.select({ name: team_members.displayName, email: team_members.email }).from(team_members);
      for (const m of all) {
        if (m.email?.includes("syed") || m.name.toLowerCase().includes("syed")) {
          console.log(`  ${m.name} — ${m.email}`);
        }
      }
      process.exit(0);
    }
    members.push(...byName);
  }

  for (const m of members) {
    console.log("Name:", m.displayName);
    console.log("Email:", m.email);
    console.log("Avatar URL:", m.avatarUrl);
    console.log("Source Avatar URL:", m.sourceAvatarUrl);
    console.log("Avatar Hash:", m.avatarHash);
    console.log("Status:", m.status);
    console.log("Team:", m.teamName);
    console.log("");

    // Test if avatar URL is accessible
    if (m.avatarUrl) {
      try {
        const res = await fetch(m.avatarUrl, { method: "HEAD", redirect: "manual" });
        console.log(`Avatar fetch: ${res.status} ${res.statusText}`);
        if (res.status >= 300 && res.status < 400) {
          console.log("Redirects to:", res.headers.get("location")?.substring(0, 80));
        }
      } catch (e) {
        console.log("Avatar fetch error:", e instanceof Error ? e.message : String(e));
      }
    }
  }

  process.exit(0);
}
main().catch(console.error);
