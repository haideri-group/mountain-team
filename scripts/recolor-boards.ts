import "dotenv/config";

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hNorm * 12) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateBoardColor(index: number): string {
  const goldenAngle = 137.508;
  const hue = (index * goldenAngle) % 360;
  return hslToHex(hue, 0.65, 0.55);
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { boards } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const allBoards = await db.select().from(boards);
  console.log(`Found ${allBoards.length} boards. Assigning distinct colors...\n`);

  for (let i = 0; i < allBoards.length; i++) {
    const board = allBoards[i];
    const newColor = generateBoardColor(i);
    await db.update(boards).set({ color: newColor }).where(eq(boards.id, board.id));
    console.log(`  ${board.jiraKey.padEnd(12)} ${board.color || "(none)"} → ${newColor}`);
  }

  console.log("\nDone! All boards now have distinct colors.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
