---
name: Brand resolver silent-drop gotcha
description: getExpectedSites() silently drops unmapped brands — any caller that uses `complete` to short-circuit work must also check `allResolved`.
type: reference
---

`src/lib/deployments/brand-resolver.ts` — `getExpectedSites()` walks the parsed brands array and ONLY adds sites for brands present in `BRAND_SITE_MAP`. Unknown brands (typos, new brands not yet added to the map) are silently dropped — there is no warning, no error.

Downstream impact: `getDeploymentCompleteness(...).complete === true` can fire even when some parsed brands resolved to nothing. A JIRA issue with `brands = "Tile Mountain, TypoBrand"` reports complete as soon as the Tile Mountain sites are deployed.

PR #55 added `getExpectedSitesWithResolution()` and an `allResolved` flag on `getDeploymentCompleteness()`. Any caller using `complete` to suppress work (backfill skip, auto-mark-done, etc.) must require `complete && allResolved`. Callers that use `complete` only for display (badges, progress %) can ignore `allResolved`.

Wholesale is a special case: known brand, intentionally maps to `[]`. It is "resolved" — does NOT go into `unresolvedBrands`. The wholesale-only early-exit in `selectQueue` handles the empty-sites case separately.
