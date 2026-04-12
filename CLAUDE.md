# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

TeamFlow — a JIRA-integrated team management dashboard for Tile Mountain. Tracks ~14 frontend developers across multiple JIRA boards (Production + project boards named after animals/birds). Built for team leads to see what each dev is doing now, what's next, and whether workload is balanced.

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
yarn db:studio        # Open Drizzle Studio (database GUI)
yarn db:seed          # Seed database with mock data (tsx scripts/seed.ts)
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

**Route structure:**
- `(auth)/login` — Public login page (no sidebar)
- `(dashboard)/overview` — Team overview with developer cards
- `(dashboard)/calendar` — Monthly task calendar
- `(dashboard)/workload` — Capacity distribution
- `(dashboard)/members` — Team roster
- `(dashboard)/members/[id]` — Developer profile (active or departed)
- `(dashboard)/reports` — Analytics with 12 chart sections
- `(dashboard)/settings` — Admin-only JIRA config and preferences

Route groups `(auth)` and `(dashboard)` use separate layouts. Dashboard layout includes sidebar (280px dark navy) + topbar (64px).

**Database:** MySQL with Drizzle ORM. 7 tables: users, team_members, boards, issues, sync_logs, dashboard_config, notifications.

**Auth:** Auth.js v5 (NextAuth beta) with Google OAuth + Credentials providers. JWT session strategy. Two roles: `admin` (full access) and `user` (no Settings, no Add Member, no Sync Now).

**State management:** TanStack Query v5 for server state. No global client state library — use React hooks and URL search params for filters.

## Design System — Summit Logic

**No borders rule.** Layout boundaries use background color shifts, not 1px strokes. Cards sit on `#fbf9f8` surface with `#ffffff` card fill — contrast provides separation.

**Key colors:**
- Surface: `#fbf9f8` (base), `#f5f3f3` (sections/inputs), `#ffffff` (cards)
- Navy: `#1a1a2e` (sidebar, Sign In button, high-contrast text)
- Primary: `#ff8400` (brand orange), `#944a00` (dark variant for gradients)
- Use `outline-variant` at 15% opacity if a stroke is absolutely needed

**Typography:** JetBrains Mono for headings, KPI numbers, labels (UPPERCASE with letter-spacing). Inter for body text, descriptions, form inputs.

**Buttons:** Primary CTA uses gradient `#944a00 → #ff8400` at 135°. Sign In button uses flat navy `#1a1a2e` with UPPERCASE tracking-widest text. Secondary buttons use `surface-high` fill, no border.

**Popovers/dropdowns:** Glassmorphism — surface-card at 80% opacity + backdrop-blur(12px).

## Component Patterns

UI primitives in `src/components/ui/` use `@base-ui/react` headless components + `class-variance-authority` (cva) for variants + `cn()` utility from `src/lib/utils.ts` for class merging.

When building new components:
- Use existing shadcn/ui primitives as building blocks
- Follow the cva pattern for variant props
- Use design tokens from globals.css, not hardcoded colors
- Keep components as Server Components unless they need interactivity (onClick, useState, etc.)

## Critical Business Rules

- **Done vs Closed:** `done` = completed full dev lifecycle (dev → QA → deploy). `closed` = task cancelled. Velocity and performance metrics count ONLY `done` tasks. Track `closed` separately as "cancelled".
- **Task keys identify boards:** `PROD-5555` = Production, `BUTTERFLY-112` = Butterfly project. No separate project tags needed in UI.
- **Production board has no sprints.** It's continuous. Never apply sprint labels or On Track/At Risk badges to PROD tasks.
- **Role badge only in profile dropdown.** Never show Admin/User badge in sidebar.
- **Task aging alerts:** Notify when a task stays in `in_progress` for 3+ days (configurable).
- **NEVER delete team members or their data.** When a member leaves, update status to `departed` — never remove the record. All historical task data, performance history, and assignments must be preserved for reporting and audit.

## Team Member Sync (Atlassian Teams API)

Team members are **not manually managed** — they are auto-synced from the Atlassian Teams API. The "Frontend Team" on Atlassian is the single source of truth.

**How it works:**
- `JIRA_ORG_ID` and `JIRA_TEAM_IDS` (comma-separated) define which teams to sync
- Sync fetches member accountIds from Teams API, then resolves user details from JIRA REST API
- **In team = `active`**, **removed from team = `departed`** (left the organization)
- New members are auto-created, departed members have status updated (never deleted)
- `displayName`, `email`, `avatarUrl` are updated from JIRA on each sync
- Admin-managed fields (`capacity`, `role`, `color`) are never overwritten by sync
- Admin (Syed Haider Hassan) is excluded from sync — he is the dashboard admin, not a tracked member

**Sync triggers:**
- Daily cron at 06:00 UTC (Railway.app hobby plan — daily crons only)
- Manual "Sync Now" button in Settings (admin only)
- Protected by `SYNC_SECRET` for cron endpoint auth

**APIs used:**
- Teams API: `POST https://api.atlassian.com/gateway/api/public/teams/v1/org/{orgId}/teams/{teamId}/members`
- User details: `GET {NEXT_PUBLIC_JIRA_BASE_URL}/rest/api/3/user?accountId={id}`
- Auth: Same Basic Auth credentials as JIRA (`JIRA_USER_EMAIL:JIRA_API_TOKEN`)

## Environment Variables

Copy `.env.example` to `.env.local`. Required for full functionality:
- `DATABASE_URL` — Database connection string (e.g. mysql://...)
- `AUTH_SECRET` + `AUTH_URL` — Auth.js sessions
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Google OAuth
- `NEXT_PUBLIC_JIRA_BASE_URL` + `JIRA_USER_EMAIL` + `JIRA_API_TOKEN` — JIRA API access
- `JIRA_ORG_ID` — Atlassian organization ID (for Teams API)
- `JIRA_TEAM_IDS` — Comma-separated Atlassian team IDs to sync
- `SYNC_SECRET` — Secret for protecting cron/sync endpoints
