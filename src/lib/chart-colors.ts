/**
 * Centralised chart colour palette. Recharts components need concrete colour
 * strings (not CSS variables) at the serialisation boundary — keeping these
 * in one file lets us retheme without touching every chart component.
 *
 * Values are picked to match the Summit Logic tokens in `src/app/globals.css`
 * (`--chart-1` = brand orange) or commonly-accepted semantic Tailwind hues
 * for status indicators. Update here, not in individual chart files.
 */

export const CHART_COLORS = {
  /** Brand orange — matches `--chart-1`. Primary series. */
  brand: "#ff8400",
  /** Secondary brand / "project" series. */
  brandBlue: "#3b82f6",
  /** Completed / success series (emerald-500). */
  done: "#10b981",
  /** In-progress / caution series (amber-500). */
  inProgress: "#f59e0b",
  /** To-do / muted series (slate-400). */
  toDo: "#94a3b8",
} as const;

export type ChartColorKey = keyof typeof CHART_COLORS;
