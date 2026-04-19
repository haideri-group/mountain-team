---
name: Rate-limit snapshot out-of-order replacement
description: Cached `x-ratelimit-remaining` must use `min` within a reset window — blind replacement lets stale higher values inflate the stored budget.
type: feedback
---

When caching `x-ratelimit-remaining` from concurrent GitHub fetches, blind replacement of the snapshot is wrong. Responses can resolve in any order, so a late-arriving older response with a higher `remaining` will overwrite a newer lower value. Anything reading the counter (quota-based mode selector, backfill circuit breaker) then thinks more quota is left than actually is.

**Why:** Counter is monotonically non-increasing within a reset window. The window-local minimum is the only safe ceiling. When `resetAt` differs, the window has rolled over and replacement is correct — the old min is no longer meaningful.

**How to apply:** In any `captureRateLimit`-style function that stores `{ remaining, limit, resetAt }`:

```ts
const current = /* prior snapshot for this mode */;
const merged = current && current.resetAt.getTime() === snap.resetAt.getTime()
  ? { remaining: Math.min(current.remaining, snap.remaining), limit: snap.limit, resetAt: snap.resetAt }
  : snap;
```

Don't try to track request start timestamps or monotonic sequence numbers — GitHub doesn't give you ordering info, and the min-within-window rule is sufficient and free. Accept this CodeRabbit flag whenever seen.

Canonical implementation: `src/lib/github/auth-mode.ts` `captureRateLimitForMode()`.
