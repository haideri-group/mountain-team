import { NextResponse } from "next/server";

/**
 * Liveness probe used by Docker HEALTHCHECK + the staging deploy workflow.
 * Intentionally no DB call — we want to know the Node process is up, not
 * whether MySQL is reachable. Returns 200 quickly for the container runtime.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
