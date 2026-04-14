import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncSingleIssue } from "@/lib/sync/issue-sync";

// POST /api/issues/:key/sync — Sync a single issue from JIRA
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await params;
    const result = await syncSingleIssue(key.toUpperCase());

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to sync issue:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
