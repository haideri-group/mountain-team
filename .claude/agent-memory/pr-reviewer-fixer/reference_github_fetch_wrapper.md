---
name: githubFetch wrapper + shared rate-limit counter
description: Any GitHub API call in src/lib/github/** must go through githubFetch/githubFetchAll so the module-level lastRateLimit gets populated for the backfill circuit breaker. Raw fetch() is a recurring lint target.
type: reference
---

`src/lib/github/client.ts` exports `githubFetch<T>(path)`, `githubFetchAll<T>(path, maxPages)`, `getLastKnownRateLimit()`, and `getRateLimit()`.

Every GitHub API response passes through `captureRateLimitHeaders(res)` which updates a module-level `lastRateLimit` consumed by the deployment-backfill circuit breaker via `getLastKnownRateLimit()`. Raw `fetch("https://api.github.com/...")` silently bypasses this counter — CodeRabbit catches it (major severity) and it's a valid flag.

**Behaviour differences vs raw fetch:**
- `githubFetch` throws on non-2xx (after reading body into a sanitized error message). Callers that want "skip on failure" (like the Strategy 2/3 loops in `issue-deployment-sync.ts`) need `try { ... } catch { continue; }` — not `if (!res.ok) continue;`.
- `githubFetch` requires `GITHUB_TOKEN` (throws from `getAuthHeaders` if unset). Gate with `if (process.env.GITHUB_TOKEN)` if optional.
- Path can be relative (`/repos/...`) or absolute — the wrapper prefixes `https://api.github.com` when needed.

**JIRA-side fetches** (dev-status, comments) do NOT go through `githubFetch` — they use `getAuthHeader()`/`getBaseUrl()` from `@/lib/jira/client` with raw `fetch`. Don't try to migrate those.

Files that already use the wrapper correctly: webhook handler, backfill runner, deployment-propagation. Files historically using raw fetch (now fixed): `issue-deployment-sync.ts` (PR #50 daa4420).
