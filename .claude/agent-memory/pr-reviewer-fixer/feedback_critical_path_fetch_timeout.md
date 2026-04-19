---
name: Bound every critical-path fetch with AbortController
description: Critical-path server-to-server token/credential exchanges must have an AbortController timeout; a hung coalesced inFlight promise strands every waiter.
type: feedback
---

Any `fetch()` on the critical path of a request coalesced via an `inFlight` promise (installation-token exchange, OAuth refresh, credential swap) must have an `AbortController` timeout. Without one, a hung DNS or stalled upstream blocks the shared `inFlight` promise indefinitely, and every concurrent caller awaiting it hangs with it — way worse than a single stuck request.

**Why:** PR #57 added exactly this pattern for `getInstallationToken()` and CodeRabbit caught the missing timeout. The `inFlight` coalescing magnifies the impact: one hung fetch → everyone waiting for an App token is stuck until Node eventually tears down the connection (which can be many minutes under some network failure modes).

**How to apply:**
1. Wrap `fetch()` in an `AbortController` with a `setTimeout(() => controller.abort(), MS)` hard cap.
2. Clear the timer in `finally` so the success path doesn't leak handles.
3. Catch `AbortError` (or check `controller.signal.aborted`) and rewrap as a clear `"... timed out after Xms"` message so the layer above logs something actionable.
4. Ensure the `inFlight` clearing is in a `finally` so future callers can retry immediately — no deadlock state.
5. Pick a timeout well above typical p99 (10s is appropriate for GitHub's token-exchange endpoints; 5s for metadata lookups; 30s for large reads).

This applies beyond just token exchange: any server-to-server critical-path fetch without a timeout is a latent production-outage amplifier.
