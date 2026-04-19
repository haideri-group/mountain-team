import "server-only";
import { EventEmitter } from "events";
import type { SyncLogStatus, SyncLogType } from "./logs-query";

/**
 * In-process event bus for sync_logs state changes.
 *
 * Every cron writer calls `emitSyncLogChange(...)` at each status
 * transition (running → completed / failed). The /automations SSE route
 * listens on this emitter and forwards events to any connected admin
 * clients. No DB polling — updates are instant.
 *
 * Railway hobby = single Node instance, so a module-level EventEmitter
 * is sufficient. On a multi-instance deploy, swap the emitter for a
 * Redis pub/sub or similar; consumer API stays the same.
 */

export interface SyncLogChangeEvent {
  id: string;
  type: SyncLogType;
  status: SyncLogStatus;
  startedAt: string | null;
  completedAt: string | null;
  /** Populated when the event represents a status transition (started /
   *  ended). Useful for consumers that want to distinguish "this run
   *  began" from "this run finished." */
  transition: "started" | "finished";
}

const emitter = new EventEmitter();
// Each connected admin's SSE stream registers a listener. Bump generously
// so we don't hit the default-10 warning under normal multi-tab usage.
emitter.setMaxListeners(200);

export function emitSyncLogChange(event: SyncLogChangeEvent): void {
  try {
    emitter.emit("syncLog:change", event);
  } catch (err) {
    // Never let an event-bus failure break a sync writer's control flow.
    console.warn(
      "[sync/events] emit failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function onSyncLogChange(
  handler: (event: SyncLogChangeEvent) => void,
): () => void {
  emitter.on("syncLog:change", handler);
  return () => {
    emitter.off("syncLog:change", handler);
  };
}
