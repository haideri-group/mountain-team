# TeamFlow — Development Plan
### Tile Mountain | Frontend Team Management Dashboard

**Product:** TeamFlow
**Company:** Tile Mountain
**Repository:** https://github.com/haidertm/team-flow
**Last Updated:** April 10, 2026

---

## 1. Project Overview

TeamFlow is a real-time team management dashboard that syncs with JIRA to give frontend team leads instant visibility into:
- **What each developer is doing right now**
- **What they're working on next**
- **Whether workload is balanced across the team**
- **Historical performance and deadline compliance**

The tool manages ~14 frontend developers working across multiple JIRA boards — a continuous Production board (PROD-XXXX) and project boards named after animals/birds (Butterfly, Eagle, Dolphin, Falcon, etc.).

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, RSC) | 16.2.2 |
| UI Library | React | 19.x |
| Language | TypeScript (strict) | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui (base-nova) | Latest |
| State Management | TanStack Query | 5.x |
| Charts | Recharts | 3.x |
| Icons | Lucide React | Latest |
| Dates | date-fns | 4.x |
| Database | MySQL | Latest |
| ORM | Drizzle ORM | 0.38.x |
| Auth | Auth.js (NextAuth v5) | 5.x beta |
| Validation | Zod | 3.x |
| Package Manager | Yarn | 4.x |
| Deployment | Vercel | — |

---

## 3. Design System — Summit Logic

The visual language follows the "Summit Logic" design system created in Google Stitch.

### 3.1 Core Principles
- **No borders** — Layout boundaries established via background color shifts, not 1px strokes
- **Surface layering** — Depth through stacked tonal surfaces, not drop shadows
- **Gradient CTAs** — Primary action buttons use `#944a00 → #ff8400` gradient at 135 degrees
- **Glassmorphism** — Floating elements (popovers, dropdowns) use 80% opacity + backdrop blur
- **Technical editorial** — JetBrains Mono for headings/data (precision), Inter for body (readability)

### 3.2 Color Palette

| Token | Hex | Role |
|-------|-----|------|
| Surface (Base) | `#fbf9f8` | Page background |
| Surface Low | `#f5f3f3` | Section backgrounds, input fields |
| Surface High | `#eae8e7` | Hover states |
| Surface Card | `#ffffff` | Card backgrounds |
| Navy | `#1a1a2e` | Sidebar, Sign In button, high-contrast text |
| Primary | `#ff8400` | Brand orange, active states, CTA gradient end |
| Primary Dark | `#944a00` | CTA gradient start, primary hover |
| On Primary | `#ffffff` | Text on primary backgrounds |
| On Surface | `#1b1c1c` | Primary text |
| On Surface Variant | `#574335` | Secondary text |
| Muted | `#8b7262` | Tertiary text, placeholders |
| Outline | `#dec1af` | Ghost borders (15% opacity only) |
| Error | `#ba1a1a` | Destructive actions, errors |
| Error Container | `#ffdad6` | Error backgrounds |
| Success | `#166534` | Positive indicators |
| Success Light | `#dcfce7` | Success backgrounds |
| Warning | `#804200` | Warning text |
| Warning Light | `#ffdcc6` | Warning backgrounds |
| Tertiary | `#b8006c` | Alerts, accents |
| Secondary | `#5d5c74` | Muted interactive elements |

### 3.3 Typography

| Use | Font | Weight | Notes |
|-----|------|--------|-------|
| Page titles | JetBrains Mono | 700 (Bold) | 20-30px |
| Section headings | JetBrains Mono | 600-700 | 14-18px |
| KPI numbers | JetBrains Mono | 700-800 | 24-48px, tracking tight |
| Labels/Tags | JetBrains Mono | 600-700 | 10-12px, UPPERCASE, letter-spacing |
| Body text | Inter | 400-500 | 13-15px |
| Descriptions | Inter | 400 | 11-13px |
| Form inputs | Inter | 400 | 13-14px |

### 3.4 Component Styling

