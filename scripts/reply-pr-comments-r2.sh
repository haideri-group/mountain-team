#!/bin/bash
# Round-2 replies to PR #42 review comments.
set -euo pipefail
REPO="haideri-group/mountain-team"
PR=42
FIX_R2="b12807d"
FIX_STALE="d8e2949"
FIX_NOTES_DATE="83226e0"

reply() {
  local comment_id="$1"
  local body="$2"
  gh api -X POST "repos/$REPO/pulls/$PR/comments/$comment_id/replies" \
    -f body="$body" > /dev/null
  echo "replied to $comment_id"
}

# ── CodeAnt AI round-2 root comments (already have their own IDs) ─────
reply 3105425391 "@codeant-ai Respectfully pushing back on this one — canonical deploys don't have a \`siteName\` populated (see \`branch-resolver.ts\`: canonical mappings are \`isAllSites: false, siteName: null\`), so the site-overview WHERE clause (\`siteName IN (configured codes)\`) already excludes them. The site-overview concept is site-scoped by design; canonical represents the SDK main branch and isn't a \"site\" in that sense. The production-coverage rollup elsewhere (mismatches, release progress) DOES count canonical — that's the right surface. No change here."
reply 3105425809 "@codeant-ai Valid — fixed in \`$FIX_R2\`. Sanitized detail stays in server logs; the 500 response body is now a fixed \"Sync failed\" string. Even sanitized exception text can leak table names / SQL fragments / internal structure."
reply 3105426180 "@codeant-ai You're right — my previous fix was incomplete. Fixed in \`$FIX_R2\`: denominator is now the bucket sum \`done + inProgress + toDo\` unconditionally. It's the only value guaranteed internally consistent with the three numerators, so progress bars can't exceed 100%."
reply 3105426195 "@codeant-ai Already addressed in \`$FIX_STALE\` (pushed before this review). The gate now uses \`max(issues.jiraUpdatedAt)\` across the release's member issues plus the newest membership change. A release is flagged stale only when there are 3+ stuck-in-progress tasks AND no real activity in 24h."

# ── CodeRabbit round-2 root comments ──────────────────────────────────
reply 3105431091 "@coderabbitai Fixed in \`$FIX_R2\`. \`main()\` now wraps the work in \`try/finally\` so \`conn.end()\` runs even on failure, and the tail-catch logs only \`err.message\` instead of the raw object."
reply 3105431092 "@coderabbitai Good catch — real bug. Fixed in \`$FIX_R2\` at the source: \`buildReadinessIssueCounts\` (which both the sanity script and the real API path use) now folds \`other\` into \`toDo\` so unmapped statuses contribute to total rather than getting silently dropped. Sanity script updated to match. \"toDo\" is the conservative choice — doesn't artificially boost progress."
reply 3105431094 "@coderabbitai Real bug, fixed in \`$FIX_R2\`. Precomputed \`oldestProdByKey\` map (one pass over \`allProdDeployments\`). \`buildMismatch\` now uses the oldest prod deploy as the mismatch anchor — \"how long has this been broken\" = age of the first deploy that created the mismatch, not the most recent redeploy. The partial-rollout branch also reads from the map now instead of doing a per-issue linear scan over unbounded history."
reply 3105431095 "@coderabbitai Deferred — \`addedAt\` is \`NOT NULL\` at the schema level (\`timestamp defaultNow().notNull()\`), so legacy-data risk is minimal. I did add a defensive \`if (!m.addedAt) continue\` guard in the same commit \`$FIX_R2\` as cheap defense-in-depth."
reply 3105431100 "@coderabbitai Fixed in \`$FIX_R2\`. Denominator changed from \`activeReleases.length\` to \`releasesWithCreatedAt.length\` so the numerator and denominator now share the same population — no more deflation when some releases lack \`createdAt\`."
reply 3105431102 "@coderabbitai Acknowledged — release notification volume is admin-only and low (≤5 types × ~50 active releases at most). Client-side filter on a small payload is fine for v1. If we see the releases tab get heavy I'll move to server-side \`?types=release_*\`. Deferring."
reply 3105431103 "@coderabbitai Acknowledged — the \`set-state-in-effect\` is technically a violation, but \`load()\` itself is a useCallback-wrapped stable reference and the cascading render is harmless (the initial \`setLoading(true)\` is batched with the fetch kickoff). Happy to refactor if the lint rule starts flagging it; current lint run is clean on this file."
reply 3105431106 "@coderabbitai Already addressed in \`$FIX_NOTES_DATE\` (one commit before your latest review) — same concern I replied to on thread 3105324860. Short version: the guideline's \"Today at 4:38 PM\" relative phrasing is for activity timestamps; release notes are a dated changelog and the \`T12:00:00Z\` in a release date is a date-flip guard, not a real moment of day. What I DID change: \`timeZone: 'Asia/Karachi'\` + \`month: 'short'\` to match \`formatDateFull\`. Output is now \`25 Mar 2026\`, consistent with the rest of the app."
reply 3105431108 "@coderabbitai Valid — fixed in \`$FIX_R2\`. Internal notes now render JIRA keys as markdown links to \`\${NEXT_PUBLIC_JIRA_BASE_URL}/browse/{key}\` when the env var is set, falling back to bold plain text otherwise. Customer notes are unchanged (they strip JIRA keys on purpose per spec)."
reply 3105431109 "@coderabbitai Valid — fixed in \`$FIX_R2\`. The \`refreshReleasesForIssue\` warn-log now routes through \`sanitizeErrorText\` like the post-sync hooks do. The single-issue path doesn't log the error at all (just swallows — the comment explains why), so it's safe as-is."

echo
echo "All scripted replies posted."
