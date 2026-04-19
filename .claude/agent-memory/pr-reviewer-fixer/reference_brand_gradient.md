---
name: brand_gradient_token
description: Canonical location for the Summit Logic primary CTA gradient constant, to flag new callsites that should use it.
type: reference
---

The Summit Logic primary CTA gradient is exported from
`src/lib/brand.ts` as `BRAND_GRADIENT`:

```ts
export const BRAND_GRADIENT =
  `linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary})`;
// resolves to: linear-gradient(135deg, #944a00, #ff8400)
```

Used in `style={{ background: BRAND_GRADIENT }}` where Tailwind's gradient
utilities can't cleanly express the diagonal two-stop form.

**How to apply:** When reviewing new components that write
`linear-gradient(135deg, #944a00, #ff8400)` inline, point them at
`BRAND_GRADIENT` from `@/lib/brand`.

History: the constant was added in PR #52 (commit 5768ee9). PR #51's
review talked about introducing it but the actual export didn't land
until #52 — so if you're reviewing a PR that predates 5768ee9 on main
and `BRAND_GRADIENT` doesn't exist yet, add it together with the
callsite fix in the same commit. Verify with grep before assuming
it's present.

As of 5768ee9 there are still ~20 pre-existing callsites with the
literal string (topbar, task-chip, members-table, issue-sync-manager,
team-sync-manager, github-repos-manager, boards-manager, users-table,
add-repo-panel, members-table-pagination, issue-detail, issue-activity).
A repo-wide sweep hasn't been done — if a future PR touches one of
these files for another reason, it's a cheap drive-by.

Focus rings: the input focus state in the allowlist UI uses
`focus:ring-[#ff8400]/30` — globals.css does NOT expose a Tailwind
ring-color token yet, so swapping those to a token is a design-system
PR, not a drop-in. Don't accept CodeRabbit "use the token" suggestions
for ring-color until globals.css grows one.
