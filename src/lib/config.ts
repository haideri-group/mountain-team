/**
 * Global application configuration.
 * Single source of truth for settings used across the app.
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
