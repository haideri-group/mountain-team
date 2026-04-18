/**
 * /api/releases/[id]/checklist
 *
 *   GET          — list items (seeds default template if none exist yet)
 *   POST         — add a new item (admin only)
 *   PATCH ?itemId — update an item (toggle isComplete, rename, reorder)
 *                   toggling requires any logged-in user
 *                   relabel / reorder requires admin
 *   DELETE ?itemId — remove an item (admin only)
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { jiraReleases, releaseChecklistItems, users } from "@/lib/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { sanitizeErrorText } from "@/lib/jira/client";
import crypto from "crypto";

const DEFAULT_TEMPLATE: string[] = [
  "Release notes drafted and reviewed",
  "Release notes shared with stakeholders",
  "All issues in release moved past Ready for Testing",
  "QA sign-off recorded",
  "Staging verified on all target sites",
  "Production deployment window confirmed",
  "Post-deploy smoke test owner assigned",
];

async function ensureReleaseExists(id: string) {
  const [release] = await db
    .select({ id: jiraReleases.id })
    .from(jiraReleases)
    .where(eq(jiraReleases.id, id))
    .limit(1);
  return !!release;
}

async function getUserId(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return u?.id ?? null;
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!(await ensureReleaseExists(id))) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    let items = await db
      .select()
      .from(releaseChecklistItems)
      .where(eq(releaseChecklistItems.releaseId, id))
      .orderBy(asc(releaseChecklistItems.sortOrder), asc(releaseChecklistItems.createdAt));

    // Seed default template on first view
    if (items.length === 0) {
      const toInsert = DEFAULT_TEMPLATE.map((label, i) => ({
        id: `rcl_${crypto.randomBytes(8).toString("hex")}`,
        releaseId: id,
        label,
        isComplete: false,
        completedBy: null,
        completedAt: null,
        sortOrder: i,
      }));
      await db.insert(releaseChecklistItems).values(toInsert);
      items = await db
        .select()
        .from(releaseChecklistItems)
        .where(eq(releaseChecklistItems.releaseId, id))
        .orderBy(asc(releaseChecklistItems.sortOrder), asc(releaseChecklistItems.createdAt));
    }

    // Resolve completedBy names in one query
    const completedByIds = [...new Set(items.map((i) => i.completedBy).filter((v): v is string => !!v))];
    const userRows = completedByIds.length
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, completedByIds))
      : [];
    const userMap = new Map<string, string>(
      userRows.map((u) => [u.id, u.name || u.email] as const),
    );

    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        label: i.label,
        isComplete: i.isComplete,
        completedByName: i.completedBy ? userMap.get(i.completedBy) || null : null,
        completedAt: i.completedAt ? i.completedAt.toISOString() : null,
        sortOrder: i.sortOrder,
      })),
    });
  } catch (error) {
    console.error(
      "Checklist GET error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to load checklist" }, { status: 500 });
  }
}

// ── POST (add item, admin only) ──────────────────────────────────────────────
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await context.params;
    if (!(await ensureReleaseExists(id)))
      return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const body = (await request.json()) as { label?: string };
    const label = body.label?.trim();
    if (!label)
      return NextResponse.json({ error: "label is required" }, { status: 400 });

    // Wrapped in a transaction so concurrent admin adds can't both read the
    // same MAX(sortOrder) and then both insert with identical ordering.
    const newId = `rcl_${crypto.randomBytes(8).toString("hex")}`;
    await db.transaction(async (tx) => {
      const [maxRow] = await tx
        .select({ max: sql<number>`MAX(${releaseChecklistItems.sortOrder})` })
        .from(releaseChecklistItems)
        .where(eq(releaseChecklistItems.releaseId, id));
      const nextOrder = (maxRow?.max ?? -1) + 1;
      await tx.insert(releaseChecklistItems).values({
        id: newId,
        releaseId: id,
        label: label.slice(0, 255),
        isComplete: false,
        sortOrder: nextOrder,
      });
    });

    return NextResponse.json({ id: newId });
  } catch (error) {
    console.error(
      "Checklist POST error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to add item" }, { status: 500 });
  }
}

// ── PATCH (toggle/relabel/reorder) ───────────────────────────────────────────
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    const body = (await request.json()) as {
      isComplete?: boolean;
      label?: string;
      sortOrder?: number;
    };

    const [existing] = await db
      .select()
      .from(releaseChecklistItems)
      .where(and(eq(releaseChecklistItems.id, itemId), eq(releaseChecklistItems.releaseId, id)))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const isAdmin = session.user.role === "admin";
    const isToggleOnly =
      body.isComplete !== undefined && body.label === undefined && body.sortOrder === undefined;
    if (!isToggleOnly && !isAdmin) {
      return NextResponse.json({ error: "Only admins can rename or reorder" }, { status: 403 });
    }

    const userId = await getUserId(session.user.email);
    const updates: Record<string, unknown> = {};
    if (body.isComplete !== undefined) {
      updates.isComplete = !!body.isComplete;
      updates.completedBy = body.isComplete ? userId : null;
      updates.completedAt = body.isComplete ? new Date() : null;
    }
    if (body.label !== undefined) updates.label = body.label.trim().slice(0, 255);
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    await db
      .update(releaseChecklistItems)
      .set(updates)
      .where(eq(releaseChecklistItems.id, itemId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Checklist PATCH error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await context.params;
    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    await db
      .delete(releaseChecklistItems)
      .where(and(eq(releaseChecklistItems.id, itemId), eq(releaseChecklistItems.releaseId, id)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Checklist DELETE error:",
      sanitizeErrorText(error instanceof Error ? error.message : String(error)),
    );
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
