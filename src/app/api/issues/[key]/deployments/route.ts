import { NextResponse } from "next/server";
import { getDeploymentsForIssue } from "@/lib/github/deployments";

// GET /api/issues/:key/deployments — Deployment pipeline for an issue
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const summary = await getDeploymentsForIssue(key.toUpperCase());
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Failed to fetch deployments:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch deployments" },
      { status: 500 },
    );
  }
}
