# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

TeamFlow — a JIRA-integrated team management dashboard for Tile Mountain. Tracks frontend developers across multiple JIRA boards (Production + project boards named after animals/birds). Built for frontend team leads to see what each dev is doing now, what's next, and whether workload is balanced.

See `DEVELOPMENT_PLAN.md` for the full 11-phase implementation roadmap, database schema, API routes, and all 14 screen specifications.

## Commands

```bash
yarn dev              # Start dev server (Next.js 16.2.2 + Turbopack)
yarn build            # Production build
yarn type-check       # TypeScript strict mode check (run before committing)
yarn lint             # ESLint 9 with Next.js + TypeScript rules
yarn lint:fix         # Auto-fix lint issues
yarn format           # Prettier format src/**/*.{ts,tsx,css,json}
yarn format:check     # Check formatting without writing
yarn db:push          # Push Drizzle schema to MySQL
yarn db:studio        # Drizzle Studio (database GUI)
yarn db:seed          # Seed database with hashed passwords (tsx scripts/seed.ts)
```

## Next.js 16 Conventions (IMPORTANT)

This project uses **Next.js 16.2.2** which has breaking changes from earlier versions. Always read bundled docs at `node_modules/next/dist/docs/` before using unfamiliar APIs.

### Proxy (replaces Middleware)
- **`middleware.ts` is DEPRECATED.** The file convention is now `proxy.ts` with a named `proxy` export (or default export).
- Location: `src/proxy.ts` (same level as `app/`).
- Runtime: Node.js only (Edge runtime not supported for proxy).
- Config flags renamed: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.
- Proxy is for optimistic checks (redirects, header manipulation), NOT full session management. Always verify auth inside Server Functions and API routes too.

### Async Request APIs
All request-time APIs are **async** and must be awaited:
- `cookies()` → `await cookies()`
- `headers()` → `await headers()`
- `draftMode()` → `await draftMode()`
- `params` in layouts/pages/routes → `await params`
- `searchParams` in pages → `await searchParams`

### Fetch & Caching
- `fetch()` is **NOT cached by default** (changed from Next.js 14).
- `GET` route handlers are **NOT cached by default**.
- Use `cache: 'force-cache'` or `export const dynamic = 'force-static'` to opt in.
- `cacheComponents: true` enables the new `'use cache'` directive (replaces `experimental.dynamicIO`).

### Removed / Deprecated in 16
- AMP support removed entirely.
- `next lint` command removed (use ESLint directly).
- `serverRuntimeConfig` / `publicRuntimeConfig` removed (use env vars).
- `next/legacy/image` removed (use `next/image`).
- `images.domains` deprecated (use `images.remotePatterns`).

### Other Key Patterns
- Server Components are the default. Only add `'use client'` when needed (hooks, event handlers, browser APIs).
- Server Functions (`'use server'`): always verify auth/authorization inside each function.
- Parallel routes require explicit `default.js` files in every `@slot` folder.
- Use `revalidatePath()`, `revalidateTag()`, or `redirect()` after mutations in Server Functions.

## Architecture

**Framework:** Next.js 16.2.2 with App Router, React Server Components, React 19.2.4
**Deployment:** Railway.app (hobby plan — daily crons only)

**Route structure:**
- `(auth)/login` — Public login page (no sidebar)
- `(dashboard)/overview` — Team overview with developer cards + team switcher + deployment indicators
- `(dashboard)/calendar` — Monthly task calendar
- `(dashboard)/workload` — Capacity distribution dashboard with burnout detection
- `(dashboard)/members` — Team roster with server-side pagination
- `(dashboard)/members/[id]` — Developer profile with task history, date range filter, deployment indicators
- `(dashboard)/reports` — Analytics with 12 chart sections + pending releases
- `(dashboard)/users` — Admin-only: user listing, role management, account deactivation
- `(dashboard)/settings` — Admin-only: team sync, issue sync, board management, GitHub repos, status mappings

Route groups `(auth)` and `(dashboard)` use separate layouts. Dashboard layout includes sidebar (280px dark navy) + topbar (64px).

**Database:** MySQL (Railway) with Drizzle ORM. 11+ tables: users, team_members, boards, issues, sync_logs, dashboard_config, notifications, workload_snapshots, github_repos, github_branch_mappings, deployments.

