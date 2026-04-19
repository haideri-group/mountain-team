---
name: HeadersInit spread is a foot-gun
description: Object-spreading RequestInit.headers silently drops headers — normalize via `new Headers(...)` before merging.
type: feedback
---

Object-spreading `init.headers` in a `fetch()` wrapper is wrong because `RequestInit.headers` is `HeadersInit = Headers | [string, string][] | Record<string, string>`. Only the last shape survives spread:

- `{...new Headers({...})}` → `{}` (Headers stores state internally)
- `{...[["k","v"]]}` → `{ "0": ["k","v"] }` (numeric keys)
- `{...{k:"v"}}` → `{k:"v"}` (works)

**Why:** Accept this CodeRabbit flag even when current callers pass only plain objects — the bug is latent but cheap to close, and any future caller using conditional-GET ETags (`Headers` instances common in those patterns) trips it.

**How to apply:** In any `fetch()` wrapper that merges caller headers with library/auth headers, extract a `mergeRequestHeaders(caller, auth): Headers` helper that pipes caller headers through `new Headers(...)` then applies auth via `.set()`. Return a `Headers` instance (fetch accepts it as `HeadersInit`). Don't special-case the call site — do it in the helper so both initial and retry paths stay consistent.

Canonical implementation lives at `src/lib/github/client.ts` as `mergeRequestHeaders()`.
