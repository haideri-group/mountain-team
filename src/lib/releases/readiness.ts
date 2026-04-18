/**
 * Release readiness — pure function, no DB calls, no side effects.
 *
 * Given a release and the signals derived from its issues/deployments,
 * produces three views of the same truth:
 *
 *   status + reason        → product-owner-facing; a traffic light + plain sentence
 *   projectedShipDate      → the one date a PO actually cares about
 *   score + riskFactors    → engineer-facing; sortable, explainable, behind ⓘ
 *
 * Deterministic: the same input always produces the same output.
 */

export type ReleaseStatus = "on_track" | "at_risk" | "slipping" | "overdue" | "released";

export interface ReadinessIssueCounts {
  done: number;
  inProgress: number;
  inReview: number;
  readyForTesting: number;
  readyForLive: number;
  toDo: number;
  unassigned: number;
  staleInProgress: number; // in_progress > 3 days
}

export interface ReadinessInput {
  release: {
    releaseDate: string | null; // YYYY-MM-DD
    released: boolean;
    createdAt: string; // ISO
  };
  issueCounts: ReadinessIssueCounts;
  coverage: { staging: number; production: number; total: number };
  scopeCreepCount: number;
  /** Team throughput in issues-per-day. `null` when we can't compute (new team, no snapshots). */
  velocityIssuesPerDay: number | null;
}

export interface ReadinessOutput {
  score: number; // 0..100
  status: ReleaseStatus;
  reason: string;
  projectedShipDate: string | null; // YYYY-MM-DD
  projectedDaysVsDue: number | null; // +3 = late, -1 = early
  riskFactors: string[];
}

// ─── Weighting ───────────────────────────────────────────────────────────────

/** Status distance from "done" — used for both the score penalty and the
 *  weighted-remaining work calculation. Keep these in sync. */