**Auth:** Auth.js v5 (NextAuth beta) with Google OAuth + Credentials providers. JWT session strategy. Two roles: `admin` (full access) and `user` (read-only, no Settings/Sync/Users). Google OAuth stores access token in JWT for Google Directory API access. Per-request DB check ensures deactivated users lose access immediately and role changes take effect instantly. Super-admin (`syed.haider@ki5.co.uk`) cannot be deactivated or demoted. New Google sign-ins default to `user` role.

**State management:** Client-side `useState` + `fetch()` for data. No TanStack Query hooks yet — components fetch from API routes directly.

## Security

- **All API routes require authentication.** GET endpoints check `session?.user`, mutation endpoints (POST/PATCH/DELETE) check `session?.user?.role === "admin"`.
- **Error sanitization:** `sanitizeErrorText()` in `src/lib/jira/client.ts` redacts Basic/Bearer tokens and API keys from error messages before logging/throwing. Used in all sync catch blocks.
- **No hardcoded credentials.** The seed script uses bcrypt-hashed passwords. No fallback logins in code.
- **Cron endpoints** use `SYNC_SECRET` / `CRON_SECRET` bearer token auth.
- **Webhook endpoint** uses optional `x-webhook-secret` header verification.
- **`.env` / `.env.local` never committed** — verified in git history. `.gitignore` excludes them.

## Design System — Summit Logic

**No borders rule.** Layout boundaries use background color shifts, not 1px strokes. Cards sit on `#fbf9f8` surface with `#ffffff` card fill — contrast provides separation.

**Key colors:**
- Surface: `#fbf9f8` (base), `#f5f3f3` (sections/inputs), `#ffffff` (cards)
- Navy: `#1a1a2e` (sidebar, Sign In button, high-contrast text)
- Primary: `#ff8400` (brand orange), `#944a00` (dark variant for gradients)
- Use `outline-variant` at 15% opacity if a stroke is absolutely needed

**Typography:** JetBrains Mono for headings, KPI numbers, labels (UPPERCASE with letter-spacing). Inter for body text, descriptions, form inputs.

**Buttons:** Primary CTA uses gradient `#944a00 → #ff8400` at 135°. Sign In button uses flat navy `#1a1a2e` with UPPERCASE tracking-widest text. Secondary buttons use `surface-high` fill, no border.

**Popovers/dropdowns:** Use `bg-popover` with `ring-1 ring-foreground/10` and `shadow-lg`. Avoid native `<select>` dropdowns in dark mode — use custom styled dropdowns instead.

## Component Patterns

UI primitives in `src/components/ui/` use `@base-ui/react` headless components + `class-variance-authority` (cva) for variants + `cn()` utility from `src/lib/utils.ts` for class merging.

When building new components:
- Use existing shadcn/ui primitives as building blocks
- Follow the cva pattern for variant props
- Use design tokens from globals.css, not hardcoded colors
- Keep components as Server Components unless they need interactivity (onClick, useState, etc.)
- Use custom styled dropdowns instead of native `<select>` for dark mode compatibility

## Critical Business Rules

- **Done vs Closed:** `done` = completed full dev lifecycle (dev → QA → deploy). `closed` = task cancelled. Velocity and performance metrics count ONLY `done` tasks. Track `closed` separately as "cancelled".
- **Task keys identify boards:** `PROD-5555` = Production, `BUTTERFLY-112` = Butterfly project. No separate project tags needed in UI.
- **Production board has no sprints.** It's continuous. Never apply sprint labels or On Track/At Risk badges to PROD tasks.
- **Role badge only in profile dropdown.** Never show Admin/User badge in sidebar.
- **Task aging alerts:** Notify when a task stays in `in_progress` for 3+ days (configurable).
- **NEVER delete team members or their data.** When a member leaves, update status to `departed` — never remove the record. All historical task data, performance history, and assignments must be preserved for reporting and audit.
- **NEVER delete issues.** If a JIRA issue is deleted, the webhook marks it as `closed` (not removed from DB).
- **Clickable JIRA keys.** All issue keys (e.g., PROD-1143) must link to `{NEXT_PUBLIC_JIRA_BASE_URL}/browse/{key}` and open in a new tab. Use `e.stopPropagation()` on dev cards to prevent parent click.

## Team Member Sync (Atlassian Teams API)

