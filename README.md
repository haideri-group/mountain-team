[![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/haideri-group/mountain-team?utm_source=oss&utm_medium=github&utm_campaign=haideri-group%2Fmountain-team&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)

# TeamFlow

A JIRA-integrated team management dashboard for tracking frontend developers across multiple JIRA boards. Built for team leads who need real-time visibility into what each developer is working on, what's next in their queue, and whether workload is balanced across the team.

## Features

### Team Overview
- Developer cards showing current task, queue, and recent completions
- Team switcher for multi-team support
- Filterable by board, availability, task type, priority, and status
- Idle developer detection with visual indicators

### Developer Profiles
- Per-member stats: on-time delivery, cycle time, workload, deadlines met
- Current work, queued tasks, and in-review items
- Monthly completion trend chart
- Time tracking with daily activity breakdown (JIRA worklogs + Time Doctor)
- Full task history with search and filtering

### Issue Detail Pages
- Two-phase loading: instant DB data + live JIRA enrichment
- Full JIRA description (rendered HTML), threaded comments, changelog
- GitHub integration: branches, PRs, commits via JIRA dev-status API
- Deployment pipeline visualization (Staging / Production / Main)
- Time tracking with per-person worklog breakdown
- Per-issue sync button for on-demand refresh

### Reports & Analytics
- 12 interactive chart sections with contextual info guides
- Velocity trends, board distribution, task type breakdown
- Developer ranking with sortable columns and trend indicators
- Deadline compliance with drill-down to missed tasks
- Weekly pulse (created vs completed), turnaround distribution
- CMS vs Development split, board health dashboard
- Activity heatmap with click-to-drill per cell
- Team time tracking with JIRA + Time Doctor stacked visualization
- Pending releases tracker (staging but not yet in production)

### Time Tracking
- JIRA worklog sync via JQL-based batch fetching
- Time Doctor 2 integration (optional) for total tracked time
- Unified model: JIRA (issue time) + Other (non-issue time) = Total
- Stacked bar charts on profile and reports pages
- Daily, weekly, and monthly breakdowns

### Team Management
- Auto-sync from Atlassian Teams API (members never deleted, marked departed)
- Google Directory integration for email and avatar matching
- Cloudflare R2 avatar caching with hash-based change detection
- Admin-managed fields (capacity, role, color) preserved across syncs

### Issue Sync
- Full and incremental sync from JIRA REST API v3
- JQL filtering by team member assignment + configurable label
- Webhook receiver for real-time issue updates
- Dynamic status mapping (DB-driven, admin-configurable)
- Cycle time calculation with state machine (clear on reopen, compute on done)

### GitHub Deployment Tracking
- Track merged PRs across staging/production branches
- Multi-site deployment support with branch-to-environment mapping
- Backfill service for historical deployment data
- Pipeline visualization on issue detail pages

### Notifications
- Aging tasks, overdue alerts, capacity warnings
- Deployment notifications, completion alerts
- Role-scoped: admins see all, users see own tasks only
- Polling badge with real-time unread count

### Authentication & Authorization
- Google OAuth + Credentials (bcrypt) via Auth.js v5
- Two roles: admin (full access) and user (read-only)
- Super-admin protection (cannot be demoted or deactivated)
- Public read-only access to overview and issue detail pages

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16.2.2 (App Router, React Server Components) |
| Language | TypeScript 5.x (strict mode) |
| UI | React 19.2.4, Tailwind CSS v4, shadcn/ui (base-nova) |
| Charts | Recharts 3 |
| Database | MySQL with Drizzle ORM |
| Auth | Auth.js v5 (NextAuth beta) |
| Icons | Lucide React |
| Validation | Zod |
| Package Manager | Yarn 4.13.0 |

## Getting Started

### Prerequisites

- Node.js 20+
- MySQL 8.0+
- Yarn 4.x

### Installation

```bash
git clone https://github.com/haideri-group/mountain-team.git
cd mountain-team
yarn install
```

### Environment Setup

Copy the example environment file and configure your values:

```bash
cp .env.example .env.local
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `NEXTAUTH_SECRET` | Random secret for session encryption |
| `NEXTAUTH_URL` | Application base URL |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXT_PUBLIC_JIRA_BASE_URL` | Your JIRA Cloud instance URL |
| `JIRA_USER_EMAIL` | JIRA API authentication email |
| `JIRA_API_TOKEN` | JIRA API token |
| `JIRA_ORG_ID` | Atlassian organization ID |
| `JIRA_TEAM_IDS` | Comma-separated Atlassian team IDs |
| `JIRA_CLOUD_ID` | Atlassian Cloud site ID |
| `SYNC_SECRET` | Bearer token for cron and webhook auth |

Optional integrations:

| Variable | Description |
|----------|-------------|
| `JIRA_FRONTEND_LABEL` | JIRA label to filter team issues (default: "Frontend") |
| `GITHUB_TOKEN` | GitHub PAT for deployment tracking |
| `GITHUB_WEBHOOK_SECRET` | Shared secret for GitHub webhook verification |
| `CLOUDFLARE_R2_*` | R2 credentials for avatar caching (account ID, access key, secret, bucket, public URL) |
| `TIMEDOCTOR_EMAIL` | Time Doctor login email (optional) |
| `TIMEDOCTOR_PASSWORD` | Time Doctor login password (optional) |

### Database Setup

Push the schema to your MySQL database:

```bash
yarn db:push
```

Seed initial data (optional):

```bash
yarn db:seed
```

### Development

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

```bash
yarn dev              # Start dev server (Turbopack)
yarn build            # Production build
yarn start            # Start production server
yarn type-check       # TypeScript strict mode check
yarn lint             # ESLint
yarn lint:fix         # Auto-fix lint issues
yarn format           # Prettier format
yarn format:check     # Check formatting
yarn db:push          # Push Drizzle schema to MySQL
yarn db:studio        # Drizzle Studio (database GUI)
yarn db:seed          # Seed database
```

## Project Structure

```
src/
  app/
    (auth)/              # Login page (no sidebar)
    (dashboard)/         # Protected pages with sidebar layout
      overview/          # Team overview with dev cards
      members/           # Team roster + individual profiles
      calendar/          # Monthly task calendar
      workload/          # Capacity distribution
      reports/           # Analytics (12 chart sections)
      settings/          # Admin: sync, boards, status mappings
      users/             # Admin: user management
    api/                 # 45+ API routes
      team/              # Team member endpoints
      issues/            # Issue detail + JIRA live data
      sync/              # Manual sync triggers
      cron/              # Daily sync endpoints
      webhooks/          # JIRA + GitHub webhook receivers
      reports/           # Analytics computation
      notifications/     # Notification management
  components/
    ui/                  # shadcn/ui primitives
    layout/              # Sidebar, topbar, notifications
    overview/            # Dev cards, filters, metrics
    profile/             # Member profile sections
    issue/               # Issue detail components
    reports/             # 12 chart components + info guides
    settings/            # Admin configuration panels
    shared/              # Reusable: status badges, issue icons
  lib/
    db/                  # Drizzle schema + connection
    jira/                # JIRA API client, normalizer, issues
    sync/                # Sync engines (issues, team, worklogs, TD)
    timedoctor/          # Time Doctor 2 API client
    github/              # Deployment tracking
    google/              # Directory API integration
    r2/                  # Cloudflare R2 avatar caching
    notifications/       # Notification generator
    workload/            # Workload snapshots
```

## Database Schema

11+ tables managed by Drizzle ORM:

- `users` — Application users with roles and auth providers
- `team_members` — Developers synced from Atlassian Teams API
- `boards` — Tracked JIRA boards/projects
- `issues` — Synced JIRA issues with enriched metadata
- `worklogs` — JIRA worklog entries per developer
- `timedoctor_entries` — Time Doctor tracked time entries
- `deployments` — GitHub deployment records per issue
- `github_repos` — Tracked GitHub repositories
- `github_branch_mappings` — Branch-to-environment mappings
- `notifications` — System notifications with read status
- `sync_logs` — Audit trail for all sync operations
- `status_mappings` — Dynamic JIRA status-to-workflow mappings
- `workload_snapshots` — Weekly workload capacity records
- `dashboard_config` — Application settings

## Design System

TeamFlow uses the **Summit Logic** design system:

- **No borders** — layout separation through background color shifts
- **Typography** — JetBrains Mono for headings, data, and labels; Inter for body text
- **Color palette** — Navy sidebar, orange primary, gradient CTAs
- **Dark mode** — Full theme support via `next-themes`
- **Components** — Built on `@base-ui/react` headless primitives with `class-variance-authority`

## Sync Architecture

TeamFlow syncs data from multiple external sources:

| Source | Method | Frequency |
|--------|--------|-----------|
| JIRA Issues | REST API v3 (JQL search) | Daily cron + webhooks + manual |
| Team Members | Atlassian Teams API | Daily cron + manual |
| JIRA Worklogs | REST API v3 (worklog endpoint) | Daily cron + manual |
| Time Doctor | Time Doctor 2 API (JWT auth) | Daily cron + manual |
| GitHub Deployments | Webhook + backfill service | Real-time + manual |
| Google Directory | People API (directory search) | On team sync |

All syncs are idempotent with deduplication. Failed syncs are logged and don't affect existing data.

## Webhook Setup

### JIRA Webhook
Configure a webhook in JIRA pointing to `/api/webhooks/jira` with events: issue created, updated, deleted.

### GitHub Webhook
Configure a webhook on your GitHub repository pointing to `/api/webhooks/github` with events: pull request, deployment status. Set the secret to match your `GITHUB_WEBHOOK_SECRET` env var.

## Public vs Protected Pages

| Access Level | Pages |
|-------------|-------|
| Public (no login) | `/overview`, `/issue/[key]` |
| Authenticated | `/members`, `/calendar`, `/workload`, `/reports` |
| Admin only | `/settings`, `/users` |

## License

Private. All rights reserved.