| Component | Style |
|-----------|-------|
| Primary Button | Gradient fill (#944a00 → #ff8400), rounded-lg, no border, shadow |
| Secondary Button | surface-high fill, no border |
| Sign In Button | Navy (#1a1a2e) fill, UPPERCASE text, tracking-widest, shadow-xl |
| Input Fields | surface-low fill, transparent border, rounded-lg, focus: primary border |
| Cards | surface-card fill on surface background, no border, no shadow |
| Sidebar | Navy (#1a1a2e) fill, 280px width, no border (contrast separation) |
| Popovers/Dropdowns | surface-card at 80% opacity + backdrop-blur(12px) |
| Status Chips | Small, JetBrains Mono, surface-on-surface tonal styling |

---

## 4. Screens (14 total)

### 4.1 Authentication
| # | Screen | Description |
|---|--------|-------------|
| 1 | **Login Page** | Split layout — dark navy left (Tile Mountain branding + features) + white right (Google OAuth + email/password form) |

### 4.2 Dashboard (Admin + User views)
| # | Screen | Description |
|---|--------|-------------|
| 2 | **Team Overview (Admin)** | Metrics strip + filter bar + 3-column dev card grid with NOW/QUEUE/DONE pattern |
| 3 | **Team Overview (User)** | Same content, no Settings nav, no Sync Now, no Add Member |
| 4 | **Developer Profile (Active)** | Stats strip + monthly completion chart + current work + task history table |
| 5 | **Developer Profile (Departed)** | Red departed banner + dimmed profile + preserved task history |
| 6 | **Calendar View** | Monthly task bars spanning days, color-coded by board, task popover on click |

### 4.3 Management
| # | Screen | Description |
|---|--------|-------------|
| 7 | **Members Management** | Roster table with Active/On Leave/Departed statuses + metrics |
| 8 | **Add Member Panel** | Slide-over: JIRA username verify + form fields + status toggle |
| 9 | **Workload Page** | Horizontal capacity bars per developer + alerts + summary stats |

### 4.4 Analytics
| # | Screen | Description |
|---|--------|-------------|
| 10 | **Reports Page** | 8 chart sections: velocity, distribution, heatmap, pulse, turnaround, CMS split, compliance, ranking |

### 4.5 Settings (Admin Only)
| # | Screen | Description |
|---|--------|-------------|
| 11 | **Settings Page** | JIRA connection + sync config + tracked boards + preferences |
| 12 | **Add Board Panel** | Slide-over: available JIRA boards with Track/Already Tracked states |

### 4.6 Interactive Overlays
| # | Screen | Description |
|---|--------|-------------|
| 13 | **Profile Dropdown** | Avatar menu: mini profile + role badge + My Profile + Settings (admin) + Open JIRA + Sign Out |
| 14 | **Notifications Dropdown** | Task aging (3+ days), overdue, capacity alerts with tabs + mark all read |

---

## 5. Database Schema

Using Drizzle ORM with MySQL.

### 5.1 Tables

```
users
├── id: text (cuid, PK)
├── email: text (unique)
├── name: text
├── hashedPassword: text (nullable — for credentials auth)
├── role: text ('admin' | 'user')
├── avatarUrl: text
└── createdAt: integer (unix timestamp)

team_members
├── id: text (cuid, PK)
├── jiraAccountId: text (unique)
├── displayName: text
├── email: text
├── role: text (job title, e.g., "Senior Frontend Developer")
├── status: text ('active' | 'on_leave' | 'departed')
├── joinedDate: text (ISO date)
├── departedDate: text (nullable)
├── capacity: integer (default 10 story points)
├── avatarUrl: text
├── color: text (hex)
├── createdAt: integer
└── updatedAt: integer

boards
├── id: text (cuid, PK)
├── jiraKey: text (unique, e.g., "PROD", "BUTTERFLY")
├── name: text (e.g., "Production Board", "Social Logins")
├── color: text (hex)
├── description: text
├── isTracked: integer (boolean)
└── createdAt: integer

issues
├── id: text (cuid, PK)
├── jiraKey: text (unique, e.g., "PROD-5547", "BUTTERFLY-112")
├── boardId: text (FK → boards.id)
├── assigneeId: text (FK → team_members.id)
├── title: text
├── status: text ('todo' | 'in_progress' | 'in_review' | 'ready_for_testing' | 'ready_for_live' | 'done' | 'closed')
├── priority: text ('highest' | 'high' | 'medium' | 'low' | 'lowest')
├── type: text ('bug' | 'story' | 'cms_change' | 'enhancement' | 'task')
├── startDate: text (ISO date)
├── dueDate: text (ISO date)
├── completedDate: text (nullable)
├── cycleTime: real (days, nullable)
├── storyPoints: real
├── labels: text (JSON array)
├── createdAt: integer
└── updatedAt: integer

sync_logs
├── id: text (cuid, PK)
├── type: text ('full' | 'incremental' | 'manual')
├── status: text ('running' | 'completed' | 'failed')
├── startedAt: integer
├── completedAt: integer (nullable)
├── issueCount: integer
├── error: text (nullable)
└── createdAt: integer

dashboard_config (singleton)
├── id: text (default 'default')
├── jiraBaseUrl: text
├── jiraEmail: text
├── syncInterval: integer (minutes, default 5)
├── defaultView: text (default 'overview')
├── overdueNotifications: integer (boolean, default 1)
├── taskAgingAlerts: integer (boolean, default 1)
├── taskAgingDays: integer (default 3)
├── theme: text ('light' | 'dark' | 'system')
├── createdAt: integer
└── updatedAt: integer

notifications
├── id: text (cuid, PK)
├── type: text ('aging' | 'overdue' | 'capacity' | 'completed' | 'unblocked')
├── title: text
├── message: text
├── relatedIssueId: text (FK → issues.id, nullable)
├── relatedMemberId: text (FK → team_members.id, nullable)
├── isRead: integer (boolean, default 0)
└── createdAt: integer
```

### 5.2 Critical Business Rules
- **Done vs Closed:** `done` = full development lifecycle completed (dev → QA → deploy). `closed` = task cancelled, no work done. Velocity and performance metrics count ONLY `done` tasks.
- **Frontend label:** JIRA tasks with "Frontend" label are tracked. This filters team-level velocity.
- **Task aging:** Notifications generated when a task stays in `in_progress` for more than `taskAgingDays` (default 3).

---

## 6. Role System

| Capability | Admin | User |
|-----------|-------|------|
| View all dashboard pages | Yes | Yes |
| View Settings page | Yes | No |
| Add/remove team members | Yes | No |
| Sync Now (manual JIRA sync) | Yes | No |
| Add/remove tracked boards | Yes | No |
| View Reports & Analytics | Yes | Yes |
| Role badge location | Profile dropdown only | Profile dropdown only |

Role is stored in `users.role` and exposed via Auth.js session. Sidebar dynamically hides SYSTEM section for users. Settings page checks role server-side.

---

## 7. JIRA Integration

### 7.1 Authentication
- Basic Auth: base64(email + ":" + API token)
- Server-side only — token never exposed to client

### 7.2 Sync Types
| Type | Frequency | Description |
|------|-----------|-------------|
| Full | Daily (configurable) | Re-sync all issues from all tracked boards |
| Incremental | Every 5 min (configurable) | Fetch issues updated since last sync |
| Manual | On demand (admin only) | Triggered via "Sync Now" button |

### 7.3 Key JQL Queries
```
# Frontend team issues (all)
project = {boardKey} AND labels = "Frontend" ORDER BY updated DESC

# Issues updated since last sync
project = {boardKey} AND labels = "Frontend" AND updated >= "{lastSyncDate}" ORDER BY updated DESC

# Overdue issues
project IN ({trackedBoards}) AND labels = "Frontend" AND duedate < now() AND status NOT IN (Done, Closed) ORDER BY duedate ASC

# Blocked issues
project IN ({trackedBoards}) AND labels = "Frontend" AND status = "Blocked" ORDER BY updated DESC
```

### 7.4 Data Flow
1. Sync engine checks lock (prevent concurrent runs)
2. Creates `sync_logs` entry with status "running"
3. Fetches issues from each tracked board via JQL
4. Normalizes JIRA responses → app `Issue` type
5. Upserts into `issues` table
6. Detects status changes → generates notifications
7. Updates `sync_logs` with completed status + counts

### 7.5 Board Structure
| Board | Key | Type | Has Sprints |
|-------|-----|------|-------------|
| Production | PROD | Continuous | No |
| Butterfly (Social Logins) | BUTTERFLY | Project | Yes |
| Eagle (E-commerce) | EAGLE | Project | Yes |
| Dolphin (Customer Portal) | DOLPHIN | Project | Yes |
| Falcon (Performance) | FALCON | Project | Yes |

### 7.6 Custom Fields
- **Expected Deployment Date:** Custom datepicker field being added to JIRA (pending)
- **Story Points:** `customfield_10016` (standard)
- **Start Date:** `customfield_10015`

---

## 8. API Routes

All routes under `src/app/api/`. Auth required unless noted.

```
GET    /api/team                    → List team members
POST   /api/team                    → Add member (admin only)
GET    /api/team/:id                → Get member details + stats
PATCH  /api/team/:id                → Update member (admin only)

GET    /api/issues                  → List issues (filters: board, assignee, status, priority, dateRange)
GET    /api/issues/:id              → Get single issue

GET    /api/boards                  → List tracked boards
POST   /api/boards                  → Add board to tracking (admin only)
DELETE /api/boards/:id              → Remove board (admin only)

GET    /api/sync                    → Get sync status + last sync info
POST   /api/sync                    → Trigger manual sync (admin only)
GET    /api/sync/logs               → Sync history

GET    /api/config                  → Get dashboard config
PATCH  /api/config                  → Update config (admin only)

GET    /api/notifications           → List notifications (filters: type, isRead)
PATCH  /api/notifications/:id       → Mark notification read
PATCH  /api/notifications/read-all  → Mark all read

GET    /api/jira/verify-user        → Verify JIRA username exists
GET    /api/jira/boards             → List available JIRA boards

GET    /api/reports/velocity        → Team velocity data
GET    /api/reports/distribution    → Board/type distribution
GET    /api/reports/performance     → Developer ranking
GET    /api/reports/heatmap         → Developer activity heatmap
GET    /api/reports/turnaround      → Task turnaround histogram
GET    /api/reports/pulse           → Weekly created vs completed
```

---

## 9. Implementation Phases

### Phase 1: Project Scaffolding
**Duration:** 0.5 days | **Complexity:** Medium

- Create `mountain-team/` directory with fresh Next.js 16.2.2 project
- Install all dependencies (see Tech Stack section)
- Configure TypeScript strict mode, Tailwind v4, ESLint, Prettier
- Set up shadcn/ui with base-nova style, install 12 UI components
- Create `.env.example` with all required environment variables
- Initialize Git repository

**Deliverable:** Running Next.js app at `mountain-team/`, all tooling configured
**Verify:** `yarn dev` starts, `yarn type-check` passes, `yarn lint` passes

### Phase 2: Design System + Layout
**Duration:** 2-3 days | **Complexity:** Large

- Implement Summit Logic design tokens in `globals.css`
- Configure JetBrains Mono + Inter fonts
- Build sidebar component (280px, dark navy, TEAMFLOW logo, nav sections)
- Build topbar component (page title, theme toggle, bell + badge, avatar)
- Create `(auth)` layout (no sidebar) and `(dashboard)` layout (sidebar + topbar)
- Set up all route placeholders: overview, calendar, workload, members, members/[id], reports, settings
- Implement theme toggle (light/dark/system) with localStorage persistence
- Create TanStack Query provider

**Deliverable:** Complete app shell with working navigation across all routes
**Verify:** All routes render, sidebar highlights active route, theme toggle works, fonts correct

### Phase 3: Database Schema + MySQL
**Duration:** 1-2 days | **Complexity:** Medium

- Set up MySQL database
- Define Drizzle schema for all 7 tables
- Configure Drizzle Kit for migrations
- Create seed script with realistic data (14 developers, 60 issues, 5 boards, notifications)
- Test CRUD operations through Drizzle Studio

**Deliverable:** Populated database with complete seed data
**Verify:** `npx drizzle-kit push` succeeds, `npx tsx scripts/seed.ts` populates, Drizzle Studio shows data

### Phase 4: Auth System
**Duration:** 2-3 days | **Complexity:** Large

- Configure Auth.js v5 with Google OAuth + Credentials providers
- Build Login page (Screen 1) matching Summit Logic design
- Implement middleware to protect dashboard routes
- Add role-based access (admin/user) via JWT session
- Conditionally render Settings nav + admin-only features
- Build sign-out flow

**Deliverable:** Complete auth flow — login, session, role-based access, sign out
**Verify:** Login works, admin sees Settings, user doesn't, middleware redirects unauthenticated

### Phase 5: Mock Data Layer
**Duration:** 1-2 days | **Complexity:** Medium

- Define all TypeScript interfaces in `src/types/`
- Create comprehensive mock data matching design specs
- Mock data includes: 14 team members, 60 issues, 5 boards, 6 notifications, report chart data
- Ensure data is structured identically to future API responses for seamless swap

**Deliverable:** Complete mock data layer importable by any component
**Verify:** TypeScript compiles, data matches DESIGN_BLUEPRINT.md specifications

### Phase 6: Dashboard Screens
**Duration:** 5-7 days | **Complexity:** Extra Large

**6A: Team Overview (Screens 2+3)**
- 4 metric cards (Team Members, Active Issues, In Progress, Overdue Tasks)
- Filter bar (Boards, Availability, Task Type, Priority, Status + Clear all + Sync Now)
- Developer card grid (3 columns) with NOW/QUEUE/DONE(7d) pattern
- Idle developer card + empty placeholder slots
- Workload footer with color-coded progress bars

**6B: Developer Profile (Screens 4+5)**
- Profile header with avatar, name, status badge, JIRA chip
- Stats strip (5 KPIs with dividers)
- Monthly completion chart (Recharts, stacked by board color)
- Performance snapshot panel (this month, avg, best, board split)
- Current Work section (NOW + NEXT tasks with status badges)
- Task history table (sortable, filterable, paginated, missed deadlines highlighted)
- Departed variant with red banner, 70% opacity

**6C: Calendar View (Screen 6)**
- Monthly grid with Mon-Sun columns
- Task bars spanning days, color-coded by board
- Current week highlight, today bold
- Task popover on click (task details + JIRA link)

**Deliverable:** 3 major screen types fully rendering with mock data
**Verify:** Cards show correct NOW/QUEUE/DONE, charts render, calendar has bars, table sorts/filters

### Phase 7: Management Screens
**Duration:** 3-4 days | **Complexity:** Large

**7A: Members Management (Screens 7+8)**
- Members table (avatar, name, email, role, status badge, JIRA ID, joined, tasks, on-time %)
- Status styling: Active (green), On Leave (orange + warm bg), Departed (gray + 50% opacity)
- Add Member slide-over panel with JIRA username verify + form

**7B: Workload Page (Screen 9)**
- Horizontal bar chart per developer (assigned + completed bars, capacity line)
- Alert cards (over-capacity red, idle orange)
- Summary stats (Team Avg, Over Capacity count, Under 50%, Idle)

**7C: Settings Page (Screens 11+12)**
- JIRA Connection section (URL, token, email, connection status, test + save)
- Sync Configuration (interval, last sync, tracked board tags)
- Preferences (default view, overdue notifications toggle, task aging toggle)
- Add Board slide-over (available boards with Track button, already tracked with checkmark)
- Admin-only access enforcement

**Deliverable:** All management + settings screens
**Verify:** Slide-overs animate, workload bars sorted, Settings admin-only

### Phase 8: Reports Page
**Duration:** 4-5 days | **Complexity:** Extra Large

Build 12 chart/visualization components using Recharts:
1. Tasks Completed Over Time (weekly bar chart)
2. Board Distribution (donut chart)
3. Task Type Breakdown (horizontal progress bars)
4. Deadline Compliance (met vs missed + breakdown)
5. Developer Performance Ranking (sortable table with trends)
6. Board Health (table with blocked/overdue counts)
7. Weekly Team Pulse (paired bar chart + insight banner)
8. Task Turnaround Time (histogram)
9. CMS vs Development (stacked bars)
10. Developer Activity Heatmap (grid with color-coded cells + annotations)
11. Team Velocity (monthly done tasks with trend)
12. Controls (date range picker, board/member filters, Export CSV, Generate PDF)

**Deliverable:** Complete analytics page with all visualizations
**Verify:** All charts render, responsive, heatmap shows annotations/tooltips

### Phase 9: Interactive Features
**Duration:** 3-4 days | **Complexity:** Large

- Profile Dropdown (Screen 13): avatar menu, role badge, My Profile, Settings (admin), Open JIRA, Sign Out
- Notifications Dropdown (Screen 14): 6 notification types, tabs (All/Aging/Overdue/Capacity), mark read
- Glassmorphism styling for all floating elements
- URL-synced filter state across all pages
- Global search across members + issues

**Deliverable:** All interactive overlays and state management
**Verify:** Dropdowns positioned correctly, notifications filter by tab, filters persist in URL

### Phase 10: JIRA Integration
**Duration:** 5-7 days | **Complexity:** Extra Large

- JIRA REST API v3 client (Basic Auth, pagination, rate limiting, retries)
- JQL query builders for each use case
- Data normalizer (raw JIRA → app types)
- Sync engine (full/incremental/manual with lock + logging)
- Notification generator (detect aging, overdue, capacity from sync results)
- All API route handlers replacing mock data with real DB queries
- TanStack Query hooks pointed at API routes

**Deliverable:** Live JIRA data flowing through the entire app
**Verify:** Manual sync works, data appears on dashboard, incremental sync detects changes

### Phase 10.5: Team Member Sync (Atlassian Teams API)
**Duration:** 2-3 days | **Complexity:** Medium

Team members are no longer manually managed. They are auto-synced from the Atlassian Teams API.

**Environment config:**
- `JIRA_ORG_ID` — Atlassian organization ID
- `JIRA_TEAM_IDS` — Comma-separated team IDs to sync (supports multiple teams)

**Sync algorithm:**
- Fetch member accountIds from all configured Atlassian teams (POST to Teams API)
- Resolve user details (displayName, email, avatar) from JIRA REST API
- Filter out admin (Syed Haider Hassan, accountId `5ed6037a88deed0c1803d33d`)
- Compare with existing DB members by `jiraAccountId`:
  - **New** (in team, not in DB) → INSERT with status `active`
  - **Gone** (in DB as active, not in team) → UPDATE status to `departed`, set departedDate
  - **Still present** → Update displayName/email/avatar, keep admin-managed fields (capacity, role, color)
- **NEVER delete member records** — departed members preserve all historical task data
- Log sync to `sync_logs` table

**Files to create:**
- `src/lib/jira/atlassian-teams.ts` — Teams API client (pagination, auth)
- `src/lib/sync/team-sync.ts` — Sync engine (diff algorithm, DB operations)
- `src/app/api/cron/sync-teams/route.ts` — Vercel cron endpoint (daily 06:00 UTC)
- `src/app/api/sync/team-members/route.ts` — Manual sync API (admin trigger + status)
- `src/components/settings/team-sync-manager.tsx` — Settings UI for sync controls
- `vercel.json` — Cron job configuration

**UI changes:**
- Remove Add Member form and delete button from Members page
- Remove manual status toggle (status is sync-managed)
- Add "Sync from JIRA" button (admin only) to Members page
- Add Team Sync Manager section to Settings page

**Deliverable:** Real team members auto-imported from Atlassian, daily cron keeps data fresh
**Verify:** Sync imports 14 members, departed members preserved, cron endpoint secured, admin excluded

---

### Phase 10.6: GitHub Deployment Tracking
**Duration:** 5-7 days | **Complexity:** Extra Large

Track which JIRA tasks are deployed to staging and production environments by monitoring GitHub branch merges. Uses JIRA dev-status API (already connected) as primary data source + GitHub webhooks for real-time updates.

**Data sources (3 layers, most accurate → most real-time):**
1. **GitHub Deployments API** — The CI/CD workflow (`build-and-deploy.yml`) already creates GitHub Deployment objects via `chrnorm/deployment-action@v2` with environment=`production`/`stage`, commit SHA, and success/failure status. This is the most accurate source — it confirms the code was actually built and deployed, not just merged.
2. **JIRA dev-status API** (`/rest/dev-status/latest/issue/detail`) — returns branches, PRs (with merge targets), and commits per issue. Already connected via "GitHub for Jira" app. Gives us PR merge destinations (e.g., `PROD-5612` merged to `stage-tilemtn`, `main-tilemtn`).
3. **GitHub Webhooks** — real-time `deployment_status` events when deployments succeed/fail + `pull_request` events when PRs are merged. Eliminates polling.

**CI/CD Architecture (Vue Storefront Cloud):**
- Matrix-based deployment: `.github/workflows/matrix/{branch}_deploy.json` defines which clients to deploy
- `main-*` / `stage-*` branches extract client name from suffix (e.g., `main-tilemtn` → client `tilemtn`)
- `stage` branch deploys ALL clients unless `skip:{client}` labels on the PR
- Docker images built per client, deployed to Vue Storefront Cloud (GCP europe-west1)
- Environment URLs: `https://{client}-{instance}.europe-west1.gcp.storefrontcloud.io`

**JIRA key detection pattern:**
Developers use varied branch naming: `fix/PROD-5123`, `PROD-5123`, `PROD-5123_v1`, `fix_PROD-5123_v2`, `prod-5123`. Regex: `/[A-Z]{2,}-\d+/gi` applied to branch names, PR titles, and commit messages.

**Tracked Repositories:**

**1. Frontend — `tilemountainuk/tile-mountain-sdk`** (Nuxt 3 / Vue Storefront 2)

| Site | Live Branch | Staging Branch | Client Key |
|------|-------------|----------------|------------|
| tilemountain.co.uk | `main-tilemtn` | `stage-tilemtn` | `tilemtn` |
| bathroommountain.co.uk | `main-bathmtn` | `stage-bathmtn` | `bathmtn` |
| wallsandfloors.co.uk | `main-wallsandfloors` | `stage-wallsandfloors` | `wallsandfloors` |
| tilemountain.ae | `main-tilemtnae` | `stage-tilemtnae` | `tilemtnae` |
| trade.wallsandfloors.co.uk | `main-waftrd` | `stage-waftrd` | `waftrd` |
| splendourtiles.co.uk | `main-splendourtiles` | `stage-splendourtiles` | `splendourtiles` |
| All staging (shared) | — | `stage` | all |
| Sync/canonical | `main` | — | — |

- `stage` branch deploys to all staging sites unless PR has `skip:{client}` label
- CI/CD: Vue Storefront Cloud (Docker → GCP europe-west1) via `build-and-deploy.yml`
- CI already creates GitHub Deployment objects with `chrnorm/deployment-action@v2`
- Branch flow: `{JIRA-KEY}` → `stage`/`stage-*` → `main-*` → `main`

**2. Backend — `tilemountainuk/tilemountain2`** (Magento 2)

| Site | Live Branch | Staging Branch | Client Key |
|------|-------------|----------------|------------|
| tilemountain.co.uk | `master-tm` | `stage-tm` | `tm` |
| bathroommountain.co.uk | `master-bm` | `stage-bm` | `bm` |
| wallsandfloors.co.uk + trade | `master-waf` | `stage-waf` | `waf` |
| tilemountain.ae | `master-tmdubai` | `stage-tmdubai` | `tmdubai` |
| Sync/canonical | `master` | — | — |

- Uses `master-*` (not `main-*`) for production branches
- Release branches: `release/release_*` created from `master` via workflow dispatch
- Branch flow: `feature/*` → `release/release_*` → `stage-*` → `master-*` → `master`
- Hotfix flow: `hotfix/*` → directly to `master-*` (bypasses staging)
- Branch policy enforced via `branch-flow-policy.yml`

**JIRA Custom Fields for Deployment Scope:**
- `customfield_10734` = **"Website"** (single select): `All Websites`, `www.tilemountain.co.uk`, `bathroommountain.co.uk`, `www.wallsandfloors.co.uk`, `trade.wallsandfloors.co.uk`, `www.tilemountain.ae`, `splendourtiles.co.uk`
- `customfield_10805` = **"Brands"** (multi-select): `All Brands`, `Tile Mountain`, `Bathroom Mountain`, `Walls and Floors`
- Used for notification logic: "All Websites" → notify per site deploy, specific site → notify once

**JIRA key matching (comprehensive):**
- Extract from: PR title + source branch name + all commit messages in the PR
- Regex: `/[A-Z]{2,}-\d+/gi`
- Developers use varied formats: `fix/PROD-5123`, `PROD-5123`, `PROD-5123_v1`, `prod-5123`
- Keys not always in PR title — must scan commits as fallback

**Note:** `main`/`master` is the final sync branch merged ~24h after live with no issues.

**Database tables to create:**

```sql
-- Tracked GitHub repositories
github_repos (
  id, owner, repo, displayName, defaultBranch,
  githubWebhookSecret, isActive, createdAt
)

-- Branch-to-environment mapping
github_branch_envs (
  id, repoId, branchPattern, environmentType (staging|production|canonical),
  siteName, siteUrl, createdAt
)

-- Deployment status per issue per branch (populated from JIRA dev-status + GitHub webhooks)
issue_deployments (
  id, issueId, jiraKey, repoId, branchName,
  environmentType, siteName, prNumber, prUrl,
  mergedAt, mergedBy, commitSha, createdAt
)
```

**Architecture:**

1. **Settings UI: Add GitHub Repo (SlideOver panel)**
   - **Manual entry:** Input field for `owner/repo` (or paste full GitHub URL — extract owner/repo)
   - **"Detect Branches" button:** Fetches all branches from GitHub API (`GET /repos/{owner}/{repo}/branches`), displays as a list
   - **Branch mapping table:** For each detected branch, user assigns:
     - Environment: dropdown (Staging / Production / Canonical / Skip)
     - Site Name: text input (e.g., `tilemtn`)
     - Site Label: text input (e.g., `Tile Mountain`)
     - Default all to "Skip" — user explicitly opts in per branch
   - **Preset quick-fill buttons:** "Frontend (tile-mountain-sdk)" and "Backend (tilemountain2)" auto-populate known branch mappings. User can still edit/add/remove rows after applying preset.
   - **"Is All Sites" checkbox:** For branches like `stage` that deploy to all staging sites
   - **Save:** Creates repo + all branch mappings in one transaction
   - Validation: verify repo exists on GitHub before saving

2. **Settings UI: GitHub Repos Manager (main view)**
   - Card per tracked repo showing: owner/repo, webhook status badge, branch mapping count, last backfill date
   - Expand card to see branch mappings grouped by staging/production/canonical
   - Actions per repo: Edit mappings, Backfill (with progress), Delete
   - "Add Repo" button opens the SlideOver panel

3. **Backfill with Live Progress**
   - Backfill runs as a background process with in-memory progress state (same pattern as `src/lib/sync/issue-sync.ts`)
   - Progress phases: `idle` → `fetching_prs` → `processing` → `done` / `failed`
   - Progress data: `{ phase, message, prsFetched, prsProcessed, prsTotal, deploymentsCreated }`
   - UI polls `GET /api/github/repos/{id}/backfill?progress=1` every 1 second during backfill
   - Shows progress bar with "Processing PR 24 of 87..." message
   - Result summary: "Backfill complete: 142 deployments recorded from 87 PRs"

4. **GitHub Webhook Endpoint** (`/api/webhooks/github`)
   - Listen for `deployment_status` events (the CI already creates these via `chrnorm/deployment-action`)
     - Extract commit SHA → find JIRA keys in commit messages and associated PR titles/branches
     - Record deployment status (success/failure) per client per environment
   - Also listen for `pull_request` events (action: `closed` + `merged: true`)
     - Extract JIRA keys from PR title, body, source branch name
     - Record which deployment branch the PR was merged to
   - Protected by `GITHUB_WEBHOOK_SECRET` (HMAC-SHA256 verification)

5. **JIRA Dev-Status Enrichment** (enhancement to existing issue detail)
   - When loading an issue, fetch dev-status from JIRA (already done)
   - Parse PR merge targets and cross-reference with branch-env config
   - Merge with `issue_deployments` data for a complete picture

6. **Deployment Status on Issue Detail Page**
   - New "Deployments" section in issue sidebar
   - Visual pipeline: Feature Branch → Staging → Production → Main
   - Per-site status: "TM Staged ✓", "BM Live ✓", "WF Pending", "BM Deploy Failed ✗"
   - Click to see PR details, deployment time, commit SHA, who merged
   - Color coding: green (deployed), amber (staging only), red (failed), gray (not deployed)
   - Shows `skip:` labels if a site was explicitly excluded from staging deploy

7. **Deployment Status on Developer Cards / Task Lists**
   - Small deployment indicators on tasks: icons or dots showing stage/live status
   - Filter tasks by deployment status (e.g., "show only tasks not yet on live")

8. **Deployment Overview / Reports**
   - Which tasks are on staging but not yet live (release candidates)
   - Time from merge-to-staging to merge-to-live (deployment velocity)
   - Tasks merged to main (sync complete)
   - Failed deployments requiring attention

**Environment variables:**
```
GITHUB_TOKEN=ghp_...           # GitHub PAT with repo read access
GITHUB_WEBHOOK_SECRET=...      # Shared secret for webhook verification
```

**Implementation status:**

| Component | Status | Notes |
|-----------|--------|-------|
| DB tables (github_repos, github_branch_mappings, deployments) | ✅ Done | 3 tables + website/brands columns on issues |
| GitHub API client (`src/lib/github/client.ts`) | ✅ Done | Auth, fetch, HMAC verification |
| JIRA key extraction (`src/lib/github/jira-keys.ts`) | ✅ Done | PR title + branch + commit fallback |
| Branch resolver (`src/lib/github/branch-resolver.ts`) | ✅ Done | DB-driven, no hardcoding |
| Deployment recording (`src/lib/github/deployments.ts`) | ✅ Done | Dedup, skip labels, pipeline builder |
| GitHub webhook handler (`/api/webhooks/github`) | ✅ Done | deployment_status + pull_request events |
| Issue deployments API (`/api/issues/:key/deployments`) | ✅ Done | Pipeline data per issue |
| GitHub repos CRUD API | ✅ Done | GET/POST/PATCH/DELETE |
| Deployment pipeline component (issue sidebar) | ✅ Done | Visual Staging → Production → Main |
| Deployment indicator component (dev cards) | ✅ Done | Rocket/server icons |
| Webhook diagnostic logging | ✅ Done | webhook_logs table + /api/webhooks/logs |
| **Settings UI: Add Repo panel (proper form)** | ❌ Rebuild | Owner/repo input + Detect Branches + manual mapping table + presets as quick-fill |
| **Settings UI: Repos Manager (edit/expand)** | ❌ Rebuild | Expandable cards, edit mappings, progress-aware backfill |
| **Backfill with live progress** | ❌ Rebuild | In-memory progress state, poll every 1s, progress bar in UI |
| **Wire website/brands into normalizer + issue sync** | ❌ Pending | Extract JIRA custom fields during sync |
| **Wire deployment status into overview API** | ❌ Pending | Batch query deployments, add to dev card data |
| **Deployment notifications** | ❌ Pending | "Deployed to production" scoped by Website field |
| **Pending releases report** | ❌ Pending | Staging-but-not-live table |

**Deliverable:** Per-task deployment visibility — know if any JIRA task is on staging, live, or main for each site
**Verify:** Add a repo via Settings → Detect Branches → assign environments → Save. Click Backfill → watch progress bar. Visit issue detail → see deployment pipeline. Merge a PR to stage-tilemtn → TeamFlow shows "TM Staged" in real-time via webhook.

---

### Phase 10.7: Cloudflare R2 Avatar Caching
**Duration:** 2-3 days | **Complexity:** Medium

Cache team member avatars in Cloudflare R2 object storage instead of loading from external sources (Gravatar, Google) which rate-limit under concurrent requests.

**Problem:** Google `lh3.googleusercontent.com` returns 429 when ~14+ avatars load simultaneously on Overview. Even Gravatar adds external latency.

**Solution:** During team sync, download avatars from source (JIRA/Google), upload to R2, serve from `cdn-teamflow.appz.cc`. Two sizes per member for thumbnail + full-size viewing.

**R2 Bucket:** `teamflow-avatars`
**Custom domain:** `cdn-teamflow.appz.cc` (appz.cc already on Cloudflare)

**Storage architecture:**
```
avatars/{memberId}/sm.jpg    → 96x96 (dev cards, tables, search, notifications)
avatars/{memberId}/lg.jpg    → 256x256 (profile header, click-to-enlarge)
```

**Change detection:** Store `sourceAvatarUrl` (original JIRA/Google URL) + `avatarHash` (MD5) on `team_members`. On each sync: compare source URL → if changed, re-download + re-upload. URL derives sizes from source (Gravatar `?s=96`/`?s=256`, Google `=s96`/`=s256`).

**Database changes:**
- Add `sourceAvatarUrl TEXT` and `avatarHash VARCHAR(64)` to `team_members`

**Files to create:**
- `src/lib/r2/client.ts` — S3-compatible R2 client (`@aws-sdk/client-s3`), upload/delete
- `src/lib/r2/avatars.ts` — Download from source at 2 sizes, upload to R2, hash comparison
- `scripts/cache-avatars.ts` — One-time migration for existing external avatar URLs

**Files to modify:**
- `src/lib/db/schema.ts` — Add 2 columns to `team_members`
- `src/lib/sync/team-sync.ts` — After member sync, if R2 configured: cache avatars to R2
- `package.json` — Add `@aws-sdk/client-s3`, add `cache-avatars` script

**Environment variables:**
```
CLOUDFLARE_R2_ACCOUNT_ID=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET_NAME=teamflow-avatars
CLOUDFLARE_R2_PUBLIC_URL=https://cdn-teamflow.appz.cc
```

**Fallback:** If R2 not configured, existing behavior preserved (external URLs). If upload fails, keep current avatarUrl. Departed members skipped.

**No UI changes needed** — all components use `<img src={avatarUrl}>`, URL just changes from Gravatar to R2.

**Deliverable:** All team member avatars served from `cdn-teamflow.appz.cc` with zero external image requests
**Verify:** Run `yarn cache-avatars` → avatars visible at `cdn-teamflow.appz.cc/avatars/{id}/sm.jpg`. Refresh app → avatars load from CDN. Change avatar in JIRA → run sync → R2 updates.

---

### Phase 10.8: Team Sync Progress Tracking
**Duration:** 0.5-1 day | **Complexity:** Small

Add live progress bar to the Team Sync (Sync Now) button in Settings, matching the same pattern used by Issue Sync.

**Current problem:** Team sync has no progress feedback — user clicks "Sync Now" and waits with no visibility into what's happening (fetching members, matching Google Directory, caching avatars to R2, etc.).

**Implementation:**
- Add in-memory progress state to team sync engine (`src/lib/sync/team-sync.ts`) with phases: `fetching_members`, `resolving_details`, `matching_google`, `caching_avatars`, `done`, `failed`
- Track: current phase message, members processed / total, avatars cached / total
- Add `GET /api/sync/team-members?progress=1` endpoint to poll progress
- Update `src/components/settings/team-sync-manager.tsx` to poll every 1s during sync and display progress bar
- On mount, check if sync is already running (same pattern as issue sync — persist progress across navigation)
- Show per-phase messages: "Fetching team members from Atlassian...", "Resolving user details (5/14)...", "Matching Google Directory emails...", "Caching avatars to R2 (8/14)...", "Done — 14 members synced, 12 avatars cached"

**Deliverable:** Live progress bar during team sync with phase messages and member count
**Verify:** Click Sync Now → progress bar appears → navigate away and back → progress bar still visible → sync completes with summary

---

### Phase 10.9: Users Management Page
**Duration:** 2-3 days | **Complexity:** Medium

Admin-only page to view and manage all application users, their roles, and account status.

**Problem:** No visibility into who has access to TeamFlow. Users are auto-created on Google sign-in with admin role by default (security issue). No way to deactivate accounts or manage roles.

**Key decisions:**
- Roles: `admin` (full access) + `user` (read-only). No additional roles.
- User creation: Google OAuth only — no manual creation. Admin assigns role after first login.
- Lifecycle: deactivate only (no permanent deletion). New sign-ins default to `user` role.
- Super-admin: `syed.haider@ki5.co.uk` always admin, cannot be deactivated or demoted.
- Immediate session invalidation: per-request DB check ensures deactivated users lose access instantly.

**Schema changes:**
- Add `isActive BOOLEAN DEFAULT TRUE`, `updatedAt TIMESTAMP`, `lastLoginAt TIMESTAMP` to `users` table
- Add `"user_joined"` to `notifications.type` enum

**Auth changes:**
- First Google sign-in defaults to `user` role (not `admin`). Exception: super-admin email always gets `admin`.
- `signIn` callback blocks deactivated users with redirect to `/login?error=AccountDeactivated`
- Per-request JWT callback re-checks `isActive` + `role` from DB (1 query per request, PK lookup)
- New user notification: admin gets bell notification when someone new signs in

**API routes:**
- `GET /api/users` — paginated list with search, role/status filters, metrics (admin only)
- `PATCH /api/users/:id` — update role or isActive (admin only). Guards: can't modify super-admin, can't deactivate self, can't remove last active admin

**UI (admin-only `/users` page):**
- Metric cards: Total Users, Admins (orange), Users (gray), Deactivated (red)
- Server-side paginated table with search + role/status filters
- Columns: User (avatar+name+email), Role (clickable badge toggle), Status (activate/deactivate toggle), Last Login, Created
- Deactivated rows dimmed at 50% opacity
- Self-deactivation disabled with tooltip
- Reuses `MembersTablePagination` with generalized `label` prop

**Sidebar:** "Users" with `ShieldCheck` icon in SYSTEM section, before Settings. Admin-only.

**Files to create:**
- `src/app/api/users/route.ts` — GET paginated list
- `src/app/api/users/[id]/route.ts` — PATCH role/status
- `src/components/users/users-table.tsx` — Main table component
- `src/app/(dashboard)/users/page.tsx` — Page (admin redirect)

**Files to modify:**
- `src/lib/db/schema.ts` — 3 columns + notification type
- `src/auth.config.ts` — default role fix, signIn callback, per-request DB check, new user notification
- `src/auth.ts` — isActive check in Credentials
- `src/app/(auth)/login/page.tsx` — deactivation error display
- `src/components/layout/sidebar.tsx` + `sidebar-nav.tsx` — Users nav item
- `src/components/members/members-table-pagination.tsx` — label prop
- `src/types/index.ts` — "user_joined" NotificationType

**Deliverable:** Admin can see all users, toggle roles, deactivate accounts, get notified on new sign-ins
**Verify:** New Google sign-in → role defaults to "user". Deactivate user → immediate logout. Super-admin cannot be modified. Last-admin protection works.

---

### Phase 10.10: Dynamic Status Management System
**Duration:** 3-4 days | **Complexity:** Large

Replace hardcoded JIRA status mapping with a database-driven, configurable system. Shows exact JIRA status names on badges while maintaining fixed workflow stages for calculations.

**Problem:** JIRA has 713+ statuses. Every new status (Post Live Testing, Merge Conflict, Developed) requires a code change to the normalizer. Statuses display normalized labels instead of real JIRA names.

**Two-layer model:**
- `issues.jiraStatusName` (varchar) — exact JIRA status name shown in badges (e.g., "Post Live Testing")
- `issues.status` (varchar, was ENUM) — workflow stage for calculations (e.g., "post_live_testing")

**9 fixed workflow stages** (calculation buckets, never change):
`todo`, `on_hold`, `in_progress`, `in_review`, `ready_for_testing`, `ready_for_live`, `post_live_testing`, `done`, `closed`

**New table: `status_mappings`** — maps JIRA status names → workflow stages:
- Pre-seeded with 50+ mappings from current STATUS_MAP
- Unknown statuses auto-created during sync using JIRA's statusCategory fallback, marked `isAutoMapped = true`
- Admin reviews and corrects auto-mapped statuses via Settings UI
- In-memory cache during sync for performance

**Schema changes:**
- `issues.status`: ENUM → VARCHAR (no data loss)
- Add `issues.jiraStatusName VARCHAR(255)` — populated on sync
- New `status_mappings` table (jiraStatusName UNIQUE, workflowStage, isAutoMapped, statusCategory)

**Normalizer refactor:**
- `mapStatus()` becomes async: checks DB cache → falls back to code STATUS_MAP → auto-creates on miss
- Returns `{ workflowStage, jiraStatusName }` — both persisted to issues table
- `normalizeIssue()` becomes async (callers already in async contexts)

**Badge update:**
- `IssueStatusBadge` accepts new `jiraStatusName` prop
- Displays JIRA name as label, uses workflow stage for color
- Falls back to normalized label when jiraStatusName not available

**Settings UI: Status Mapping Manager:**
- Table of all mappings: JIRA Status Name | Workflow Stage dropdown | Category | Auto-Mapped?
- Filter to show only unreviewed auto-mapped entries
- Inline edit: change workflow stage → saves immediately
- "Apply to existing issues" button: retroactively update issues with changed mapping

**Files to create (4):** status-mappings API (GET/PATCH + apply endpoint), StatusMappingManager component, seed script
**Files to modify (15+):** schema, types, normalizer, sync, webhook, badge + all components passing status to badge

**Deliverable:** Exact JIRA status names on all badges, configurable mapping via Settings, auto-detection of new statuses
**Verify:** Sync → badges show JIRA names. Add new board with unknown status → auto-mapped. Change mapping in Settings → Apply → issues update.

---

### Phase 11: Polish + Deploy
**Duration:** 3-4 days | **Complexity:** Large

- Error boundaries per page section
- Loading skeletons matching exact page layouts
- Empty states for no-data scenarios
- Performance: dynamic imports for Recharts, proper TanStack Query tuning, React.memo on heavy components
- Railway deployment finalization (env vars, MySQL access, Auth.js redirect URIs)
- Final visual polish (transitions, hover effects, animations)
- Favicon, meta tags, Open Graph

**Deliverable:** Production-ready deployment on Railway
**Verify:** Lighthouse > 90, all error/loading states work, deployment live

---

## 10. Notification Types

| Type | Trigger | Severity | Background Color |
|------|---------|----------|-----------------|
| Task Aging (3+ days) | Issue in `in_progress` for > X days | Warning/Error | Orange (3-4d), Red (5d+) |
| Overdue | Issue `dueDate` has passed, status not Done/Closed | Error | White (red icon) |
| Capacity Alert | Developer over 100% capacity | Warning | White (orange icon) |
| Task Completed | Issue moved to `done` | Info (read style) | White (green icon, 50% opacity) |
| Task Unblocked | Issue status changed from `blocked` | Info | White (blue icon) |
| User Joined | New Google sign-in (first time) | Info | White (blue user icon) |

---

## 11. Key Business Rules

1. **Done vs Closed:** `done` = completed full lifecycle. `closed` = cancelled. Velocity counts only `done`.
2. **Task keys identify boards:** PROD-5555 = Production board. BUTTERFLY-112 = Butterfly project. No separate tags needed.
3. **No sprints on Production:** PROD board is continuous. No sprint labels, no On Track/At Risk badges.
4. **"Frontend" JIRA label:** All team tasks must have this label. Used for filtering at team level.
5. **Task aging threshold:** Configurable (default 3 days). Generates notification when exceeded.
6. **Role in dropdown only:** Admin/User badge shown in profile dropdown, never in sidebar.
7. **Theme toggle in navbar:** Sun/moon icon before bell, standard Tailwind pattern.
8. **Notification badge on bell:** Red circle with unread count. Disappears when all read.
9. **Start dates on queued tasks:** NEXT tasks always show when developer will pick them up.
10. **Sortable tables:** Arrow-up-down icons on all column headers. Active sort column highlighted.
11. **"Expected Deployment Date":** Custom JIRA datepicker field (pending setup). Future feature.
12. **Board naming convention:** Projects named after animals/birds (Butterfly, Eagle, Dolphin, Falcon, etc.).
13. **NEVER delete team members or their data.** When a member is removed from the JIRA team, update status to `departed` — never delete the record. All historical task data, performance history, and assignments are preserved permanently for reporting and audit.
14. **Team members are sync-managed.** No manual member creation/deletion. Members auto-imported from Atlassian Teams API. Admin (Syed Haider Hassan) excluded from sync — he's the dashboard admin, not a tracked team member.
15. **Two member statuses only:** `active` (in JIRA team) and `departed` (removed from JIRA team). No manual status management.
16. **Deployment tracking via GitHub.** Track which JIRA tasks are merged to staging/production branches. Primary data source: JIRA dev-status API (already connected). Secondary: GitHub webhooks for real-time updates. JIRA keys extracted from branch names, PR titles, and commit messages using pattern `/[A-Z]{2,}-\d+/gi`.
17. **Branch naming convention for JIRA keys:** `fix/PROD-5123`, `PROD-5123`, `PROD-5123_v1`, `fix_PROD-5123_v2`, `prod-5123` — all valid patterns that link to JIRA issue PROD-5123.
18. **Deployment pipeline:** Feature Branch → `stage`/`stage-*` (staging) → `main-*` (production per site) → `main` (canonical sync after ~24h).
19. **`stage` branch deploys to all staging sites** unless excluded by config. `main` is the final sync branch merged ~24h after live with no issues.
20. **Super-admin protection:** `syed.haider@ki5.co.uk` is the system owner — always admin, cannot be deactivated or demoted. Enforced in auth callbacks and API endpoints.
21. **User accounts are deactivated, never deleted.** Deactivated users cannot login. Immediate session invalidation via per-request DB check.
22. **New Google sign-ins default to `user` role.** Admin must manually promote to `admin` from the Users page.

---

## 12. Directory Structure

```
mountain-team/
├── .env.example
├── .env.local                    (gitignored)
├── .gitignore
├── .prettierrc
├── .yarnrc.yml
├── components.json               (shadcn/ui config)
├── drizzle.config.ts             (Drizzle Kit for MySQL)
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── DEVELOPMENT_PLAN.md           (this file)
├── README.md
├── scripts/
│   └── seed.ts                   (database seed script)
└── src/
    ├── app/
    │   ├── globals.css           (Summit Logic design tokens)
    │   ├── layout.tsx            (root: fonts, providers)
    │   ├── middleware.ts         (auth protection)
    │   ├── (auth)/
    │   │   ├── layout.tsx        (no sidebar)
    │   │   └── login/
    │   │       └── page.tsx      (Screen 1)
    │   ├── (dashboard)/
    │   │   ├── layout.tsx        (sidebar + topbar + query provider)
    │   │   ├── overview/
    │   │   │   └── page.tsx      (Screen 2/3)
    │   │   ├── calendar/
    │   │   │   └── page.tsx      (Screen 6)
    │   │   ├── workload/
    │   │   │   └── page.tsx      (Screen 9)
    │   │   ├── members/
    │   │   │   ├── page.tsx      (Screen 7)
    │   │   │   └── [id]/
    │   │   │       └── page.tsx  (Screen 4/5)
    │   │   ├── reports/
    │   │   │   └── page.tsx      (Screen 10)
    │   │   └── settings/
    │   │       └── page.tsx      (Screen 11)
    │   └── api/
    │       ├── auth/[...nextauth]/route.ts
    │       ├── team/route.ts
    │       ├── team/[id]/route.ts
    │       ├── issues/route.ts
    │       ├── boards/route.ts
    │       ├── sync/route.ts
    │       ├── config/route.ts
    │       ├── notifications/route.ts
    │       ├── jira/verify-user/route.ts
    │       ├── jira/boards/route.ts
    │       └── reports/
    │           ├── velocity/route.ts
    │           ├── distribution/route.ts
    │           ├── performance/route.ts
    │           ├── heatmap/route.ts
    │           ├── turnaround/route.ts
    │           └── pulse/route.ts
    ├── components/
    │   ├── ui/                   (12 shadcn/ui base-nova components)
    │   ├── layout/
    │   │   ├── sidebar.tsx
    │   │   ├── topbar.tsx
    │   │   ├── nav-item.tsx
    │   │   ├── theme-toggle.tsx
    │   │   ├── profile-dropdown.tsx    (Screen 13)
    │   │   └── notifications-dropdown.tsx (Screen 14)
    │   ├── auth/
    │   │   ├── login-form.tsx
    │   │   └── login-hero.tsx
    │   ├── overview/
    │   │   ├── metrics-strip.tsx
    │   │   ├── filter-bar.tsx
    │   │   ├── dev-card.tsx
    │   │   ├── dev-card-grid.tsx
    │   │   ├── dev-card-now.tsx
    │   │   ├── dev-card-queue.tsx
    │   │   ├── dev-card-done.tsx
    │   │   ├── dev-card-workload.tsx
    │   │   └── dev-card-idle.tsx
    │   ├── profile/
    │   │   ├── profile-header.tsx
    │   │   ├── departed-banner.tsx
    │   │   ├── stats-strip.tsx
    │   │   ├── monthly-chart.tsx
    │   │   ├── performance-snapshot.tsx
    │   │   ├── current-work.tsx
    │   │   ├── task-history-table.tsx
    │   │   └── task-history-pagination.tsx
    │   ├── calendar/
    │   │   ├── calendar-controls.tsx
    │   │   ├── calendar-grid.tsx
    │   │   ├── calendar-bar.tsx
    │   │   └── calendar-popover.tsx
    │   ├── members/
    │   │   ├── members-table.tsx
    │   │   └── add-member-panel.tsx     (Screen 8)
    │   ├── workload/
    │   │   ├── workload-chart.tsx
    │   │   ├── workload-alerts.tsx
    │   │   └── workload-summary.tsx
    │   ├── reports/
    │   │   ├── tasks-completed-chart.tsx
    │   │   ├── board-distribution.tsx
    │   │   ├── task-type-breakdown.tsx
    │   │   ├── deadline-compliance.tsx
    │   │   ├── developer-ranking.tsx
    │   │   ├── board-health.tsx
    │   │   ├── weekly-pulse.tsx
    │   │   ├── task-turnaround.tsx
    │   │   ├── cms-vs-development.tsx
    │   │   ├── developer-heatmap.tsx
    │   │   └── team-velocity.tsx
    │   ├── settings/
    │   │   ├── jira-connection.tsx
    │   │   ├── sync-configuration.tsx
    │   │   ├── preferences-section.tsx
    │   │   └── add-board-panel.tsx      (Screen 12)
    │   └── shared/
    │       ├── metric-card.tsx
    │       ├── status-badge.tsx
    │       ├── priority-badge.tsx
    │       ├── board-tag.tsx
    │       ├── workload-bar.tsx
    │       ├── slide-over.tsx
    │       ├── breadcrumb.tsx
    │       ├── jira-chip.tsx
    │       ├── sortable-header.tsx
    │       ├── error-state.tsx
    │       ├── empty-state.tsx
    │       └── loading-skeleton.tsx
    ├── hooks/
    │   ├── use-theme.ts
    │   ├── use-filters.ts
    │   ├── use-notifications.ts
    │   └── use-search.ts
    ├── lib/
    │   ├── utils.ts              (cn() helper)
    │   ├── constants.ts          (nav items, role types, color mappings)
    │   ├── auth.ts               (Auth.js config)
    │   ├── db/
    │   │   ├── index.ts          (MySQL + Drizzle instance)
    │   │   └── schema.ts         (all table definitions)
    │   ├── jira/
    │   │   ├── client.ts         (REST API v3 client)
    │   │   ├── queries.ts        (JQL builders)
    │   │   ├── normalizer.ts     (raw JIRA → app types)
    │   │   └── types.ts          (JIRA API response types)
    │   ├── sync/
    │   │   ├── engine.ts         (orchestrator)
    │   │   ├── incremental.ts
    │   │   ├── full.ts
    │   │   └── notifications.ts  (generate from sync results)
    │   └── mock/
    │       ├── team-members.ts
    │       ├── issues.ts
    │       ├── boards.ts
    │       ├── notifications.ts
    │       ├── reports-data.ts
    │       └── index.ts
    └── types/
        ├── index.ts
        ├── team.ts
        ├── issue.ts
        ├── board.ts
        ├── notification.ts
        ├── workload.ts
        ├── calendar.ts
        ├── reports.ts
        └── sync.ts
```

---

## 13. Timeline Summary

| Phase | What | Duration | Complexity |
|-------|------|----------|------------|
| 1 | Project Scaffolding | 0.5 days | Medium |
| 2 | Design System + Layout | 2-3 days | Large |
| 3 | Database Schema + MySQL | 1-2 days | Medium |
| 4 | Auth System | 2-3 days | Large |
| 5 | Mock Data Layer | 1-2 days | Medium |
| 6 | Dashboard Screens (Overview + Profile + Calendar) | 5-7 days | Extra Large |
| 7 | Management Screens (Members + Workload + Settings) | 3-4 days | Large |
| 8 | Reports Page (12 chart components) | 4-5 days | Extra Large |
| 9 | Interactive Features (Dropdowns + Notifications + Filters) | 3-4 days | Large |
| 10 | JIRA Integration (Sync Engine + API Routes) | 5-7 days | Extra Large |
| 11 | Polish + Vercel Deploy | 3-4 days | Large |
| **Total** | | **30-42 days** | **6-8 weeks** |

**Note:** Phases 6, 7, and 8 can be parallelized since they all depend on Phase 5 (mock data). Phase 10 requires Phases 3 + 4. Phase 11 requires all prior phases.

---

## 14. Design Reference Files

| File | Location | Description |
|------|----------|-------------|
| DESIGN_BLUEPRINT.md | `docs/DESIGN_BLUEPRINT.md` | Complete UI spec for all 14 screens — pixel-level layout, colors, components |
| STITCH_PROMPT.md | `docs/STITCH_PROMPT.md` | Design system spec + screen descriptions for AI generation |
| PROJECT.md | `PROJECT.md` | Full technical spec — DB schema, JIRA integration, API design, component architecture |
| Pencil Designs (v1) | `docs/ui_ux_flow.pen` | Original 15-screen design file |
| Pencil Designs (v2) | `teamflow_v2.pen` | Updated designs with Summit Logic theme |
| Stitch Project | Google Stitch (TeamFlow) | 58 screens including mobile variants — source of truth for visual design |

---

*This plan is a living document. Update it as decisions change or phases complete.*
