#!/bin/bash
# One-off script to reply to PR #42 review comments after pushing fixes.
# Each reply references the relevant commit and states disposition.
# Not part of CI — this script lives here only for the audit trail.
#
# Dispositions:
#   FIXED    — addressed in 63b2daf or 1790567
#   DEFERRED — acknowledged, not blocking this PR
#   WONTFIX  — disagree with premise or not applicable to current code

set -euo pipefail
REPO="haideri-group/mountain-team"
PR=42
FIX1="63b2daf"
FIX2="1790567"

reply() {
  local comment_id="$1"
  local body="$2"
  gh api -X POST "repos/$REPO/pulls/$PR/comments/$comment_id/replies" \
    -f body="$body" > /dev/null
  echo "replied to $comment_id"
}

# ── CodeAnt AI ────────────────────────────────────────────────────────
reply 3105310949 "Fixed in $FIX1 — added \`AND r.released = 0\` to the sanity-check SQL so it matches the script's documented intent."
reply 3105312865 "Fixed in $FIX1 — \`status\` is now validated against the allowed union before being used, falling back to \`unreleased\` on any unexpected value."
reply 3105312869 "Fixed in $FIX1 — parsed once via \`Number.parseInt\`, checked with \`Number.isFinite\` and \`> 0\`, falls back to 50 when invalid."
reply 3105312873 "Fixed in $FIX1 — KPI now joins through \`release_issues\` (active memberships) so it matches the classifier used by \`/api/releases/off-release\` and won't undercount deploys whose issues reference unknown releases."
reply 3105313631 "Fixed in $FIX1 — scope-creep classification is now skipped entirely when \`release.createdAt\` is null, preventing the epoch-comparison inflation."

