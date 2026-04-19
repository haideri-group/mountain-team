import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ipAllowlist } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { isIpAllowed, normalizeCidr } from "@/lib/ip/match";
import { invalidateAllowlistCache } from "@/lib/ip/allowlist-cache";
import { getClientIp } from "@/lib/ip/resolve";

/**
 * GET  — list all allowlist rows. Admin-only.
 * POST — add a new rule. Body: { cidr: string, label?: string | null }.
 *        Validates + normalizes cidr via ipaddr.js. Stamps createdBy.
 *        Invalidates the in-memory cache so the rule takes effect immediately.
 */

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(ipAllowlist)
    .orderBy(desc(ipAllowlist.createdAt));

  const yourIp = getClientIp(request);
  const enabledCidrs = rows.filter((r) => r.enabled).map((r) => r.cidr);
  const yourIpCovered = yourIp ? isIpAllowed(yourIp, enabledCidrs) : false;

  return NextResponse.json({
    rules: rows,
    yourIp,
    yourIpCovered,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: { cidr?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.cidr !== "string" || !body.cidr.trim()) {
    return NextResponse.json(
      { error: "cidr is required" },
      { status: 400 },
    );
  }

  const normalized = normalizeCidr(body.cidr);
  if (!normalized) {
    return NextResponse.json(
      { error: "Invalid IP address or CIDR range" },
      { status: 400 },
    );
  }

  let label: string | null = null;
  if (typeof body.label === "string") {
    const trimmed = body.label.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 255) {
        return NextResponse.json(
          { error: "Label must be 255 characters or fewer" },
          { status: 400 },
        );
      }
      label = trimmed;
    }
  }

  const id = `ipallow_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  try {
    await db.insert(ipAllowlist).values({
      id,
      cidr: normalized,
      label,
      enabled: true,
      createdBy: session.user.id ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The `cidr` column has a UNIQUE constraint (`uidx_ip_allowlist_cidr`).
    // MySQL raises ER_DUP_ENTRY (errno 1062) — mysql2 surfaces that as
    // `code: "ER_DUP_ENTRY"` in the error object. Return a clean 409 so
    // the admin UI can show "already in the allowlist".
    const code = (err as { code?: string } | null)?.code;
    if (code === "ER_DUP_ENTRY" || /duplicate/i.test(msg)) {
      return NextResponse.json(
        { error: "This CIDR is already in the allowlist" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Failed to add rule: ${msg}` },
      { status: 500 },
    );
  }

  invalidateAllowlistCache();

  return NextResponse.json({
    rule: {
      id,
      cidr: normalized,
      label,
      enabled: true,
      createdBy: session.user.id ?? null,
    },
  });
}