Team members are **not manually managed** — they are auto-synced from the Atlassian Teams API. Multi-team support enabled.

**How it works:**
- `JIRA_ORG_ID` and `JIRA_TEAM_IDS` (comma-separated) define which teams to sync
- Sync fetches member accountIds from Teams API, then resolves user details from JIRA REST API
- Each member is tagged with their `teamId` and `teamName` from the Atlassian team
- **In team = `active`**, **removed from team = `departed`**, **rejoining = re-activated**
- New members are auto-created with auto-assigned colors from palette
- `displayName`, `email` are updated from JIRA on each sync
- **Avatar priority:** Google photos preferred over JIRA/Gravatar defaults. JIRA avatar only used when member has no avatar at all — existing R2 paths and Google photos are never overwritten by JIRA sync.
- **Google OAuth token auto-refresh:** JWT callback refreshes expired Google access tokens using the stored refresh token (tokens expire after 1 hour).
- Admin-managed fields (`capacity`, `role`, `color`) are never overwritten by sync
- `on_leave` status is admin-managed, not affected by sync (unless member leaves the org)
- Admin (Syed Haider Hassan) is excluded from sync via `/rest/api/3/myself`
- Safety check: aborts if API returns 0 members but DB has active members

**Google Directory integration:**
- When admin is signed in with Google OAuth, sync also matches emails + avatars from Google Workspace
- Uses Google People API `searchDirectoryPeople` with `directory.readonly` scope
- Multi-strategy name matching (full name → first+last → first only) with scoring
- Inline email edit on Members page has autocomplete dropdown from Google Directory (300ms debounce, min 3 chars)

**Sync triggers:**
- Daily cron at 01:00 UTC / 06:00 PKT (`/api/cron/sync-teams`) — via Cronicle (`cron.appz.cc`)
- Manual "Sync Now" button in Settings (admin only)

## JIRA Issue Sync

Issues are synced from JIRA into the `issues` table using JQL queries.

**How it works:**
- Uses `POST /rest/api/3/search/jql` (the old `/search` endpoint is deprecated)
- Token-based pagination with `nextPageToken` (not `startAt`), deduplication by key, max 50 pages safety
- Custom field IDs (story points, start date) discovered dynamically via `GET /rest/api/3/field`, cached 24h
- Status mapping: 25+ JIRA status names → 8 app statuses (`todo`, `in_progress`, `in_review`, `ready_for_testing`, `ready_for_live`, `on_hold`, `done`, `closed`), with `statusCategory.key` fallback. `on_hold` maps "On Hold", "Triage", "Awaiting Triage", "Pending", "Blocked".
- Upsert via MySQL `onDuplicateKeyUpdate` on `jiraKey` unique index
- Cycle time calculated on status transitions to `done`, cleared on reopening
- Issues from untracked boards are skipped (admin must add board in Settings first)
- Unassigned issues synced with `assigneeId = null`
- Stores `jiraCreatedAt` and `jiraUpdatedAt` from JIRA for accurate sorting
- `completedDate` fallback chain: `resolutiondate` → `statuscategorychangedate` → `updated` (fixes kanban boards where resolutiondate is null)
- `description` stored as rendered HTML from JIRA `renderedFields` (via `expand=renderedFields` on search). Phase 1 renders from DB cache; Phase 2 writes-through on live JIRA fetch.
- `website` and `brands` custom fields synced from JIRA (`customfield_10734`, `customfield_10805`)
- Live progress tracking polled by UI every 1 second during sync
- Sync progress persists across page navigation (mount-time active sync detection with 500ms delayed first poll to avoid race condition)

**JQL filtering:** Issues are synced if they match EITHER condition:
- Assigned to any active team member (by JIRA accountId), OR
- Have the "Frontend" label (configurable via `JIRA_FRONTEND_LABEL` env var)
This ensures all team member work is captured regardless of labels, plus any Frontend-labelled issues from other assignees.

**Sync types:**
- **Full:** All matching issues from tracked boards
- **Incremental:** Matching issues updated since last successful sync
- **Manual:** Triggered by admin via Settings UI (full sync or per-board)

**Sync triggers:**
- Daily cron at 01:05 UTC / 06:05 PKT (`/api/cron/sync-issues`) — via Cronicle, auto-detects full vs incremental
- Manual "Sync Issues" button in Settings (admin only, fire-and-forget POST)
- Per-board sync button on each tracked board card

