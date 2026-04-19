import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { summarize24h } from "@/lib/sync/logs-query";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const data = await summarize24h();
  return NextResponse.json(data);
}
