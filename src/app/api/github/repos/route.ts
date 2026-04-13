import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { githubRepos, githubBranchMappings } from "@/lib/db/schema";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";

// GET /api/github/repos — List all tracked repos with branch mappings
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const repos = await db.select().from(githubRepos);
    const mappings = await db.select().from(githubBranchMappings);

    const result = repos.map((repo) => ({
      ...repo,
      branchMappings: mappings.filter((m) => m.repoId === repo.id),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch GitHub repos:", error);
    return NextResponse.json({ error: "Failed to fetch repos" }, { status: 500 });
  }
}

// POST /api/github/repos — Add a tracked repo with branch mappings
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { owner, name, branchMappings } = body;

    if (!owner || !name) {
      return NextResponse.json({ error: "Owner and name are required" }, { status: 400 });
    }

    const fullName = `${owner}/${name}`;
    const repoId = `ghrepo_${Date.now()}`;

    // Insert repo
    await db.insert(githubRepos).values({
      id: repoId,
      owner,
      name,
      fullName,
    });

    // Insert branch mappings
    if (branchMappings && Array.isArray(branchMappings)) {
      for (const mapping of branchMappings) {
        const mappingId = `ghmap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.insert(githubBranchMappings).values({
          id: mappingId,
          repoId,
          branchPattern: mapping.branchPattern,
          environment: mapping.environment,
          siteName: mapping.siteName || null,
          siteLabel: mapping.siteLabel || null,
          isAllSites: mapping.isAllSites || false,
        });
      }
    }

    // Fetch the created repo with mappings
    const [created] = await db
      .select()
      .from(githubRepos)
      .where(eq(githubRepos.id, repoId));
    const createdMappings = await db
      .select()
      .from(githubBranchMappings)
      .where(eq(githubBranchMappings.repoId, repoId));

    return NextResponse.json({ ...created, branchMappings: createdMappings }, { status: 201 });
  } catch (error) {
    console.error("Failed to add GitHub repo:", error);
    const message = error instanceof Error ? error.message : "Failed to add repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