**JIRA Webhook** (`/api/webhooks/jira`):
- Receives real-time issue created/updated/deleted events
- Accepts issues assigned to tracked team members OR with Frontend label
- Normalizes and upserts single issue per event
- Setup guide: `docs/JIRA_WEBHOOK_SETUP.md`

## GitHub Deployment Tracking (Phase 10.6)

Tracks which JIRA tasks are deployed to staging/production across multiple sites.

**Architecture:** 3 DB tables (`github_repos`, `github_branch_mappings`, `deployments`) + GitHub webhook + backfill service.

**Tracked repos:**
- Frontend: `tilemountainuk/tile-mountain-sdk` — 6 live sites, 6 staging, shared `stage`, canonical `main` (webhook active)
- Backend: `tilemountainuk/tilemountain2` — 4 live sites, 4 staging, canonical `master` (webhook not set)

**Branch → environment mapping:** Database-driven via `github_branch_mappings`. Configured per-repo in Settings with Add Repo form (Detect Branches + auto-classify + preset quick-fill).
- `isAllSites = true` expands single deployment into per-site records (e.g., `stage` → all staging sites)
- `skip:{siteName}` PR labels exclude specific sites from shared-branch deployments
- Hotfix branches (`hotfix/*`, `hotfix_*`) bypass staging, deploy directly to production

**Per-issue sync** (sync button on issue detail page) — Three-layer fallback:
1. **JIRA dev-status** (primary) — finds linked PRs from JIRA's GitHub integration. Repo name extracted from PR URL (not dev-status response which returns empty).
2. **GitHub search** (fallback) — searches `repo:owner/name is:pr is:merged JIRA-KEY`. Results validated with `extractJiraKeys()` to prevent false positives from full-text search.
3. **JIRA comments** (last resort) — scans comment ADF bodies for `github.com/owner/repo/pull/N` URLs. Handles cases where dev works on a different branch but posts PR link in comment.

**Commit propagation:** After recording a PR's direct deployment, checks if the commit exists on all other tracked branches using GitHub compare API. Finds real deploy date per branch by walking merge commit history. Uses `propagateDeploymentToOtherBranches()` shared helper. Cached compare results (`ghCompareCache`) to avoid duplicate API calls.

**Deployment recording:** Uses upsert pattern (not skip). Existing records updated with correct `deployedAt`/`deployedBy`/`branch` on re-sync. Two-tier dedup: commitSha (primary) → prNumber (fallback when SHA missing). Synthetic `pr-` prefixed SHAs normalized to null in pipeline output.

**Pipeline visualization:** `deployment-pipeline.tsx` in left column of issue detail page.
- Collapsible stage groups — collapsed when all sites deployed same day, expanded when dates differ
- Clickable dates → link to GitHub commit page (`/commit/{sha}`) or PR URL as fallback
- Clickable branch names → link to branch on GitHub (`/tree/{branch}`)
- Proper date formatting: "6 Mar 2026 at 2:13 PM" (PKT timezone via `APP_TIMEZONE` from `src/lib/config.ts`)

**Deployment indicators:** Green rocket (production) / amber server (staging) icons shown on:
- Overview dev cards (current, queued, recent done issues)
- Member profile: current work + task history table

**Backfill:** Scans last 90 days of merged PRs. Falls back to `extractKeysFromCommits()` when no JIRA keys in title/branch/body. Progress bar with polling in Settings UI.

**Notifications:** `generateDeploymentNotification()` called from GitHub webhook after `recordDeployment()`. Rocket icon + "Deployed" filter tab in notifications dropdown.

**Pending releases:** `GET /api/github/pending-releases` — tasks staged but not yet on production. Table component on Reports page with days-pending color coding.

## Cloudflare R2 Avatar Caching (Phase 10.7)

Caches team member avatars to R2 to avoid Google/Gravatar rate limits (429 errors with ~14 concurrent avatar loads).

