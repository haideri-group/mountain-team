import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { deployments, issues, boards, team_members, githubRepos, githubBranchMappings } from "@/lib/db/schema";
import { eq, and, desc, gte, inArray, isNotNull, notInArray } from "drizzle-orm";
import { withResolvedAvatars } from "@/lib/db/helpers";
import { sanitizeErrorText } from "@/lib/jira/client";
import type { Mismatch, PendingRelease, SiteStatus } from "@/components/deployments/types";
import { APP_TIMEZONE } from "@/lib/config";
import { getExpectedSites, getDeploymentCompleteness, getSiteLabel } from "@/lib/deployments/brand-resolver";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPKTDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

function getStartOfWeekPKT(now: Date): Date {
  const dateStr = getPKTDateString(now);
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  utc.setUTCDate(utc.getUTCDate() - diff);
  const mondayStr = utc.toISOString().split("T")[0];
  return new Date(`${mondayStr}T00:00:00+05:00`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const envFilter = url.searchParams.get("environment") || "";
    const repoFilter = url.searchParams.get("repo") || "";
    const siteFilter = url.searchParams.get("site") || "";
    const boardFilter = url.searchParams.get("board") || "";

    const now = new Date();
    const weekStart = getStartOfWeekPKT(now);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ── Load reference data ────────────────────────────────────────────
    const allBoards = await db
      .select({ id: boards.id, jiraKey: boards.jiraKey, name: boards.name, color: boards.color })
      .from(boards)
      .where(eq(boards.isTracked, true));
    const boardMap = new Map(allBoards.map((b) => [b.id, b]));
    const boardKeyMap = new Map(allBoards.map((b) => [b.jiraKey, b]));

    const allRepos = await db.select().from(githubRepos);
    const repoMap = new Map(allRepos.map((r) => [r.id, r]));

    const allMembers = withResolvedAvatars(
      await db
        .select({
          id: team_members.id,
          displayName: team_members.displayName,
          avatarUrl: team_members.avatarUrl,
        })
        .from(team_members),
    );
    const memberMap = new Map(allMembers.map((m) => [m.id, m]));

    // All configured sites from branch mappings
    const allMappings = await db.select().from(githubBranchMappings);
    const siteNames = [...new Set(allMappings.filter((m) => m.siteName).map((m) => m.siteName!))].sort();
    const allProductionSites = [...new Set(
      allMappings.filter((m) => m.environment === "production" && m.siteName).map((m) => m.siteName!),
    )].sort();

    // ── Fetch all deployments (last 30 days) ───────────────────────────
    let allDeployments = await db
      .select()
      .from(deployments)
      .where(gte(deployments.deployedAt, thirtyDaysAgo))
      .orderBy(desc(deployments.deployedAt));

    // Apply filters
    if (envFilter) allDeployments = allDeployments.filter((d) => d.environment === envFilter);
    if (repoFilter) allDeployments = allDeployments.filter((d) => repoMap.get(d.repoId)?.fullName === repoFilter);
    if (siteFilter) {
      // siteFilter is a label (e.g., "Tile Mountain") — match all site codes for that brand
      const matchingCodes = siteNames.filter((s) => getSiteLabel(s) === siteFilter);
      if (matchingCodes.length > 0) {
        const codeSet = new Set(matchingCodes);
        allDeployments = allDeployments.filter((d) => d.siteName && codeSet.has(d.siteName));
      } else {
        // Fallback: treat as raw site code
        allDeployments = allDeployments.filter((d) => d.siteName === siteFilter);
      }
    }
    if (boardFilter) allDeployments = allDeployments.filter((d) => d.jiraKey.startsWith(boardFilter + "-"));

    // ── Fetch issues for context ───────────────────────────────────────
    const deployedKeys = [...new Set(allDeployments.map((d) => d.jiraKey))];
    const deployedIssues = deployedKeys.length > 0
      ? await db
          .select({
            jiraKey: issues.jiraKey,
            title: issues.title,
            status: issues.status,
            jiraStatusName: issues.jiraStatusName,
            type: issues.type,
            brands: issues.brands,
            assigneeId: issues.assigneeId,
            boardId: issues.boardId,
            jiraUpdatedAt: issues.jiraUpdatedAt,
          })
          .from(issues)
          .where(inArray(issues.jiraKey, deployedKeys))
      : [];
    const issueMap = new Map(deployedIssues.map((i) => [i.jiraKey, i]));

    // ── Metrics ────────────────────────────────────────────────────────
    const deploymentsThisWeek = allDeployments.filter((d) => d.deployedAt >= weekStart).length;

    // Pending releases: staging but not production
    const stagingKeys = new Set<string>();
    const productionKeys = new Set<string>();
    for (const d of allDeployments) {
      const key = `${d.jiraKey}:${d.siteName || "_"}`;
      if (d.environment === "staging") stagingKeys.add(key);
      if (d.environment === "production" || d.environment === "canonical") productionKeys.add(key);
    }
    const pendingKeys = [...stagingKeys].filter((k) => !productionKeys.has(k));

    // Build per-issue production deployed sites map
    const issueDeployedSites = new Map<string, string[]>();
    for (const d of allDeployments) {
      if (d.environment !== "production" && d.environment !== "canonical") continue;
      if (!d.siteName) continue;
      const sites = issueDeployedSites.get(d.jiraKey) || [];
      if (!sites.includes(d.siteName)) sites.push(d.siteName);
      issueDeployedSites.set(d.jiraKey, sites);
    }

    // Status mismatches — intentionally NOT bounded by the 30-day `allDeployments`
    // window. A production-deployed task stuck in `in_progress` for 45 days is
    // MORE urgent, not less. We query production deployments unbounded and rank
    // by age. Closed-but-deployed is carved out as its own type because shipping
    // cancelled work is a distinct failure mode from "forgot to update JIRA".
    const EXPECTED_POST_DEPLOY = ["post_live_testing", "done"]; // `closed` handled separately
    const EARLY_STATUSES = ["backlog", "todo", "in_progress"];
    const ROLLOUT_STATUSES = ["rolling_out", "ready_for_live"];

    // All production/canonical deployments ever — for mismatch detection.
    // Index on (jiraKey, environment) keeps this fast; narrowed below by status.
    const allProdDeployments = await db
      .select()
      .from(deployments)
      .where(inArray(deployments.environment, ["production", "canonical"]))
      .orderBy(desc(deployments.deployedAt));

    // Build per-issue production-deployed-sites map from the unbounded set,
    // replacing the 30-day-scoped version for mismatch and completeness checks.
    const issueDeployedSitesUnbounded = new Map<string, string[]>();
    // Also track the OLDEST prod deploy per issue. That's the right anchor for
    // mismatch age: "how long has this been broken?" = age of the first deploy
    // that created the mismatch, not the most recent redeploy. Using newest
    // would make a stale issue look fresh every time it gets redeployed.
    const oldestProdByKey = new Map<string, typeof allProdDeployments[0]>();
    for (const d of allProdDeployments) {
      if (d.siteName) {
        const sites = issueDeployedSitesUnbounded.get(d.jiraKey) || [];
        if (!sites.includes(d.siteName)) sites.push(d.siteName);
        issueDeployedSitesUnbounded.set(d.jiraKey, sites);
      }
      const existing = oldestProdByKey.get(d.jiraKey);
      if (!existing || d.deployedAt.getTime() < existing.deployedAt.getTime()) {
        oldestProdByKey.set(d.jiraKey, d);
      }
    }

    // Load issue rows for the unbounded production deployments — superset of
    // `issueMap` which was keyed off 30-day deployments.
    const unboundedProdJiraKeys = [...new Set(allProdDeployments.map((d) => d.jiraKey))];
    const mismatchIssueRows = unboundedProdJiraKeys.length
      ? await db
          .select({
            jiraKey: issues.jiraKey,
            title: issues.title,
            status: issues.status,
            jiraStatusName: issues.jiraStatusName,
            type: issues.type,
            brands: issues.brands,
            assigneeId: issues.assigneeId,
            boardId: issues.boardId,
            jiraUpdatedAt: issues.jiraUpdatedAt,
          })
          .from(issues)
          .where(inArray(issues.jiraKey, unboundedProdJiraKeys))
      : [];
    const mismatchIssueMap = new Map(mismatchIssueRows.map((i) => [i.jiraKey, i]));

    const mismatchList: Mismatch[] = [];
    const seenMismatchPairs = new Set<string>(); // `${type}:${jiraKey}` — allows multiple types per key

    function ageSeverity(days: number): Mismatch["severity"] {
      if (days > 7) return "critical";
      if (days >= 3) return "warning";
      return "info";
    }

    function buildMismatch(
      d: typeof allProdDeployments[0],
      issue: typeof mismatchIssueRows[0],
      type: Mismatch["type"],
    ): Mismatch {
      const board = boardMap.get(issue.boardId);
      const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;
      const deployedSites = issueDeployedSitesUnbounded.get(d.jiraKey) || [];
      const expected = getExpectedSites(issue.brands, allProductionSites);
      const missing = expected ? expected.filter((s) => !deployedSites.includes(s)) : [];
      // Age reflects the ORIGINAL mismatch, not the most recent redeploy.
      const anchor = oldestProdByKey.get(d.jiraKey) || d;
      const days = daysBetween(anchor.deployedAt, now);

      return {
        jiraKey: d.jiraKey,
        title: issue.title,
        status: issue.status,
        jiraStatusName: issue.jiraStatusName,
        issueType: issue.type,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        environment: d.environment,
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        deployedAt: anchor.deployedAt.toISOString(),
        daysSinceDeployment: days,
        type,
        brands: issue.brands,
        deployedSites,
        expectedSites: expected,
        missingSites: missing,
        severity: type === "closed_but_deployed" ? "critical" : ageSeverity(days),
      };
    }

    function pushUnique(m: Mismatch) {
      const key = `${m.type}:${m.jiraKey}`;
      if (seenMismatchPairs.has(key)) return;
      seenMismatchPairs.add(key);
      mismatchList.push(m);
    }

    // Pass 1: Production deployed but status not post-deploy (excluding closed)
    for (const d of allProdDeployments) {
      const issue = mismatchIssueMap.get(d.jiraKey);
      if (!issue) continue;
      if (issue.status === "closed") continue; // handled by Pass 4
      if (EXPECTED_POST_DEPLOY.includes(issue.status)) continue;
      pushUnique(buildMismatch(d, issue, "production_not_updated"));
    }

    // Pass 4 (new): Shipped-cancelled-work — issue marked closed but production-deployed
    for (const d of allProdDeployments) {
      const issue = mismatchIssueMap.get(d.jiraKey);
      if (!issue || issue.status !== "closed") continue;
      pushUnique(buildMismatch(d, issue, "closed_but_deployed"));
    }

    // Pass 2: Staging deployed but status still early — scoped to the 30d window
    // on purpose: a 6-month-old staging branch is an archeology problem, not an
    // "update your status" nudge.
    for (const d of allDeployments) {
      if (d.environment !== "staging") continue;
      const issue = issueMap.get(d.jiraKey);
      if (!issue || !EARLY_STATUSES.includes(issue.status)) continue;
      pushUnique(buildMismatch(d as unknown as typeof allProdDeployments[0], issue as unknown as typeof mismatchIssueRows[0], "staging_status_behind"));
    }

    // Pass 3: Partial rollout — rolling_out/ready_for_live but not all expected sites
    for (const [jiraKey, issue] of mismatchIssueMap) {
      if (!ROLLOUT_STATUSES.includes(issue.status)) continue;
      const completeness = getDeploymentCompleteness(
        issue.brands,
        issueDeployedSitesUnbounded.get(jiraKey) || [],
        allProductionSites,
      );
      if (!completeness || completeness.complete) continue;
      if (completeness.deployed.length === 0) continue;

      // Use the OLDEST prod deploy as the mismatch anchor (O(1) via map —
      // no per-issue linear scan over unbounded history).
      const anchorDeploy = oldestProdByKey.get(jiraKey);
      const board = boardMap.get(issue.boardId);
      const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;
      const days = anchorDeploy ? daysBetween(anchorDeploy.deployedAt, now) : 0;

      pushUnique({
        jiraKey,
        title: issue.title,
        status: issue.status,
        jiraStatusName: issue.jiraStatusName,
        issueType: issue.type,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        environment: "production",
        siteName: null,
        siteLabel: null,
        deployedAt: anchorDeploy?.deployedAt.toISOString() || now.toISOString(),
        daysSinceDeployment: days,
        type: "partial_rollout",
        brands: issue.brands,
        deployedSites: completeness.deployed,
        expectedSites: completeness.expected,
        missingSites: completeness.missing,
        severity: ageSeverity(days),
      });
    }

    // Rank oldest first — a 45-day-old mismatch is more urgent than a 2-day-old.
    mismatchList.sort((a, b) => b.daysSinceDeployment - a.daysSinceDeployment);

    // Avg days in staging for pending releases
    const pendingDays: number[] = [];
    const pendingReleases: PendingRelease[] = [];
    const pendingDedup = new Map<string, PendingRelease>();

    for (const d of allDeployments) {
      if (d.environment !== "staging") continue;
      const dedupKey = `${d.jiraKey}:${d.siteName || "_"}`;
      if (productionKeys.has(dedupKey)) continue;
      if (pendingDedup.has(dedupKey)) continue;

      const issue = issueMap.get(d.jiraKey);
      const board = issue ? boardMap.get(issue.boardId) : null;
      const member = issue?.assigneeId ? memberMap.get(issue.assigneeId) : null;
      const dp = daysBetween(d.deployedAt, now);
      pendingDays.push(dp);

      const entry = {
        jiraKey: d.jiraKey,
        title: issue?.title || d.prTitle || "Unknown",
        issueType: issue?.type || null,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || d.jiraKey.split("-")[0],
        boardColor: board?.color || "#6b7280",
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        stagedAt: d.deployedAt.toISOString(),
        daysPending: dp,
      };
      pendingDedup.set(dedupKey, entry);
      pendingReleases.push(entry);
    }
    pendingReleases.sort((a, b) => b.daysPending - a.daysPending);

    const avgDaysInStaging = pendingDays.length > 0
      ? Math.round(pendingDays.reduce((s, d) => s + d, 0) / pendingDays.length)
      : 0;

    // ── Pipeline (tasks by deployment-related statuses) ────────────────
    const PIPELINE_STATUSES = ["ready_for_testing", "ready_for_live", "rolling_out", "post_live_testing"];
    let pipelineIssues = await db
      .select({
        jiraKey: issues.jiraKey,
        title: issues.title,
        status: issues.status,
        jiraStatusName: issues.jiraStatusName,
        type: issues.type,
        brands: issues.brands,
        assigneeId: issues.assigneeId,
        boardId: issues.boardId,
        jiraUpdatedAt: issues.jiraUpdatedAt,
      })
      .from(issues)
      .where(inArray(issues.status, PIPELINE_STATUSES));

    if (boardFilter) {
      pipelineIssues = pipelineIssues.filter((i) => {
        const board = boardMap.get(i.boardId);
        return board?.jiraKey === boardFilter;
      });
    }

    // Enrich pipeline tasks with deployment info
    const pipelineKeys = pipelineIssues.map((i) => i.jiraKey);
    const pipelineDeployments = pipelineKeys.length > 0
      ? await db
          .select({ jiraKey: deployments.jiraKey, environment: deployments.environment })
          .from(deployments)
          .where(inArray(deployments.jiraKey, pipelineKeys))
      : [];
    const deployStatusMap = new Map<string, "production" | "staging" | null>();
    for (const d of pipelineDeployments) {
      const current = deployStatusMap.get(d.jiraKey);
      if (d.environment === "production" || d.environment === "canonical") deployStatusMap.set(d.jiraKey, "production");
      else if (d.environment === "staging" && current !== "production") deployStatusMap.set(d.jiraKey, "staging");
    }

    // Per-pipeline-issue deployed sites (fetch from full deployment table, not the limited select above)
    const pipelineDeployedSites = new Map<string, string[]>();
    const pipelineProdSites = pipelineKeys.length > 0
      ? await db
          .select({ jiraKey: deployments.jiraKey, siteName: deployments.siteName })
          .from(deployments)
          .where(and(
            inArray(deployments.jiraKey, pipelineKeys),
            inArray(deployments.environment, ["production", "canonical"]),
          ))
      : [];
    for (const d of pipelineProdSites) {
      if (!d.siteName) continue;
      const sites = pipelineDeployedSites.get(d.jiraKey) || [];
      if (!sites.includes(d.siteName)) sites.push(d.siteName);
      pipelineDeployedSites.set(d.jiraKey, sites);
    }

    function buildPipelineTask(issue: typeof pipelineIssues[0]) {
      const board = boardMap.get(issue.boardId);
      const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;
      const updatedAt = issue.jiraUpdatedAt ? new Date(issue.jiraUpdatedAt) : now;
      const deployedSites = pipelineDeployedSites.get(issue.jiraKey) || [];
      const expected = getExpectedSites(issue.brands, allProductionSites);

      return {
        jiraKey: issue.jiraKey,
        title: issue.title,
        status: issue.status,
        jiraStatusName: issue.jiraStatusName,
        issueType: issue.type,
        assigneeName: member?.displayName || null,
        assigneeAvatar: member?.avatarUrl || null,
        boardKey: board?.jiraKey || "",
        boardColor: board?.color || "#6b7280",
        deploymentStatus: deployStatusMap.get(issue.jiraKey) || null,
        daysInStatus: daysBetween(updatedAt, now),
        brands: issue.brands,
        deployedSites,
        expectedSites: expected,
      };
    }

    const pipeline = {
      readyForTesting: pipelineIssues.filter((i) => i.status === "ready_for_testing").map(buildPipelineTask),
      readyForLive: pipelineIssues.filter((i) => i.status === "ready_for_live").map(buildPipelineTask),
      rollingOut: pipelineIssues.filter((i) => i.status === "rolling_out").map(buildPipelineTask),
      postLiveTesting: pipelineIssues.filter((i) => i.status === "post_live_testing").map(buildPipelineTask),
    };

    // ── Recent deployments (last 30 days, capped at 50) ────────────────
    const recentDeployments = allDeployments.slice(0, 50).map((d) => {
      const issue = issueMap.get(d.jiraKey);
      const repo = repoMap.get(d.repoId);
      const board = issue ? boardMap.get(issue.boardId) : null;
      const boardKey = board?.jiraKey || d.jiraKey.split("-")[0];
      const boardInfo = board || boardKeyMap.get(boardKey);

      return {
        id: d.id,
        jiraKey: d.jiraKey,
        issueTitle: issue?.title || d.prTitle || null,
        issueType: issue?.type || null,
        environment: d.environment,
        siteName: d.siteName,
        siteLabel: d.siteLabel,
        branch: d.branch,
        prUrl: d.prUrl,
        commitSha: d.commitSha,
        deployedBy: d.deployedBy,
        deployedAt: d.deployedAt.toISOString(),
        isHotfix: d.isHotfix || false,
        repoName: repo?.fullName || "",
        boardKey: boardInfo?.jiraKey || boardKey,
        boardColor: boardInfo?.color || "#6b7280",
      };
    });

    // ── Site overview ────────────────────────────────────────────────────
    // Sources the full list of known sites from branch mappings (NOT the 30-day
    // deployment feed), then looks up the latest staging + production deploy
    // for each one from the unbounded table. Sites that haven't shipped in
    // weeks still appear — just flagged as stale rather than hidden.
    //
    // `siteNames` was already built from githubBranchMappings earlier.
    const STALE_THRESHOLD_DAYS = 30;
    const labelToSites = new Map<string, string[]>();
    for (const code of siteNames) {
      const label = getSiteLabel(code);
      const existing = labelToSites.get(label) || [];
      if (!existing.includes(code)) existing.push(code);
      labelToSites.set(label, existing);
    }

    // Fetch all relevant deployments in ONE query, then partition in JS —
    // O(1) roundtrips instead of 2×N across all configured sites. Ordered
    // newest-first so the first match per (site, environment) is the latest.
    const allConfiguredCodes = [...new Set([...labelToSites.values()].flat())];
    const siteDeployRows = allConfiguredCodes.length
      ? await db
          .select({
            siteName: deployments.siteName,
            environment: deployments.environment,
            jiraKey: deployments.jiraKey,
            deployedAt: deployments.deployedAt,
            branch: deployments.branch,
          })
          .from(deployments)
          .where(
            and(
              inArray(deployments.environment, ["staging", "production"]),
              inArray(deployments.siteName, allConfiguredCodes),
            ),
          )
          .orderBy(desc(deployments.deployedAt))
      : [];

    // First-seen-per-(siteCode, environment) wins because of the ORDER BY.
    const latestByCodeEnv = new Map<string, (typeof siteDeployRows)[0]>();
    for (const d of siteDeployRows) {
      if (!d.siteName) continue;
      const key = `${d.siteName}:${d.environment}`;
      if (!latestByCodeEnv.has(key)) latestByCodeEnv.set(key, d);
    }

    const siteOverview: SiteStatus[] = [];
    for (const [label, codes] of [...labelToSites.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      // Pick the newest staging/production across the codes that share this label.
      const pickLatest = (env: "staging" | "production") => {
        let best: (typeof siteDeployRows)[0] | null = null;
        for (const code of codes) {
          const c = latestByCodeEnv.get(`${code}:${env}`);
          if (c && (!best || c.deployedAt.getTime() > best.deployedAt.getTime())) best = c;
        }
        return best;
      };
      const latestStaging = pickLatest("staging");
      const latestProd = pickLatest("production");

      const lastDeployCandidates = [latestStaging?.deployedAt, latestProd?.deployedAt].filter(
        (v): v is Date => v instanceof Date,
      );
      const lastDeployAt = lastDeployCandidates.length
        ? new Date(Math.max(...lastDeployCandidates.map((d) => d.getTime())))
        : null;
      const daysSinceLastDeploy = lastDeployAt ? daysBetween(lastDeployAt, now) : null;
      const isStale = daysSinceLastDeploy !== null && daysSinceLastDeploy > STALE_THRESHOLD_DAYS;

      siteOverview.push({
        siteName: codes[0],
        siteLabel: label,
        latestStaging: latestStaging ? {
          jiraKey: latestStaging.jiraKey,
          deployedAt: latestStaging.deployedAt.toISOString(),
          branch: latestStaging.branch,
        } : null,
        latestProduction: latestProd ? {
          jiraKey: latestProd.jiraKey,
          deployedAt: latestProd.deployedAt.toISOString(),
          branch: latestProd.branch,
        } : null,
        lastDeployAt: lastDeployAt?.toISOString() || null,
        daysSinceLastDeploy,
        isStale,
      });
    }

    return NextResponse.json({
      metrics: {
        deploymentsThisWeek,
        pendingReleases: pendingReleases.length,
        statusMismatches: mismatchList.length,
        avgDaysInStaging,
      },
      mismatches: mismatchList,
      pipeline,
      pendingReleases,
      recentDeployments,
      siteOverview,
      repos: allRepos.map((r) => ({ id: r.id, fullName: r.fullName })),
      sites: [...new Set(siteNames.map((s) => getSiteLabel(s)))].sort(),
      boards: allBoards.map((b) => ({ jiraKey: b.jiraKey, name: b.name, color: b.color })),
    });
  } catch (error) {
    console.error("Deployments API error:", sanitizeErrorText(error instanceof Error ? error.message : String(error)));
    return NextResponse.json(
      { error: "Failed to load deployment data" },
      { status: 500 },
    );
  }
}
