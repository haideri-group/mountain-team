"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { StatusPill } from "./status-pill";
import { APP_TIMEZONE } from "@/lib/config";

export interface LogDetail {
  log: {
    id: string;
    type: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    issueCount: number;
    memberCount: number;
    source: string;
    error: string | null;
  };
  liveProgress?: {
    phase: string;
    message: string;
    issuesTotal?: number;
    issuesProcessed?: number;
    deploymentsRecorded?: number;
    rateLimitRemaining?: number | null;
    currentJiraKey?: string | null;
  } | null;
  cronicle?: {
    eventId: string;
    eventTitle: string;
    jobId: string;
    cronicleStart: number;
    cronicleEnd: number | null;
    status: string;
    description?: string;
    elapsed?: number;
    jobDetailsUrl: string;
    performance?: Record<string, number | undefined>;
  } | null;
  cronicleUnavailable?: boolean;
  canReclaim: boolean;
}

interface Props {
  open: boolean;
  detail: LogDetail | null;
  loading: boolean;
  onClose: () => void;
  onMarkFailed: (id: string) => Promise<void>;
}

function formatAbs(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: APP_TIMEZONE,
    hour12: true,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEpoch(sec: number | null): string {
  if (!sec) return "—";
  return formatAbs(new Date(sec * 1000).toISOString());
}

export function LogsDrawer({ open, detail, loading, onClose, onMarkFailed }: Props) {
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // A11y: when the drawer opens, focus the close button (so keyboard
  // users land somewhere sensible), listen for ESC, and lock the
  // underlying page scroll so the overlay behaves like a real modal.
  // Hook declared unconditionally (above the early-return) per
  // rules-of-hooks; the body itself no-ops when `open === false`.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Defer focus to the next microtask so the button actually exists
    // on the first render pass.
    queueMicrotask(() => closeButtonRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleMark = async () => {
    if (!detail) return;
    setMarking(true);
    setMarkError(null);
    try {
      await onMarkFailed(detail.log.id);
    } catch (e) {
      setMarkError(e instanceof Error ? e.message : "Failed");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close drawer"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-background shadow-2xl overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 bg-background/95 backdrop-blur">
          <div>
            <h2 id="drawer-title" className="text-lg font-bold font-mono">
              Run Details
            </h2>
            {detail && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {detail.log.id}
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && !detail && (
          <div className="p-10 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        )}

        {detail && (
          <div className="p-5 space-y-5">
            {/* App record */}
            <Section title="App Record">
              <KV label="Type" value={detail.log.type} />
              <KV label="Status" value={<StatusPill status={detail.log.status} />} />
              <KV label="Source" value={detail.log.source} />
              <KV label="Started" value={formatAbs(detail.log.startedAt)} />
              <KV label="Completed" value={formatAbs(detail.log.completedAt)} />
              <KV
                label="Duration"
                value={
                  detail.log.durationMs !== null
                    ? `${(detail.log.durationMs / 1000).toFixed(2)}s`
                    : "—"
                }
              />
              <KV label="Issues" value={String(detail.log.issueCount)} />
              {detail.log.memberCount > 0 && (
                <KV label="Members" value={String(detail.log.memberCount)} />
              )}
              {detail.log.error && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-red-700 dark:text-red-400">
                        Error
                      </p>
                      <p className="mt-1 text-xs text-red-700 dark:text-red-400 font-mono break-all whitespace-pre-wrap">
                        {detail.log.error}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Live progress */}
            {detail.log.status === "running" && detail.liveProgress && (
              <Section title="Live Progress">
                <KV label="Phase" value={detail.liveProgress.phase} />
                {detail.liveProgress.message && (
                  <KV label="Message" value={detail.liveProgress.message} />
                )}
                {typeof detail.liveProgress.issuesTotal === "number" && (
                  <KV
                    label="Progress"
                    value={`${detail.liveProgress.issuesProcessed ?? 0} / ${detail.liveProgress.issuesTotal}`}
                  />
                )}
                {detail.liveProgress.currentJiraKey && (
                  <KV label="Current" value={detail.liveProgress.currentJiraKey} />
                )}
                {typeof detail.liveProgress.rateLimitRemaining === "number" && (
                  <KV
                    label="GH quota left"
                    value={String(detail.liveProgress.rateLimitRemaining)}
                  />
                )}
              </Section>
            )}

            {/* Cronicle correlation */}
            {detail.cronicle && (
              <Section title="Scheduler Record">
                {/* When the app says `completed` but Cronicle says
                    `timeout` / `error`, the two sources disagree. For
                    `timeout` specifically, the scheduler's HTTP timeout
                    fired while our handler was still running — the sync
                    actually finished. For a generic `error`, Cronicle
                    thinks the request failed (e.g. connection reset
                    mid-response, non-2xx cached) but our handler still
                    wrote `completed`. In both cases the app record is
                    authoritative. Surface this explicitly with copy
                    tailored to whichever status Cronicle reported, so
                    admins aren't misled by a "timed out" narrative on a
                    non-timeout error. */}
                {detail.log.status === "completed" &&
                  (detail.cronicle.status === "timeout" ||
                    detail.cronicle.status === "error") && (
                    <div className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                      <p className="font-semibold">
                        {detail.cronicle.status === "timeout"
                          ? "Cronicle timed out, TeamFlow completed successfully."
                          : "Cronicle reported an error, TeamFlow completed successfully."}
                      </p>
                      <p className="mt-1 text-amber-700/90 dark:text-amber-300/80">
                        The scheduler marked this job as
                        <span className="font-mono"> {detail.cronicle.status} </span>
                        {detail.cronicle.status === "timeout"
                          ? "after its HTTP timeout elapsed, "
                          : "— likely a transient connection issue between Cronicle and TeamFlow — "}
                        but the app finished the sync normally. The app
                        record (above) is authoritative.
                        {detail.cronicle.status === "timeout" && (
                          <>
                            {" "}Consider raising the event&apos;s
                            timeout in Cronicle if this happens often.
                          </>
                        )}
                      </p>
                    </div>
                  )}
                <KV label="Job" value={detail.cronicle.eventTitle} />
                <KV label="Job ID" value={detail.cronicle.jobId} />
                <KV
                  label="Fired at"
                  value={formatEpoch(detail.cronicle.cronicleStart)}
                />
                <KV
                  label="Completed"
                  value={formatEpoch(detail.cronicle.cronicleEnd)}
                />
                <KV label="Status" value={<StatusPill status={detail.cronicle.status} />} />
                {detail.cronicle.description && (
                  <KV label="Description" value={detail.cronicle.description} />
                )}
                {detail.cronicle.elapsed !== undefined && (
                  <KV
                    label="Elapsed"
                    value={`${detail.cronicle.elapsed.toFixed(2)}s`}
                  />
                )}
                <a
                  href={detail.cronicle.jobDetailsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono text-[#ff8400] hover:underline"
                >
                  Open in external scheduler <ExternalLink className="h-3 w-3" />
                </a>
              </Section>
            )}

            {!detail.cronicle && detail.cronicleUnavailable && (
              <Section title="Scheduler Record">
                <p className="text-xs text-muted-foreground">
                  The external scheduler is not reachable or not configured — showing app record only.
                </p>
              </Section>
            )}

            {!detail.cronicle && !detail.cronicleUnavailable && (
              <Section title="Scheduler Record">
                <p className="text-xs text-muted-foreground">
                  No matching scheduled job within ±60s of this run. Manual triggers and
                  first-time runs may not have a scheduler correlation.
                </p>
              </Section>
            )}

            {/* Actions */}
            {detail.canReclaim && (
              <Section title="Actions">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This run has been in <span className="font-mono">running</span> state for more than 2 minutes.
                    It may be stuck (e.g. the client disconnected mid-run). Marking it failed releases the
                    concurrency guard so new runs can start.
                  </span>
                </div>
                <button
                  onClick={handleMark}
                  disabled={marking}
                  className="mt-3 flex items-center gap-2 px-4 h-9 rounded-lg bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25 text-sm font-bold font-mono uppercase tracking-wider disabled:opacity-50"
                >
                  {marking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Mark as failed
                </button>
                {markError && (
                  <p className="mt-2 text-xs text-red-700 dark:text-red-400">{markError}</p>
                )}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/20 p-4">
      <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-center">
      <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-xs font-mono break-all">{value}</span>
    </div>
  );
}
