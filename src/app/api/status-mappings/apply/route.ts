import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusMappings } from "@/lib/db/schema";
import { auth } from "@/auth";
import { eq, sql } from "drizzle-orm";

// POST /api/status-mappings/apply — Apply a mapping change to existing issues (admin only)
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { mappingId } = body;

    if (!mappingId) {
      return NextResponse.json({ error: "mappingId required" }, { status: 400 });
    }

    // Fetch the mapping
    const [mapping] = await db
      .select()
      .from(statusMappings)
      .where(eq(statusMappings.id, mappingId))
      .limit(1);

    if (!mapping) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    // Count affected issues first
    const countResult = await db.execute(
      sql`SELECT COUNT(*) as affected FROM issues WHERE LOWER(jiraStatusName) = LOWER(${mapping.jiraStatusName}) AND status != ${mapping.workflowStage}`,
    );
    // db.execute returns [rows, fieldInfo]. For SELECT it's an array of
    // objects; for DML it's a ResultSetHeader. We know this is SELECT, so
    // cast via `unknown` to narrow to the row-array shape.
    const countRows = countResult[0] as unknown as Array<{ affected: number }>;
    const affected = countRows?.[0]?.affected ?? 0;

    // Mark mapping as reviewed (clear auto-mapped flag)
    if (mapping.isAutoMapped) {
      await db
        .update(statusMappings)
        .set({ isAutoMapped: false })
        .where(eq(statusMappings.id, mappingId));
    }

    if (affected === 0) {
      return NextResponse.json({ affected: 0, message: "Mapping confirmed — no issues needed updating" });
    }

    // Apply the mapping retroactively
    await db.execute(
      sql`UPDATE issues SET status = ${mapping.workflowStage} WHERE LOWER(jiraStatusName) = LOWER(${mapping.jiraStatusName})`,
    );

    return NextResponse.json({
      affected,
      message: `Updated ${affected} issues from "${mapping.jiraStatusName}" to workflow stage "${mapping.workflowStage}"`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply mapping" },
      { status: 500 },
    );
  }
}
