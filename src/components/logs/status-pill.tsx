import { cn } from "@/lib/utils";

type StatusKind = "running" | "completed" | "failed" | "unknown";

const STATUS_CLASSES: Record<StatusKind, string> = {
  completed:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
  running: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  unknown: "bg-muted/40 text-muted-foreground",
};

const STATUS_GLYPH: Record<StatusKind, string> = {
  completed: "✓",
  failed: "✗",
  running: "●",
  unknown: "◐",
};

export function StatusPill({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const kind: StatusKind =
    status === "completed" || status === "failed" || status === "running"
      ? status
      : "unknown";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wider",
        STATUS_CLASSES[kind],
      )}
    >
      <span className="leading-none">{STATUS_GLYPH[kind]}</span>
      {label ?? kind}
    </span>
  );
}
