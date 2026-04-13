import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { githubRepos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/github/client";
import { extractJiraKeys, extractKeysFromPR } from "@/lib/github/jira-keys";
import { recordDeployment } from "@/lib/github/deployments";
import { generateDeploymentNotification } from "@/lib/notifications/generator";

// POST /api/webhooks/github — Receives GitHub webhook events
export async function POST(request: Request) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = request.headers.get("x-github-event");

    // Resolve repo
    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no repository" });
    }

    const [repo] = await db
      .select()
      .from(githubRepos)
      .where(eq(githubRepos.fullName, repoFullName))
      .limit(1);

    if (!repo) {
      return NextResponse.json({ ok: true, skipped: true, reason: "repo not tracked" });
    }

    // --- Handle deployment_status event ---
    if (event === "deployment_status") {
      return handleDeploymentStatus(payload, repo);
    }

    // --- Handle pull_request event ---
    if (event === "pull_request") {
      return handlePullRequest(payload, repo);
    }

    // Ignore other events
    return NextResponse.json({ ok: true, skipped: true, reason: `unhandled event: ${event}` });
  } catch (error) {
    console.error("GitHub webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}

// --- deployment_status handler ---

async function handleDeploymentStatus(
  payload: any,
  repo: { id: string; fullName: string },
) {
  const status = payload.deployment_status?.state;
  if (status !== "success") {
    return NextResponse.json({ ok: true, skipped: true, reason: `deployment status: ${status}` });
  }

  const deployment = payload.deployment;
  if (!deployment) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no deployment object" });
  }

  const branch = deployment.ref || "";
  const commitSha = deployment.sha || null;
  const deployedBy = payload.deployment_status?.creator?.login || deployment.creator?.login || null;
  const githubDeploymentId = String(deployment.id);

  // Extract JIRA keys from deployment description + ref
  let jiraKeys = extractJiraKeys([deployment.description, branch]);

  // If no keys found, try fetching the commit message
  if (jiraKeys.length === 0 && commitSha) {
    try {
      const { extractKeysFromCommits } = await import("@/lib/github/jira-keys");
      jiraKeys = await extractKeysFromCommits(repo.fullName, commitSha);
    } catch { /* non-fatal */ }
  }

  if (jiraKeys.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no JIRA keys found" });
  }

  let totalRecorded = 0;
  let totalSkipped = 0;

  for (const jiraKey of jiraKeys) {
    const result = await recordDeployment({
      jiraKey,
      repoId: repo.id,
      branch,
      commitSha,
      deployedBy,
      githubDeploymentId,
      deployedAt: new Date(payload.deployment_status?.created_at || Date.now()),
    });
    totalRecorded += result.recorded;
    totalSkipped += result.skipped;

    // Generate deployment notification
    if (result.recorded > 0 && result.environment) {
      try {
        await generateDeploymentNotification(jiraKey, result.environment, result.siteName, result.siteLabel, deployedBy);
      } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json({
    ok: true,
    action: "deployment_recorded",
    keys: jiraKeys,
    recorded: totalRecorded,
    skipped: totalSkipped,
  });
}

// --- pull_request handler ---

async function handlePullRequest(
  payload: any,
  repo: { id: string; fullName: string },
) {
  // Only process merged PRs
  if (payload.action !== "closed" || !payload.pull_request?.merged) {
    return NextResponse.json({ ok: true, skipped: true, reason: "PR not merged" });
  }

  const pr = payload.pull_request;
  const targetBranch = pr.base?.ref || "";
  const sourceBranch = pr.head?.ref || "";
  const prTitle = pr.title || "";
  const prBody = pr.body || "";
  const prNumber = pr.number;
  const prUrl = pr.html_url;
  const mergedBy = pr.merged_by?.login || pr.user?.login || null;
  const commitSha = pr.merge_commit_sha || null;
  const mergedAt = new Date(pr.merged_at || Date.now());

  // Extract JIRA keys from PR title, source branch, body
  let jiraKeys = extractJiraKeys([prTitle, sourceBranch, prBody]);

  // Fallback: fetch commit messages
  if (jiraKeys.length === 0) {
    jiraKeys = await extractKeysFromPR({
      title: prTitle,
      head: { ref: sourceBranch },
      body: prBody,
      number: prNumber,
      base: { repo: { full_name: repo.fullName } },
    });
  }

  if (jiraKeys.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no JIRA keys found in PR" });
  }

  // Parse skip labels (for stage branch)
  const skipSites: string[] = [];
  if (payload.pull_request?.labels) {
    for (const label of payload.pull_request.labels) {
      if (label.name?.startsWith("skip:")) {
        skipSites.push(label.name.replace("skip:", ""));
      }
    }
  }

  let totalRecorded = 0;
  let totalSkipped = 0;

  for (const jiraKey of jiraKeys) {
    const result = await recordDeployment({
      jiraKey,
      repoId: repo.id,
      branch: targetBranch,
      prNumber,
      prTitle,
      prUrl,
      commitSha,
      deployedBy: mergedBy,
      deployedAt: mergedAt,
      skipSites,
    });
    totalRecorded += result.recorded;
    totalSkipped += result.skipped;

    // Generate deployment notification
    if (result.recorded > 0 && result.environment) {
      try {
        await generateDeploymentNotification(jiraKey, result.environment, result.siteName, result.siteLabel, mergedBy);
      } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json({
    ok: true,
    action: "pr_merge_recorded",
    keys: jiraKeys,
    targetBranch,
    recorded: totalRecorded,
    skipped: totalSkipped,
  });
}
