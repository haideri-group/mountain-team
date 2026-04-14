import { db } from "@/lib/db";
import { team_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { withResolvedAvatar } from "@/lib/db/helpers";
import { isR2Configured } from "@/lib/r2/client";
import { cacheAvatar } from "@/lib/r2/avatars";

// Sync a single member's avatar after email change
// Google Directory lookup by email → download photo → cache to R2
async function syncMemberAvatar(
  memberId: string,
  displayName: string,
  email: string,
  googleAccessToken?: string,
) {
  try {
    if (!googleAccessToken) return;

    // Import searchDirectory to search by email directly
    const { default: fetch } = await import("node-fetch" as string).catch(() => ({ default: globalThis.fetch }));

    // Search Google Directory by email for exact match
    const params = new URLSearchParams({
      query: email,
      readMask: "names,emailAddresses,photos",
      sources: "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE",
      pageSize: "5",
    });

    const res = await globalThis.fetch(
      `https://people.googleapis.com/v1/people:searchDirectoryPeople?${params}`,
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) return;

    const data = await res.json();
    const people = (data as { people?: Array<{ emailAddresses?: Array<{ value?: string }>; photos?: Array<{ url?: string }> }> }).people || [];

    // Find exact email match
    const match = people.find((p) =>
      p.emailAddresses?.some((e) => e.value?.toLowerCase() === email.toLowerCase()),
    );

    const photoUrl = match?.photos?.[0]?.url;
    if (!photoUrl) return;

    // Update sourceAvatarUrl
    await db
      .update(team_members)
      .set({ sourceAvatarUrl: photoUrl, avatarHash: null })
      .where(eq(team_members.id, memberId));

    // Cache to R2 if configured
    if (isR2Configured()) {
      const result = await cacheAvatar(memberId, photoUrl, null, null);
      if (result) {
        await db
          .update(team_members)
          .set({
            avatarUrl: result.r2UrlSmall,
            sourceAvatarUrl: result.sourceUrl,
            avatarHash: result.hash,
          })
          .where(eq(team_members.id, memberId));
      }
    }

    console.log(`Synced avatar for ${displayName} (${email})`);
  } catch (err) {
    console.warn(`Failed to sync avatar for ${displayName}:`, err instanceof Error ? err.message : err);
  }
}

// GET /api/team/:id — Get single member
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const [member] = await db.select().from(team_members).where(eq(team_members.id, id)).limit(1);

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json(withResolvedAvatar(member));
  } catch (error) {
    console.error("Failed to fetch member:", error);
    return NextResponse.json({ error: "Failed to fetch member" }, { status: 500 });
  }
}

// PATCH /api/team/:id — Update admin-managed fields (role, capacity, color, status active/on_leave)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Guard: departed status can only be set by sync
    if (body.status === "departed") {
      return NextResponse.json(
        { error: "Departed status can only be set by team sync" },
        { status: 400 },
      );
    }

    await db.update(team_members).set(body).where(eq(team_members.id, id));

    const [updated] = await db
      .select()
      .from(team_members)
      .where(eq(team_members.id, id))
      .limit(1);

    // If email was updated, trigger single-member avatar sync in background
    // (Google Directory lookup by new email → download photo → cache to R2)
    if (body.email && updated) {
      syncMemberAvatar(updated.id, updated.displayName, body.email, session.user.googleAccessToken).catch(() => {});
    }

    return NextResponse.json(withResolvedAvatar(updated));
  } catch (error) {
    console.error("Failed to update member:", error);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}