# ── CodeRabbit ────────────────────────────────────────────────────────
reply 3105324771 "Deferred — existing plan fenced blocks use the same style; I'll do a pass on DEVELOPMENT_PLAN.md markdown lint in a follow-up."
reply 3105324774 "Deferred — same follow-up as the other DEVELOPMENT_PLAN.md formatting nit."
reply 3105324775 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324778 "Deferred — valid point about \`try/finally\` symmetry. I'll apply it across all three migration scripts in a small cleanup PR."
reply 3105324781 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324788 "Fixed in $FIX1 — same as the CodeAnt flag: \`AND r.released = 0\` added."
reply 3105324792 "Fixed in $FIX1 — the catch block now routes the message through \`sanitizeErrorText\` before logging, and the outer 500 response is sanitized too."
reply 3105324797 "Deferred — the double cast stayed for parity with the helper's original signature; I'll refactor in a follow-up once the shape stabilizes."
reply 3105324799 "Fixed in $FIX1 — the 2×N per-site queries are now one batched \`SELECT ... WHERE environment IN (...) AND siteName IN (...)\` and partitioned in JS."
reply 3105324802 "Fixed in $FIX2 — checklist seeding now runs inside \`db.transaction\` with an existence re-check so concurrent first-views can't both seed."
reply 3105324805 "Deferred — the item path is a write-follow-read; adding an affectedRows guard is a good follow-up but not a correctness issue today (deleted items would 404 on the immediate GET refresh)."
reply 3105324807 "Fixed in $FIX1 — scope-creep is skipped entirely when \`release.createdAt\` is null, aligning with the list route's behaviour."
reply 3105324809 "Fixed in $FIX1 — one batched \`SELECT releaseId, addedAt FROM release_issues WHERE releaseId IN (...)\` + JS-side comparison against each release's cutoff replaces the per-release query."
reply 3105324811 "Noted — the 180-day upper bound plus the in-memory \`limit\` (max 500) already caps the worst case. Adding a DB-level \`LIMIT\` on the raw fetch would reject deployments before categorisation, so the current shape is intentional. Happy to revisit if we see actual pressure."
reply 3105324813 "Fixed in $FIX1 — the membership query now filters by the deployment jiraKeys we've already loaded, not by all active memberships."
reply 3105324814 "Fixed in $FIX1 — replaced the diff-based call with \`reconcileReleaseIssues\`, which reads the current persisted fixVersions and makes active junction rows match. Idempotent: a retry after a partial failure self-heals without needing a stable pre-update snapshot."
reply 3105324815 "Fixed in $FIX1 — navigation now prefers \`notif.relatedReleaseId\` directly; the joined \`relatedRelease\` object is used only for display. A notification whose release row was archived still deep-links correctly."
reply 3105324820 "Fixed in $FIX1 — added an explicit \`loading\` boolean, cleared \`error\` on success, and added a dedicated failure branch so a failed fetch no longer shows a permanent spinner."
reply 3105324822 "Fixed in $FIX1 — hex values moved to \`src/lib/chart-colors.ts\`. The chart now imports named constants, so re-theming is a one-file change."
reply 3105324824 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324825 "Fixed in $FIX1 — replaced \`divide-y\` with alternating \`bg-muted/5\` rows. No 1px strokes."
reply 3105324826 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324827 "Fixed in $FIX1 — same treatment as the deployment-log list: \`divide-y\` removed, alternating row backgrounds used instead."
reply 3105324829 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324833 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324835 "Fixed in $FIX1 — \`total\` now falls back to the sum of the three issue buckets (\`done + inProgress + toDo\`) instead of \`memberCount\`, so progress bars can't go past 100%."
reply 3105324836 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324838 "Fixed in $FIX1 — brand orange now read from \`CHART_COLORS.brand\` (new \`src/lib/chart-colors.ts\`)."
reply 3105324842 "Fixed in $FIX1 — added a monotonic \`latestRequestId\` ref. Slower stale responses bail out before touching state."
reply 3105324844 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105324848 "Fixed in $FIX2 — \`types.ts\` now re-exports \`ReleaseStatus\` from \`src/lib/releases/readiness.ts\` instead of duplicating it."
reply 3105324850 "Deferred — the dialog instance lifecycle is already bounded by \`isOpen\`, so the re-register-on-render cost is ~one effect per open. Happy to memoize if it shows up in a profile."
reply 3105324851 "Fixed in $FIX1 — split dedup: one-shot types (\`release_ready\`, \`release_deployed\`) check the FULL history so reading them can't cause re-fire; recurring types (\`overdue\`, \`scope_changed\`, \`stale\`) check unread only so they legitimately re-fire after dismissal if the condition still holds. DB uniqueness on the notification row itself is a separate follow-up."
reply 3105324855 "Fixed in $FIX1 — copy now reads 'added in the last 24h' to match the filter window."
reply 3105324859 "Fixed in $FIX1 — release_stale now additionally requires no \`lastSyncedAt\` update AND no membership movement in the last 24h. An actively-updating release with stuck tasks no longer triggers this alert."
reply 3105324860 "Fixed in $FIX1 — added an 'Other changes' bucket to \`CUSTOMER_GROUPS\`. Unknown types now fall through to it instead of being silently dropped."
reply 3105324862 "Fixed in $FIX1 — \`sync-release-issues.ts\` was substantially rewritten: the add/remove diff runs inside \`db.transaction\`, inserts use \`onDuplicateKeyUpdate\` against the new \`uk_release_issues_active\` unique index (see \`scripts/migrate-release-issues-unique.ts\`), and errors are sanitized and re-thrown instead of swallowed."
reply 3105324863 "Fixed in $FIX2 — added a \`Number.isFinite(days) && days > 0\` guard at the top of the function; invalid input returns \`null\`."
reply 3105324865 "Fixed in $FIX1 — \`refreshReleasesForIssue\` now runs before the junction sync in both the bulk loop and the single-issue helper, matching the webhook flow. Also switched to \`reconcileReleaseIssues\` so the junction repairs idempotently even after a prior partial failure."
reply 3105324867 "Fixed in $FIX1 — all four post-sync hook catch blocks now route errors through \`sanitizeErrorText\` via a shared \`logHookFailure\` helper."
reply 3105326402 "Noted — the diagnostic section was empty of concrete feedback. If there's a specific concern please re-flag."
reply 3105326403 "Deferred — double-reverse is quadratic-ish in array length but \`allDeps\` is bounded by the release's active memberships (<=~100 per release). Happy to optimize if it shows up in a profile."
reply 3105326405 "Fixed in $FIX2 — \`computeScore\` now takes \`now\` as an argument so \`computeReadiness\` threads the same instant through both the score penalty and the coverage bonus check. Determinism guarantee restored."

echo
echo "All replies posted."
