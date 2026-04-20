/**
 * Global application configuration.
 * Single source of truth for settings used across the app.
 *
 * Import these constants instead of hardcoding the values inline —
 * it keeps a change a one-line edit and makes the intent self-
 * documenting at call sites. This file has no runtime side effects
 * and no `server-only` marker, so it's safe to import from server
 * code, client code, and one-off scripts alike.
 */

/**
 * IANA timezone for all user-facing date/time DISPLAY (Pakistan Standard
 * Time). Use this constant in every `toLocaleString({ timeZone: ... })`
 * call rather than hard-coding "Asia/Karachi" — keeps the display-tz
 * change a one-line edit if the company ever expands regions.
 *
 * NOTE: this affects DISPLAY only. Database operations and all
 * server-side date math run in MySQL's own time context
 * (`NOW() - INTERVAL ...`). The DB boundary is intentionally
 * timezone-agnostic; we don't configure a connection-level timezone so
 * existing stored values aren't reinterpreted across any future driver
 * upgrade.
 */
export const APP_TIMEZONE = "Asia/Karachi";

/**
 * Per-request budget (ms) for every Cronicle HTTP call — the in-app
 * `cronicleGet` wrapper AND the operator scripts (`scripts/cronicle-
 * set-timeouts.ts`, etc.) both bound their `fetch` with this. A stalled
 * Cronicle must not hang a page render or the operator's terminal.
 *
 * 10 s is generous for Cronicle's own admin endpoints (typical response
 * is sub-100 ms); the cap only trips when the server is genuinely
 * unreachable or overloaded, in which case failing fast is correct.
 */
export const CRONICLE_REQUEST_TIMEOUT_MS = 10_000;
