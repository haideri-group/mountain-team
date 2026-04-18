/**
 * Database-aware wrapper around the pure `readiness.ts` module.
 *
 * Takes a release + a map of jiraKey→{status, assigneeId, startRef} plus
 * precomputed coverage + scope-creep counts, and returns the readiness
 * verdict. Keeps the pure function pure; all I/O lives here.
 */
import { computeReadiness, issueStatusBucket, type ReadinessIssueCounts, type ReadinessOutput } from "./readiness";

const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export interface IssueRowForReadiness {
  status: string;
  assigneeId: string | null;
  /** startDate or jiraCreatedAt — used for stale-age calc on in-progress issues */
  startRef: string | null;
}

export interface ReleaseRowForReadiness {
  releaseDate: string | null;
  released: boolean;
  createdAt: Date | string | null;
}

export function buildReadinessIssueCounts(rows: IssueRowForReadiness[]): ReadinessIssueCounts {
  const now = Date.now();
  const counts: ReadinessIssueCounts = {
    done: 0,
    inProgress: 0,
    inReview: 0,
    readyForTesting: 0,
    readyForLive: 0,
    toDo: 0,
    unassigned: 0,
    staleInProgress: 0,
  };

  for (const r of rows) {
    const bucket = issueStatusBucket(r.status);
    switch (bucket) {
      case "done":
        counts.done += 1;
        break;
      case "inProgress":
        counts.inProgress += 1;
        break;
      case "inReview":
        counts.inReview += 1;
        break;
      case "readyForTesting":
        counts.readyForTesting += 1;
        break;
      case "readyForLive":
        counts.readyForLive += 1;
        break;
      case "toDo":
        counts.toDo += 1;
        break;
    }
    if (!r.assigneeId && bucket !== "done") counts.unassigned += 1;
    if (bucket === "inProgress" && r.startRef) {
      const age = now - new Date(r.startRef).getTime();
      if (age > STALE_MS) counts.staleInProgress += 1;
    }
  }

  return counts;
}

export function computeReleaseReadiness(args: {
  release: ReleaseRowForReadiness;
  issueCounts: ReadinessIssueCounts;
  coverage: { staging: number; production: number; total: number };
  scopeCreepCount: number;
  velocityIssuesPerDay: number | null;
}): ReadinessOutput {
  const createdAt =
    args.release.createdAt instanceof Date
      ? args.release.createdAt.toISOString()
      : args.release.createdAt || new Date().toISOString();

  return computeReadiness({
    release: {
      releaseDate: args.release.releaseDate,
      released: args.release.released,
      createdAt,
    },
    issueCounts: args.issueCounts,
    coverage: args.coverage,
    scopeCreepCount: args.scopeCreepCount,
    velocityIssuesPerDay: args.velocityIssuesPerDay,
  });
}