**How it works:**
- Downloads avatars from source (Google preferred, Gravatar/Atlassian fallback) in 2 sizes: 96x96 (small) and 256x256 (large)
- Uploads to R2 bucket at `avatars/{memberId}/sm.{ext}` and `lg.{ext}`
- **Stores paths only** in DB (`avatars/tm_123/sm.png?v=123`), not full URLs. `resolveAvatarUrl()` in `src/lib/r2/client.ts` prepends `CLOUDFLARE_R2_PUBLIC_URL` at runtime. Changing CDN domain = one env var change, zero DB updates.
- MD5 hash comparison (`team_members.avatarHash`) to skip re-uploads when unchanged
- Serves via CDN: `cdn-teamflow.appz.cc` (TLS 1.3 disabled on Cloudflare to prevent QUIC protocol errors with R2 custom domains; `alt-svc: clear` transform rule also applied)
- `withResolvedAvatar()`/`withResolvedAvatars()` helpers in `src/lib/db/helpers.ts` applied to all API routes returning member data
- Runs after team sync if R2 is configured; falls back to external URLs if not
- `scripts/cache-avatars.ts` for manual bulk caching (uses `sourceAvatarUrl` as download source)

**Env vars:** `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`

## API Routes

All routes under `src/app/api/`. Auth required on every route.

```
GET    /api/team                         → Paginated members (search, status, team filters)
GET    /api/team/:id                     → Single member
PATCH  /api/team/:id                     → Update admin fields (admin only)
GET    /api/team/:id/profile             → Full profile with issues + stats

GET    /api/users                        → Paginated user list (admin only, search + role/status filters)
PATCH  /api/users/:id                   → Update role or isActive (admin only, super-admin protected)

GET    /api/boards                       → List boards
POST   /api/boards                       → Add board (admin only)
PATCH  /api/boards/:id                   → Update board (admin only)
DELETE /api/boards/:id                   → Remove board (admin only)

GET    /api/overview                     → Members + issues + metrics (public read)

GET    /api/issues/:key                  → Issue detail with context (public read)
GET    /api/issues/:key/jira             → Live JIRA data: description, comments, changelog, attachments, worklogs (public read)
GET    /api/issues/:key/github           → GitHub branches, PRs, commits via JIRA dev-status API (public read)
GET    /api/issues/:key/comments         → Paginated comments (page, pageSize, sort=desc|asc) (public read)
GET    /api/issues/:key/deployments      → Deployment pipeline for issue (public read)

GET    /api/calendar                     → Calendar events by month with filters
GET    /api/reports                      → All report metrics computed from live DB (public read)
GET    /api/workload                     → Workload metrics per member (public read, ?team= filter)
GET    /api/search?q=                    → Global search: members + issues (max 5 each)

GET    /api/notifications                → List notifications (last 30 days, type filter)
PATCH  /api/notifications                → Mark all as read
PATCH  /api/notifications/:id            → Mark single notification as read
GET    /api/notifications/count          → Unread count for badge (polled every 30s)

POST   /api/sync/team-members            → Manual team sync (admin only)
GET    /api/sync/team-members            → Last team sync status
POST   /api/sync/issues                  → Manual issue sync (admin only)
GET    /api/sync/issues                  → Last issue sync status + live progress
GET    /api/sync/issues?progress=1       → Live progress only (polled during sync)
POST   /api/sync/board?key=GOLC          → Sync single board (admin only)
POST   /api/issues/:key/sync             → Per-issue sync with deployment tracking

GET    /api/cron/sync-teams              → Daily team sync (SYNC_SECRET auth)
GET    /api/cron/sync-issues             → Daily issue sync (SYNC_SECRET auth)

POST   /api/webhooks/jira               → JIRA webhook receiver
POST   /api/webhooks/github             → GitHub webhook receiver (deployment tracking)

GET    /api/github/repos                → List tracked GitHub repos (admin only)
POST   /api/github/repos                → Add tracked repo (admin only)
PATCH  /api/github/repos/:id            → Update repo config (admin only)
DELETE /api/github/repos/:id            → Remove tracked repo (admin only)
POST   /api/github/repos/:id/backfill   → Backfill deployments from merged PRs (admin only)
GET    /api/github/repos/:id/backfill   → Backfill progress (polled during backfill)
GET    /api/github/repos/branches       → Fetch branches from GitHub (admin only)
GET    /api/github/pending-releases     → Tasks staged but not on production (auth required)
GET    /api/webhooks/logs                → Recent webhook events (admin only)

GET    /api/status-mappings              → List JIRA → workflow status mappings (admin only)
PATCH  /api/status-mappings              → Update a mapping's workflow stage (admin only)
POST   /api/status-mappings/apply        → Apply mapping to existing issues + clear Auto badge (admin only)

GET    /api/jira/projects                → Browse JIRA projects (admin only)
GET    /api/google/directory-search      → Google Workspace people search (admin only)

POST   /api/auth/[...nextauth]           → Auth.js handlers
```

