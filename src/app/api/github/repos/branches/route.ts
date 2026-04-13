import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { githubFetchAll, isGitHubConfigured } from "@/lib/github/client";

// GET /api/github/repos/branches?owner=tilemountainuk&name=tile-mountain-sdk
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }

    if (!isGitHubConfigured()) {
      return NextResponse.json({ error: "GitHub not configured" }, { status: 400 });
    }

    const owner = request.nextUrl.searchParams.get("owner");
    const name = request.nextUrl.searchParams.get("name");

    if (!owner || !name) {
      return NextResponse.json({ error: "owner and name params required" }, { status: 400 });
    }

    const rawBranches = await githubFetchAll<{ name: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches?per_page=100`,
    );

    const branches = rawBranches.map((b) => b.name).sort();

    return NextResponse.json({ branches });
  } catch (error) {
    console.error("Failed to fetch branches:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch branches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