const STATUS_WEIGHT = {
  todo: 1.0,
  inProgress: 0.5,
  inReview: 0.3,
  readyForTesting: 0.1,
  readyForLive: 0.05,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function totalRemaining(c: ReadinessIssueCounts): number {
  return c.toDo + c.inProgress + c.inReview + c.readyForTesting + c.readyForLive;
}

function weightedRemaining(c: ReadinessIssueCounts): number {
  return (
    c.toDo * STATUS_WEIGHT.todo +
    c.inProgress * STATUS_WEIGHT.inProgress +
    c.inReview * STATUS_WEIGHT.inReview +
    c.readyForTesting * STATUS_WEIGHT.readyForTesting +
    c.readyForLive * STATUS_WEIGHT.readyForLive
  );
}

function totalIssues(c: ReadinessIssueCounts): number {
  return c.done + totalRemaining(c);
}

function parseYmd(s: string | null): Date | null {
  if (!s) return null;
  // JIRA releaseDate is YYYY-MM-DD; interpret at noon UTC to avoid TZ flip
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Add N days, skipping weekends. `n` can be fractional; we ceil. */
function addBusinessDays(start: Date, n: number): Date {
  const days = Math.max(0, Math.ceil(n));
  const d = new Date(start.getTime());
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d;
}

// ─── Score ───────────────────────────────────────────────────────────────────

function computeScore(input: ReadinessInput, overdueDays: number): number {
  const { issueCounts: c, scopeCreepCount, coverage, release } = input;
  const total = totalIssues(c);
  if (total === 0) return release.released ? 100 : 80; // empty release — be charitable

  // Scale status penalty so score range is stable across release sizes.
  const statusPenaltyRaw =
    c.toDo * STATUS_WEIGHT.todo +
    c.inProgress * STATUS_WEIGHT.inProgress +
    c.inReview * STATUS_WEIGHT.inReview +
    c.readyForTesting * STATUS_WEIGHT.readyForTesting +
    c.readyForLive * STATUS_WEIGHT.readyForLive;
  const statusPenalty = (statusPenaltyRaw / total) * 100;

  let score = 100 - statusPenalty;

  // Schedule pressure
  score -= Math.min(20, overdueDays * 2);

  // Scope churn
  score -= scopeCreepCount * 3;

  // Stale work
  score -= c.staleInProgress * 2;

  // Unassigned
  score -= c.unassigned * 2;

  // Coverage bonus — rewards teams that get to staging early
  const stagingRatio = total > 0 ? coverage.staging / total : 0;
  const dueDate = parseYmd(release.releaseDate);
  const now = new Date();
  if (stagingRatio > 0.8 && dueDate && now.getTime() <= dueDate.getTime()) {
    score += 5;
  }

  return Math.round(clamp(score, 0, 100));
}

// ─── Projection ──────────────────────────────────────────────────────────────

function computeProjection(
  input: ReadinessInput,
  now: Date,
): { projectedShipDate: string | null; projectedDaysVsDue: number | null } {
  const dueDate = parseYmd(input.release.releaseDate);

  if (input.release.released) {
    return { projectedShipDate: null, projectedDaysVsDue: null };
  }

  const remaining = totalRemaining(input.issueCounts);
  if (remaining === 0) {
    const today = toYmd(now);
    return {
      projectedShipDate: today,
      projectedDaysVsDue: dueDate ? daysBetween(dueDate, now) : null,
    };
  }

  if (input.velocityIssuesPerDay === null || input.velocityIssuesPerDay <= 0) {
    return { projectedShipDate: null, projectedDaysVsDue: null };
  }

  const work = weightedRemaining(input.issueCounts);
  const daysNeeded = work / input.velocityIssuesPerDay;
  const projected = addBusinessDays(now, daysNeeded);
  return {
    projectedShipDate: toYmd(projected),
    projectedDaysVsDue: dueDate ? daysBetween(dueDate, projected) : null,
  };
}

// ─── Reason picker ───────────────────────────────────────────────────────────

function pickReason(
  input: ReadinessInput,
  overdueDays: number,
  projectedDaysVsDue: number | null,
): string {
  const { issueCounts: c, coverage, scopeCreepCount, release } = input;
  const total = totalIssues(c);
  const remaining = totalRemaining(c);

  if (release.released) return "Released";

  // Priority order: overdue > stale > scope creep > undone > coverage
  if (overdueDays > 0) {
    return remaining > 0
      ? `${overdueDays}d past due, ${remaining} ${remaining === 1 ? "issue" : "issues"} not done`
      : `${overdueDays}d past due — ready to mark released`;
  }

  if (c.staleInProgress > 0) {
    return `${c.staleInProgress} ${c.staleInProgress === 1 ? "task is" : "tasks are"} stuck in progress for 3+ days`;
  }

  if (scopeCreepCount >= 3) {
    return `Scope grew by ${scopeCreepCount} ${scopeCreepCount === 1 ? "issue" : "issues"} since release started`;
  }

  if (c.unassigned > 0) {
    return `${c.unassigned} ${c.unassigned === 1 ? "issue" : "issues"} unassigned`;
  }

  if (projectedDaysVsDue !== null && projectedDaysVsDue > 0) {
    return `Projected ${projectedDaysVsDue}d late at current pace`;
  }

  if (remaining === 0) return "All issues done — ready to ship";

  if (total > 0 && coverage.staging / total >= 0.8) {
    return `${coverage.staging}/${total} staged, clear path to ship`;
  }

  // Pick the most representative in-flight bucket for the summary line
  const buckets: Array<[number, string]> = [
    [c.readyForLive, "ready for live"],
    [c.readyForTesting, "in testing"],
    [c.inReview, "in review"],
    [c.inProgress, "in progress"],
    [c.toDo, "to do"],
  ];
  const top = buckets.find(([n]) => n > 0);
  if (top) {
    return `${c.done}/${total} done, ${top[0]} ${top[1]}`;
  }

  return `${c.done}/${total} done`;
}

// ─── Status picker ───────────────────────────────────────────────────────────

function pickStatus(
  input: ReadinessInput,
  overdueDays: number,
  projectedDaysVsDue: number | null,
): ReleaseStatus {
  if (input.release.released) return "released";
  if (overdueDays > 0) return "overdue";

  const { issueCounts: c } = input;

  if (c.staleInProgress >= 3) return "slipping";
  if (projectedDaysVsDue !== null && projectedDaysVsDue > 3) return "slipping";

  if (c.staleInProgress >= 1) return "at_risk";
  if (projectedDaysVsDue !== null && projectedDaysVsDue > 0) return "at_risk";
  if (input.scopeCreepCount >= 3) return "at_risk";

  return "on_track";
}

// ─── Risk factor itemiser (for the ⓘ modal) ─────────────────────────────────

function collectRiskFactors(input: ReadinessInput, overdueDays: number): string[] {
  const out: string[] = [];
  const { issueCounts: c, scopeCreepCount, coverage } = input;
  const total = totalIssues(c);

  if (overdueDays > 0) out.push(`Past due by ${overdueDays}d`);
  if (c.staleInProgress > 0) {
    out.push(`${c.staleInProgress} task${c.staleInProgress === 1 ? "" : "s"} stuck in progress > 3d`);
  }
  if (scopeCreepCount > 0) {
    out.push(`${scopeCreepCount} issue${scopeCreepCount === 1 ? "" : "s"} added after release started`);
  }
  if (c.unassigned > 0) {
    out.push(`${c.unassigned} unassigned issue${c.unassigned === 1 ? "" : "s"}`);
  }
  if (c.toDo > 0) out.push(`${c.toDo} still to-do`);
  if (c.inProgress > 0) out.push(`${c.inProgress} in progress`);
  if (c.inReview > 0) out.push(`${c.inReview} in review`);
  if (c.readyForTesting > 0) out.push(`${c.readyForTesting} ready for testing`);
  if (c.readyForLive > 0) out.push(`${c.readyForLive} ready for live`);

  if (total > 0) {
    const stagingPct = Math.round((coverage.staging / total) * 100);
    const prodPct = Math.round((coverage.production / total) * 100);
    out.push(`Staging coverage: ${stagingPct}%`);
    out.push(`Production coverage: ${prodPct}%`);
  }

  if (input.velocityIssuesPerDay === null) {
    out.push("Velocity unknown — not enough history yet");
  } else {
    out.push(`Team velocity: ~${input.velocityIssuesPerDay.toFixed(1)} issues/day`);
  }

  return out;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function computeReadiness(input: ReadinessInput, now: Date = new Date()): ReadinessOutput {
  const dueDate = parseYmd(input.release.releaseDate);
  const overdueDays =
    !input.release.released && dueDate && now.getTime() > dueDate.getTime()
      ? daysBetween(dueDate, now)
      : 0;

  const projection = computeProjection(input, now);
  const score = computeScore(input, overdueDays);
  const status = pickStatus(input, overdueDays, projection.projectedDaysVsDue);
  const reason = pickReason(input, overdueDays, projection.projectedDaysVsDue);
  const riskFactors = collectRiskFactors(input, overdueDays);

  return {
    score,
    status,
    reason,
    projectedShipDate: projection.projectedShipDate,
    projectedDaysVsDue: projection.projectedDaysVsDue,
    riskFactors,
  };
}

/** Classify the app-level status string into our 5 readiness categories.
 *  Used when reducing per-issue statuses into the counts the readiness
 *  function expects. Keep in sync with the 11-status enum in normalizer.ts. */
export function issueStatusBucket(
  status: string,
): "done" | "inProgress" | "inReview" | "readyForTesting" | "readyForLive" | "toDo" | "other" {
  switch (status) {
    case "done":
    case "closed":
      return "done";
    case "in_progress":
      return "inProgress";
    case "in_review":
      return "inReview";
    case "ready_for_testing":
      return "readyForTesting";
    case "ready_for_live":
    case "rolling_out":
    case "post_live_testing":
      return "readyForLive";
    case "todo":
    case "backlog":
    case "on_hold":
      return "toDo";
    default:
      return "other";
  }
}
