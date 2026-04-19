import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ipAllowlist } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeCidr } from "@/lib/ip/match";
import { invalidateAllowlistCache } from "@/lib/ip/allowlist-cache";

/**
 * PATCH  — toggle `enabled`, edit `cidr` or `label`. Admin-only.
 * DELETE — remove a rule. Admin-only.
 * Both invalidate the in-memory cache.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  let body: { cidr?: unknown; label?: unknown; enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Partial<{ cidr: string; label: string | null; enabled: boolean }> = {};

  if (body.cidr !== undefined) {
    if (typeof body.cidr !== "string") {
      return NextResponse.json({ error: "cidr must be a string" }, { status: 400 });
    }
    const normalized = normalizeCidr(body.cidr);
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid IP address or CIDR range" },
        { status: 400 },
      );
    }
    update.cidr = normalized;
  }

  if (body.label !== undefined) {
    if (body.label === null) {
      update.label = null;
    } else if (typeof body.label === "string") {
      const trimmed = body.label.trim();
      if (trimmed.length > 255) {
        return NextResponse.json(
          { error: "Label must be 255 characters or fewer" },
          { status: 400 },
        );
      }
      update.label = trimmed.length === 0 ? null : trimmed;
    } else {
      return NextResponse.json({ error: "label must be a string or null" }, { status: 400 });
    }
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    update.enabled = body.enabled;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Verify the row exists BEFORE mutating. Without this, an invalid id
  // silently updates zero rows, still invalidates the cache (a wasted DB
  // hit on next request), and only then returns 404.
  const [existing] = await db
    .select({ id: ipAllowlist.id })
    .from(ipAllowlist)
    .where(eq(ipAllowlist.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  try {
    await db.update(ipAllowlist).set(update).where(eq(ipAllowlist.id, id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string } | null)?.code;
    if (code === "ER_DUP_ENTRY" || /duplicate/i.test(msg)) {
      return NextResponse.json(
        { error: "This CIDR is already in the allowlist" },
        { status: 409 },
      );
    }
    throw err;
  }
  invalidateAllowlistCache();

  const [row] = await db
    .select()
    .from(ipAllowlist)
    .where(eq(ipAllowlist.id, id))
    .limit(1);

  return NextResponse.json({ rule: row });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  // Verify the row exists first so the client gets a truthful 404 instead
  // of a misleading `{ success: true }` when the id is invalid.
  const [existing] = await db
    .select({ id: ipAllowlist.id })
    .from(ipAllowlist)
    .where(eq(ipAllowlist.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await db.delete(ipAllowlist).where(eq(ipAllowlist.id, id));
  invalidateAllowlistCache();

  return NextResponse.json({ success: true });
}