## Environment Variables

Copy `.env.example` to `.env.local`. Required for full functionality:
- `DATABASE_URL` — MySQL connection string
- `AUTH_SECRET` + `AUTH_URL` — Auth.js sessions
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Google OAuth (with `directory.readonly` scope)
- `NEXT_PUBLIC_JIRA_BASE_URL` — JIRA site URL (used by both server and client)
- `JIRA_USER_EMAIL` + `JIRA_API_TOKEN` — JIRA API auth (Basic Auth)
- `JIRA_FRONTEND_LABEL` — Label to filter team issues (default: "Frontend")
- `JIRA_ORG_ID` — Atlassian organization ID
- `JIRA_TEAM_IDS` — Comma-separated Atlassian team IDs to sync
- `JIRA_CLOUD_ID` — Atlassian Cloud site ID
- `GITHUB_TOKEN` — GitHub PAT with repo read access (for deployment tracking)
- `GITHUB_WEBHOOK_SECRET` — Shared secret for GitHub webhook HMAC verification
- `CLOUDFLARE_R2_ACCOUNT_ID` + `CLOUDFLARE_R2_ACCESS_KEY_ID` + `CLOUDFLARE_R2_SECRET_ACCESS_KEY` — R2 storage auth
- `CLOUDFLARE_R2_BUCKET_NAME` — R2 bucket name (e.g., `teamflow-avatars`)
- `CLOUDFLARE_R2_PUBLIC_URL` — CDN URL for serving cached avatars (e.g., `https://cdn-teamflow.appz.cc`)
- `SYNC_SECRET` — Secret for cron and webhook endpoint auth

## Public vs Protected Pages

**Public (read-only, no login required):**
- `/overview` — team overview with developer cards
- `/issue/[key]` — full issue detail with description, comments, GitHub data, deployments
- `/workload` — capacity distribution dashboard
- APIs: `GET /api/overview`, `GET /api/issues/*`, `GET /api/calendar`, `GET /api/workload`, `GET /api/reports`

**Protected (login required):**
- All other pages (Calendar, Members, Reports, Settings)
- All mutation endpoints (POST/PATCH/DELETE)
- Sync, notifications, search APIs

Guest users see no sidebar, no search/notifications/profile — just a "Sign In" button.

## Issue Detail Page (`/issue/[key]`)

**Component architecture** — Split into 5 focused files:
- `issue-detail.tsx` — Orchestrator: data fetching, layout, header, left column (title, description, linked issues, deployments, subtasks)
- `issue-sidebar.tsx` — Right column: status, assignee, details, time tracking, GitHub, attachments
- `issue-activity.tsx` — Activity tabs: threaded comments, history, pagination
- `issue-types.ts` — All shared TypeScript interfaces
- `issue-helpers.ts` — Constants + date formatting utilities (imports `APP_TIMEZONE` from `src/lib/config.ts`)

**Four-phase loading:**
1. **Phase 1 (instant):** DB data — issue fields, description (cached HTML), board/assignee context, cycle time percentile
2. **Phase 2 (background):** JIRA live — description (HTML, writes-through to DB), subtasks, attachments, linked issues, time tracking, worklogs
3. **Phase 3 (background):** GitHub — branches, PRs (via JIRA dev-status API), commits
4. **Phase 4 (background):** Deployments — pipeline stages with per-site status

**Left column order:** Title → Description → Linked Issues → Deployments → Sub-tasks → Activity Tabs

**Per-issue sync button:** Phase-aware status messages ("Syncing from JIRA..." → "Refreshing page data..." → "Synced + 13 deployment(s)"). Fire-and-forget POST, blue during sync, green on success.

**Description:** Stored in DB as rendered HTML. Renders instantly from Phase 1 (no skeleton). Phase 2 writes-through if different. Styled with `@tailwindcss/typography` + `.jira-description` CSS (tables, code blocks, panels, mentions, images).

