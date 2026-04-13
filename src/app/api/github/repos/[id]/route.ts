import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { githubRepos, githubBranchMappings, deployments } from "@/lib/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";

// PATCH /api/github/repos/:id — Update repo config
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Update repo fields
    const { webhookActive, branchMappings } = body;

    if (webhookActive !== undefined) {
      await db
        .update(githubRepos)
        .set({ webhookActive })
        .where(eq(githubRepos.id, id));
    }

    // If branch mappings provided, replace all
    if (branchMappings && Array.isArray(branchMappings)) {
      // Delete existing mappings
      await db
        .delete(githubBranchMappings)
        .where(eq(githubBranchMappings.repoId, id));

      // Insert new mappings
      for (const mapping of branchMappings) {
        const mappingId = `ghmap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.insert(githubBranchMappings).values({
          id: mappingId,
          repoId: id,
          branchPattern: mapping.branchPattern,
          environment: mapping.environment,
          siteName: mapping.siteName || null,
          siteLabel: mapping.siteLabel || null,
          isAllSites: mapping.isAllSites || false,
        });
      }
    }

    const [updated] = await db
      .select()
      .from(githubRepos)
      .where(eq(githubRepos.id, id));
    const updatedMappings = await db
      .select()
      .from(githubBranchMappings)
      .where(eq(githubBranchMappings.repoId, id));

    return NextResponse.json({ ...updated, branchMappings: updatedMappings });
  } catch (error) {
    console.error("Failed to update GitHub repo:", error);
    return NextResponse.json({ error: "Failed to update repo" }, { status: 500 });
  }
}

// DELETE /api/github/repos/:id — Remove repo + cascade
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Delete in FK order: deployments → branch mappings → repo
    await db.delete(deployments).where(eq(deployments.repoId, id));
    await db.delete(githubBranchMappings).where(eq(githubBranchMappings.repoId, id));
    await db.delete(githubRepos).where(eq(githubRepos.id, id));

    return NextResponse.json({ message: "Repo removed" });
  } catch (error) {
    console.error("Failed to delete GitHub repo:", error);
    return NextResponse.json({ error: "Failed to delete repo" }, { status: 500 });
  }
}
