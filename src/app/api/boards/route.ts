import { db } from "@/lib/db";
import { boards } from "@/lib/db/schema";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";

// Generate a visually distinct board color based on index
// Uses golden angle (137.5°) to distribute hues evenly around the color wheel
// Saturation 65% + Lightness 55% = vibrant but easy on the eyes, works on light & dark
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
  // Golden angle ensures maximum visual separation between consecutive colors
  const goldenAngle = 137.508;
  const hue = (index * goldenAngle) % 360;
  return hslToHex(hue, 0.65, 0.55);
}

function pickNextColor(usedColors: Set<string>): string {
  // Try indices until we find an unused color
  for (let i = 0; i < 1000; i++) {
    const color = generateBoardColor(i);
    if (!usedColors.has(color.toLowerCase())) return color;
  }
  return generateBoardColor(usedColors.size);
}

// GET /api/boards — List all boards
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allBoards = await db.select().from(boards).orderBy(desc(boards.createdAt));
    return NextResponse.json(allBoards);
  } catch (error) {
    console.error("Failed to fetch boards:", error);
    return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
  }
}

// POST /api/boards — Add a new board/project (admin only)
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { jiraKey, name, color, description, isTracked } = body;

    if (!jiraKey || !name) {
      return NextResponse.json({ error: "jiraKey and name are required" }, { status: 400 });
    }

    // Get existing board colors to avoid duplicates
    const existingBoards = await db.select({ color: boards.color }).from(boards);
    const usedColors = new Set(
      existingBoards.map((b) => (b.color || "").toLowerCase()).filter(Boolean),
    );

    const id = `brd_${Date.now()}`;
    const assignedColor = (color && !usedColors.has(color.toLowerCase()))
      ? color
      : pickNextColor(usedColors);

    await db.insert(boards).values({
      id,
      jiraKey: jiraKey.toUpperCase(),
      name,
      color: assignedColor,
      description: description || null,
      isTracked: isTracked ?? true,
    });

    return NextResponse.json({ id, message: "Board added successfully" }, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to add board:", error);
    const message =
      error instanceof Error && error.message.includes("Duplicate")
        ? "A board with this JIRA key already exists"
        : "Failed to add board";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