**Comments:** Server-side paginated via `/api/issues/{key}/comments` (10 per page, sort asc/desc). Threaded display — replies detected by `@mention` at comment start, indented under parent. Comment deep links to JIRA via `focusedCommentId`.

**Search:** JIRA URL detection — paste `https://tilemountain.atlassian.net/browse/PROD-5849` → extracts key → navigates directly. Also detects bare keys. Dropdown hint with "Open PROD-5849" + Enter. Issue type icons in search results. Recent searches (localStorage, max 5).

**Date/Time:** Pakistan timezone via `APP_TIMEZONE` in `src/lib/config.ts` (single source of truth). 12h AM/PM. "Today at 4:38 PM" / "Yesterday at 11:00 AM" / "25 Mar 2026 at 4:38 PM".

## Workload Dashboard (`/workload`)

**Weighted workload formula** (`calculateTaskWeight` in `src/lib/workload/snapshots.ts`):
- **Excluded types:** `WORKLOAD_EXCLUDED_TYPES` = `["story"]` — stories/epics are parent-level, return 0 weight
- Bug + P1 (Critical): 3.0 | Bug + P2 (Highest): 2.0 | Bug + P3 (High): 1.5
- WebContent label: 0.5 | All other tasks: 1.0 | Story points set: use story points
- **Single source of truth** — used by workload API, overview, profile, and notification capacity alerts
- **Capacity:** Default 15 per member (admin-adjustable)
- **Counted statuses:** `todo`, `in_progress`, `in_review`

## Cron Jobs

Managed via **Cronicle** at `cron.appz.cc`. No `vercel.json` — app is on Railway.

| Job | Schedule | Endpoint |
|-----|----------|----------|
| TeamFlow: Team Sync | 01:00 UTC (06:00 PKT) | `GET /api/cron/sync-teams` |
| TeamFlow: Issue Sync | 01:05 UTC (06:05 PKT) | `GET /api/cron/sync-issues` |

Both require `Authorization: Bearer {SYNC_SECRET}` header. Cronicle uses HTTP Request plugin (`urlplug`).

## Implementation Status

1. ~~Project Scaffolding~~ (complete)
2. ~~Design System + Layout~~ (complete)
3. ~~Database Schema + MySQL~~ (complete)
4. ~~Auth System~~ (complete — Google OAuth + Credentials with bcrypt, Google token auto-refresh)
5. ~~Mock Data Layer~~ (complete — superseded by live JIRA sync)
6. ~~Dashboard Screens~~ — Overview + Profile + Calendar (complete)
7. ~~Management Screens~~ — Members + Settings + Workload (complete)
8. ~~Reports Page~~ (complete — 12 chart components with Recharts, interactive donut, heatmap slide-over, drill-downs, pending releases)
9. ~~Interactive Features~~ (complete — Notifications with deployed type, Profile dropdown, Global search with JIRA URL detection + recent searches, dynamic topbar)
10. ~~JIRA Issue Sync~~ (complete — assignee+label JQL, full/incremental + per-board + webhooks + progress, description storage)
10.5. ~~Team Member Sync~~ (complete — Atlassian Teams API + Google Directory, Google photo preference)
- ~~Issue Detail Page~~ (`/issue/[key]`) — 5 components, four-phase loading, per-issue sync with deployment propagation, clickable deploy links
- ~~Workload Dashboard~~ (`/workload`) — capacity bars, weighted formula (story-excluded), burnout detection, trend sparklines
10.6. ~~GitHub Deployment Tracking~~ (complete — Settings UI, backfill progress, per-issue sync with 3-layer fallback, commit propagation, clickable pipeline, deployment indicators on profile)
10.7. ~~Cloudflare R2 Avatar Caching~~ (complete — R2 paths in DB, runtime URL resolution, cdn-teamflow.appz.cc, TLS 1.3 disabled for QUIC fix)
10.8. **Team Sync Progress Tracking** (planned — live progress bar for team sync)
10.9. ~~Users Management Page~~ (complete — role toggle, deactivation, super-admin, auth provider icons)
10.10. ~~Dynamic Status Management~~ (complete — DB-driven status mappings, Settings UI with Apply + Auto badge)
11. **Polish + Deploy** — Error boundaries, loading skeletons, empty states, performance
