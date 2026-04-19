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
yarn db:push          # Push Drizzle schema to MySQL (local dev only — never prod)
yarn db:studio        # Drizzle Studio (database GUI)
yarn db:seed          # Seed database with hashed passwords (tsx scripts/seed.ts)
```

## Schema Changes (IMPORTANT)

Drizzle generates explicit column lists in every `SELECT` — it does *not* issue `SELECT *`. That means **adding a column to `src/lib/db/schema.ts` and deploying the code before the DB column exists breaks every route that queries that table**: MySQL returns `Unknown column 'newCol' in 'field list'`, the route 500s, and anything touching `team_members`, `issues`, etc. goes down at once.

Ordering rule: **the migration must land before (or at the same time as) the code deploy.** Not after.

For production schema changes, follow the existing `scripts/migrate-*.ts` pattern — idempotent, dry-run by default, `--apply` to execute:

```bash
yarn tsx scripts/migrate-<thing>.ts            # dry-run, prints SQL
yarn tsx scripts/migrate-<thing>.ts --apply    # execute
```

`DATABASE_URL` in `.env.local` points at Railway's production MySQL, so these scripts run directly against prod from a local machine. There is no separate staging DB. `yarn db:push` rewrites schema without an audit trail and can silently drop data — **never use it against Railway**, only local dev databases.

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
- `(dashboard)/overview` — Team overview with developer cards + team switcher
- `(dashboard)/calendar` — Monthly task calendar (placeholder)
- `(dashboard)/workload` — Capacity distribution (placeholder)
- `(dashboard)/members` — Team roster with server-side pagination
- `(dashboard)/members/[id]` — Developer profile (active or departed)
- `(dashboard)/reports` — Analytics with 12 chart sections (placeholder)
- `(dashboard)/users` — Admin-only: user listing, role management, account deactivation
- `(dashboard)/settings` — Admin-only: team sync, issue sync, board management

Route groups `(auth)` and `(dashboard)` use separate layouts. Dashboard layout includes sidebar (280px dark navy) + topbar (64px).

**Database:** MySQL (Railway) with Drizzle ORM. 11+ tables: users, team_members, boards, issues, sync_logs, dashboard_config, notifications, workload_snapshots, github_repos, github_branch_mappings, deployments.

**Auth:** Auth.js v5 (NextAuth beta) with Google OAuth + Credentials providers. JWT session strategy. Two roles: `admin` (full access) and `user` (read-only, no Settings/Sync/Users). Google OAuth stores access token in JWT for Google Directory API access. Per-request DB check ensures deactivated users lose access immediately and role changes take effect instantly. Super-admin (`syed.haider@ki5.co.uk`) cannot be deactivated or demoted. New Google sign-ins default to `user` role.

> **Note:** Two different fields are named `role`. `users.role` is the **auth role** above (`admin` | `user`). `team_members.role` is the **job title** (free-text, e.g. "Senior Frontend Developer"), sourced from Google Workspace Directory — it has no effect on permissions.

**State management:** Client-side `useState` + `fetch()` for data. No TanStack Query hooks yet — components fetch from API routes directly.

## Security

- **All API routes require authentication.** GET endpoints check `session?.user`, mutation endpoints (POST/PATCH/DELETE) check `session?.user?.role === "admin"`.
- **Error sanitization:** `sanitizeErrorText()` in `src/lib/jira/client.ts` redacts tokens from error messages before logging/throwing.
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
- `displayName`, `email`, `avatarUrl`, `role` (job title) are updated from JIRA/Google on each sync
- Admin-managed fields (`capacity`, `color`) are never overwritten by sync
- `joinedDate` is set to the sync date when a member is first inserted — it reflects **when TeamFlow first observed the member, not real team tenure**. Shown on the member profile header (`/members/[id]`) but deliberately omitted from the listing to avoid misleading "tenure" readings
- `on_leave` status is admin-managed, not affected by sync (unless member leaves the org)
- Admin (Syed Haider Hassan) is excluded from sync via `/rest/api/3/myself`
- Safety check: aborts if API returns 0 members but DB has active members

**Google Directory integration:**
- When admin is signed in with Google OAuth, sync also matches emails, avatars, and job titles from Google Workspace
- Uses Google People API `searchDirectoryPeople` with `directory.readonly` scope — `readMask` includes `organizations` to pull job title (prefers `current: true`)
- **Workspace is the source of truth for `team_members.role`.** Each sync overwrites role with the current Workspace title so Admin Console changes flow through. If Workspace has no title for a member, `role` is left unchanged (not blanked)
- Multi-strategy name matching (full name → first+last → first only) with scoring
- Inline email edit on Members page has autocomplete dropdown from Google Directory (300ms debounce, min 3 chars)
- When the editing admin is signed in via Google OAuth, editing a member's email also triggers a single-member directory lookup that refreshes `role` and avatar in the background; members table auto-refetches within 5s. **Credentials-only sessions have no Google token and silently skip this enrichment** — only the email itself is saved

**Sync triggers:**
- Daily cron at 06:00 UTC (`/api/cron/sync-teams`)
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
- Live progress tracking polled by UI every 1 second during sync

**JQL filtering:** Issues are synced if they match EITHER condition:
- Assigned to any active team member (by JIRA accountId), OR
- Have the "Frontend" label (configurable via `JIRA_FRONTEND_LABEL` env var)
This ensures all team member work is captured regardless of labels, plus any Frontend-labelled issues from other assignees.

**Sync types:**
- **Full:** All matching issues from tracked boards
- **Incremental:** Matching issues updated since last successful sync
- **Manual:** Triggered by admin via Settings UI (full sync or per-board)

**Sync triggers:**
- Daily cron at 06:05 UTC (`/api/cron/sync-issues`) — auto-detects full vs incremental
- Manual "Sync Issues" button in Settings (admin only)
- Per-board sync button on each tracked board card

**JIRA Webhook** (`/api/webhooks/jira`):
- Receives real-time issue created/updated/deleted events
- Accepts issues assigned to tracked team members OR with Frontend label
- Normalizes and upserts single issue per event
- Setup guide: `docs/JIRA_WEBHOOK_SETUP.md`

## GitHub Deployment Tracking (Phase 10.6 — in progress)

Tracks which JIRA tasks are deployed to staging/production across multiple sites.

**Architecture:** 3 DB tables (`github_repos`, `github_branch_mappings`, `deployments`) + GitHub webhook + backfill service.

**Tracked repos:**
- Frontend: `tilemountainuk/tile-mountain-sdk` — 6 live sites, 6 staging, shared `stage`, canonical `main`
- Backend: `tilemountainuk/tilemountain2` — 4 live sites, 4 staging, canonical `master`

**Branch → environment mapping:** Database-driven via `github_branch_mappings`. Configured per-repo in Settings.
- `isAllSites = true` expands single deployment into per-site records (e.g., `stage` → all staging sites)
- `skip:{siteName}` PR labels exclude specific sites from shared-branch deployments
- Hotfix branches (`hotfix/*`, `hotfix_*`) bypass staging, deploy directly to production

**Data sources:**
- GitHub webhook (`/api/webhooks/github`) — real-time on PR merge + deployment_status events
- Backfill service — scans last 90 days of merged PRs for historical deployments
- JIRA dev-status API (existing) — branches, PRs, commits per issue

**JIRA key detection:** Regex `/[A-Z]{2,}-\d+/gi` on branch names, PR titles, commit messages. Fallback: fetches commit messages from GitHub API.

**Pipeline visualization:** `deployment-pipeline.tsx` on issue detail page — Staging → Production → Main with per-site status.

**Remaining:** Proper Add Repo form UI, deployment notifications, pending releases report

## Cloudflare R2 Avatar Caching (Phase 10.7)

Caches team member avatars to R2 to avoid Google/Gravatar rate limits (429 errors with ~14 concurrent avatar loads).

**How it works:**
- Downloads avatars from source (Gravatar, Google, Atlassian) in 2 sizes: 96x96 (small) and 256x256 (large)
- Uploads to R2 bucket at `avatars/{memberId}/sm.{ext}` and `lg.{ext}`
- MD5 hash comparison (`team_members.avatarHash`) to skip re-uploads when unchanged
- Serves via CDN: `cdn-teamflow.appz.cc`
- Runs after team sync if R2 is configured; falls back to external URLs if not
- `scripts/cache-avatars.ts` for manual bulk caching

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

GET    /api/cron/sync-teams              → Daily team sync (SYNC_SECRET auth)
GET    /api/cron/sync-issues             → Daily issue sync (SYNC_SECRET auth)

POST   /api/webhooks/jira               → JIRA webhook receiver
POST   /api/webhooks/github             → GitHub webhook receiver (deployment tracking)

GET    /api/github/repos                → List tracked GitHub repos (admin only)
POST   /api/github/repos                → Add tracked repo (admin only)
PATCH  /api/github/repos/:id            → Update repo config (admin only)
DELETE /api/github/repos/:id            → Remove tracked repo (admin only)
POST   /api/github/repos/:id/backfill   → Backfill deployments from merged PRs (admin only)
GET    /api/webhooks/logs                → Recent webhook events (admin only)

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
- `/issue/[key]` — full issue detail with description, comments, GitHub data
- APIs: `GET /api/overview`, `GET /api/issues/*`, `GET /api/calendar`

**Protected (login required):**
- All other pages (Calendar, Members, Reports, Settings)
- All mutation endpoints (POST/PATCH/DELETE)
- Sync, notifications, search APIs

Guest users see no sidebar, no search/notifications/profile — just a "Sign In" button.

## Issue Detail Page (`/issue/[key]`)

Two-phase + GitHub loading:
1. **Phase 1 (instant):** DB data — issue fields, board/assignee context, cycle time percentile
2. **Phase 2 (background):** JIRA live — description (HTML), subtasks, attachments, linked issues, time tracking, worklogs
3. **Phase 3 (background):** GitHub — branches, PRs (via JIRA dev-status API), commits

**Comments:** Server-side paginated via `/api/issues/{key}/comments` (10 per page, sort asc/desc). Threaded display — replies detected by `@mention` at comment start, indented under parent. Comment deep links to JIRA via `focusedCommentId`.

**Issue Type Icons:** Exact JIRA SVGs (Bug=red insect, Story=green bookmark, Task=blue checkbox, Sub-task=blue puzzle, Epic=purple lightning). Shown next to issue keys across all pages.

**Time Tracking:** Progress bar when original estimate exists, text-only "Logged" when not. Per-person worklog breakdown from JIRA `/worklog` API.

**Date/Time:** Pakistan timezone (Asia/Karachi), 12h AM/PM. "Today at 4:38 PM" / "Yesterday at 11:00 AM" / "25 Mar 2026 at 4:38 PM".

## Implementation Status

1. ~~Project Scaffolding~~ (complete)
2. ~~Design System + Layout~~ (complete)
3. ~~Database Schema + MySQL~~ (complete)
4. ~~Auth System~~ (complete — Google OAuth + Credentials with bcrypt)
5. ~~Mock Data Layer~~ (complete — superseded by live JIRA sync)
6. ~~Dashboard Screens~~ — Overview + Profile + Calendar (complete)
7. ~~Management Screens~~ — Members + Settings + Workload (complete)
8. ~~Reports Page~~ (complete — 12 chart components with Recharts, interactive donut, heatmap slide-over, drill-downs)
9. ~~Interactive Features~~ (complete — Notifications, Profile dropdown, Global search Cmd+K, dynamic topbar)
10. ~~JIRA Issue Sync~~ (complete — assignee+label JQL, full/incremental + per-board + webhooks + progress)
10.5. ~~Team Member Sync~~ (complete — Atlassian Teams API + Google Directory)
- ~~Issue Detail Page~~ (`/issue/[key]`) — refactored into 5 components, three-phase + GitHub + deployment loading
- ~~Workload Dashboard~~ (`/workload`) — capacity bars, weighted formula, burnout detection, trend sparklines
10.6. **GitHub Deployment Tracking** (in progress — core infrastructure + Settings UI + pipeline built, notifications + pending releases remaining)
10.7. ~~Cloudflare R2 Avatar Caching~~ (complete — cache to cdn-teamflow.appz.cc, hash-based change detection)
11. **Polish + Deploy** — Error boundaries, loading skeletons, empty states, performance, Railway deployment
