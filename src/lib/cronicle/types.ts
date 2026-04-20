/**
 * Cronicle types — narrow projections of the upstream API, covering only
 * the fields `/logs` actually consumes. The raw API response has many
 * more fields (notify emails, api_key, params.headers with Bearer tokens);
 * the `*Public` shapes are what's safe to cross the client boundary.
 */

export interface CronicleTiming {
  hours?: number[];
  minutes?: number[];
  days?: number[];
  months?: number[];
  weekdays?: number[];
}

/** Internal (server-only). Reflects fields we need from
 *  `GET /api/app/get_schedule/v1`. Callers must strip `params.headers`
 *  and `api_key` before handing this off to the client. */
export interface CronicleEvent {
  id: string;
  title: string;
  enabled: 0 | 1;
  category: string;
  plugin: string;
  target: string;
  timezone?: string;
  timing: CronicleTiming;
  params: {
    method?: string;
    url?: string;
    headers?: string;
    timeout?: string;
    [key: string]: unknown;
  };
  timeout?: number;
  retries?: number;
  retry_delay?: number;
  max_children?: number;
  notes?: string;
  modified?: number;
  created?: number;
}

/** One row from `GET /api/app/get_event_history/v1?id=…`. */
export interface CronicleJob {
  id: string;
  event: string;
  event_title?: string;
  hostname?: string;
  time_start: number;       // epoch seconds
  event_start?: number;     // epoch seconds (when Cronicle thinks the event fired)
  time_end?: number;
  elapsed?: number;         // seconds
  code?: number;            // 0 = success, non-zero = error code; missing on in-flight or partial records
  description?: string;     // human-readable status message
  perf?: {
    scale?: number;
    perf?: Record<string, number>;
    counters?: Record<string, number>;
  };
}

/** Client-safe projection of a `CronicleEvent`. Drops everything that
 *  carries secrets or internal-only data. */
export interface CronicleEventPublic {
  id: string;
  title: string;
  enabled: boolean;
  urlPath: string;                  // derived from params.url
  timing: CronicleTiming;
  lastRun: {
    jobId?: string;
    start: number;
    end: number | null;
    status: "success" | "error" | "timeout" | "running";
    elapsed?: number;
    /** Where the `status` value came from:
     *    `"app"`      — from our own `sync_logs` row (authoritative for
     *                   outcome when we have a correlated record).
     *    `"cronicle"` — from Cronicle's job record (used only when we
     *                   have no correlated `sync_logs` row, e.g. DNS
     *                   failure or handler crashed before logRunStart).
     *  Clients use this to decide whether to surface an "app success
     *  vs Cronicle timeout" disclosure banner. */
    statusSource: "app" | "cronicle";
    /** Id of the most recent sync_logs row matching this event's type —
     *  used by the UI to link the "last run" icon straight to the
     *  existing drawer. Null when no correlated app-side record exists
     *  (e.g. Cronicle's HTTP fire failed with a DNS / network error and
     *  the request never reached TeamFlow). */
    syncLogId: string | null;
    /** Cronicle's raw status for the matched job (not the mapped
     *  `status` above). Lets the drawer compare the two sources and
     *  render a disagreement banner when they differ. `null` when we
     *  have no matched Cronicle job. */
    cronicleJobStatus: "success" | "error" | "timeout" | "running" | null;
    /** Direct link to the Cronicle job details page, for jobs where we
     *  have no matching `sync_logs` row. Lets admins click "failed" and
     *  land on Cronicle's own error log. */
    jobDetailsUrl: string | null;
    /** Present only when the app-side sync is currently running AND the
     *  sync family publishes in-memory progress (issue syncs + deployment
     *  backfill). The UI renders an inline progress bar on the schedule
     *  panel so admins can see "X of Y processed" without opening the
     *  drawer. Null for scheduled-only types (team/release/worklog/
     *  timedoctor) which don't expose progress today. */
    progress: {
      phase: string;
      message: string;
      processed: number | null;
      total: number | null;
      /** 0–100 when `total > 0`, else null (indeterminate). */
      pct: number | null;
      /** Linear-extrapolation ETA in seconds. Null when: indeterminate
       *  (no total), the run just started (< 5s elapsed — rate is noisy),
       *  or no progress has been made yet (processed = 0 / in fetching
       *  phase). Client renders "~Xm Ys" when present. */
      etaSeconds: number | null;
    } | null;
  } | null;
  nextRun: number | null;           // epoch seconds, server-computed from timing
}

/** Result of matching a `sync_logs` row to a Cronicle job. */
export interface CronicleCorrelation {
  eventId: string;
  eventTitle: string;
  jobId: string;
  cronicleStart: number;
  cronicleEnd: number | null;
  status: "success" | "error" | "timeout" | "running";
  description?: string;
  elapsed?: number;
  performance?: { total?: number; wait?: number; [k: string]: number | undefined };
  jobDetailsUrl: string;
}

/** Uniform return shape from the Cronicle client wrapper — never throws. */
export type CronicleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
