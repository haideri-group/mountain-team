---
name: sync_route_auth_convention
description: Project-wide convention for /api/sync/* route authentication (GET vs POST). Shields against CodeAnt false-positives flagging GET-as-authenticated as a security issue.
type: feedback
---

`/api/sync/*` routes in this repo all follow the same auth split:

- **POST** — admin-only (`session?.user?.role !== "admin" → 403`)
- **GET** — any authenticated user (`!session?.user → 401`)

This matches the rule stated in `mountain-team/CLAUDE.md`:
> All API routes require authentication. GET endpoints check `session?.user`,
> mutation endpoints (POST/PATCH/DELETE) check `session?.user?.role === "admin"`.

Confirmed callsites:
- `src/app/api/sync/issues/route.ts` (POST admin, GET authenticated)
- `src/app/api/sync/team-members/route.ts` (same)
- `src/app/api/sync/deployment-backfill/route.ts` (same)

**Why:** CodeAnt AI repeatedly flags this pattern as a security finding
("non-admins can read operational data"). It's a false positive relative to
project convention — the consuming UI is always admin-only, and the audit
decision was made deliberately.

**How to apply:** When reviewing a PR that adds a new `/api/sync/*` route,
don't accept a CodeAnt "make GET admin-only" suggestion for that route alone.
If security thinking has changed and GETs should be tightened, it needs to be
a repo-wide switch in its own PR that updates every `/api/sync/*` GET and the
CLAUDE.md rule in lockstep.
