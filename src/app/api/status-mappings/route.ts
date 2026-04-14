import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusMappings } from "@/lib/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { WORKFLOW_STAGES } from "@/types";
import { invalidateStatusMappingCache } from "@/lib/jira/normalizer";

// GET /api/status-mappings — List all status mappings (admin only)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const mappings = await db
      .select()
      .from(statusMappings)
      .orderBy(statusMappings.jiraStatusName);

    const autoMappedCount = mappings.filter((m) => m.isAutoMapped).length;

    return NextResponse.json({ mappings, autoMappedCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch mappings" },
      { status: 500 },
    );
  }
}

// PATCH /api/status-mappings — Update a mapping's workflow stage (admin only)
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { id, workflowStage } = body;

    if (!id || !workflowStage) {
      return NextResponse.json({ error: "id and workflowStage required" }, { status: 400 });
    }

    if (!WORKFLOW_STAGES.includes(workflowStage)) {
      return NextResponse.json(
        { error: `Invalid workflow stage. Must be one of: ${WORKFLOW_STAGES.join(", ")}` },
        { status: 400 },
      );
    }

    await db
      .update(statusMappings)
      .set({ workflowStage, isAutoMapped: false })
      .where(eq(statusMappings.id, id));

    invalidateStatusMappingCache();

    const [updated] = await db
      .select()
      .from(statusMappings)
      .where(eq(statusMappings.id, id))
      .limit(1);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update mapping" },
      { status: 500 },
    );
  }
}
