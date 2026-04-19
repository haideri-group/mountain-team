---
name: parseInt env-var NaN trap for comparison guards
description: parseInt(process.env.FOO || "default", 10) produces NaN when FOO is set to a non-numeric value; all subsequent `x > NaN` comparisons silently fail.
type: feedback
---

`Number.parseInt(process.env.FOO || "200", 10)` looks safe but is a NaN trap when `FOO` is set to a non-numeric value like empty string (`""` passes the `||` check), `"abc"`, or anything with leading whitespace followed by non-digits. Any downstream `remaining > FALLBACK` comparison then silently returns `false` forever, disabling whatever guard it fed.

**Why:** PR #57 had this pattern on `GITHUB_APP_FALLBACK_FLOOR`. If a deployer typed a garbage value into Railway's env UI, the quota-based App→PAT failover would have silently stopped working — no log, no alert, just requests exhausting App's quota.

**How to apply:** Always post-validate numeric env parses before use.

```ts
const parsed = Number.parseInt(process.env.FOO || "", 10);
const SAFE = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT;
```

The `>= 0` check also rejects negative values, which can have the *opposite* bug of always-true comparisons + permanent lock-in. Use `> 0` if zero is also invalid. Same pattern applies to `Number.parseFloat` for time/ratio envs.
