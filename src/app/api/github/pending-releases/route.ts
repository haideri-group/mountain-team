import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPendingReleases } from "@/lib/github/deployments";

// GET /api/github/pending-releases — Tasks staged but not yet on production
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const releases = await getPendingReleases();
    return NextResponse.json({ releases });
  } catch (error) {
    console.error("Failed to fetch pending releases:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pending releases" },
      { status: 500 },
    );
  }
}
