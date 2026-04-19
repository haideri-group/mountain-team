import { auth } from "@/auth";
import { onSyncLogChange } from "@/lib/sync/events";

/**
 * GET /api/automations/events
 *
 * Server-Sent Events stream. Pushes one message per `sync_logs` state
 * transition (run started, run finished). Subscribers on the client
 * reload their view reactively — no polling needed.
 *
 * Admin-only. One event-loop listener per connected admin tab; auto-
 * unsubscribes on client disconnect via `request.signal.abort`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEEPALIVE_MS = 25_000;

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (data: unknown) => {
        safeEnqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Initial hello — the client uses this to confirm the stream is live.
      sendEvent({ event: "hello", at: Date.now() });

      // Subscribe to the in-process event bus; each event fires
      // immediately on the same Node tick as the sync writer's DB update.
      // Use `event` as the envelope discriminator so we don't clobber
      // the sync-log row's own `type` field (e.g. "team_sync").
      const unsubscribe = onSyncLogChange((syncEvent) => {
        sendEvent({ event: "syncLog", ...syncEvent });
      });

      // Keepalive comment frame so intermediaries (Cloudflare, Railway,
      // nginx) don't close the idle connection.
      const keepaliveTimer = setInterval(() => {
        safeEnqueue(`: keepalive\n\n`);
      }, KEEPALIVE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepaliveTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Browser tab closed, navigated away, or process terminated.
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables proxy buffering in nginx / some CDNs so events flush live.
      "X-Accel-Buffering": "no",
    },
  });
}
