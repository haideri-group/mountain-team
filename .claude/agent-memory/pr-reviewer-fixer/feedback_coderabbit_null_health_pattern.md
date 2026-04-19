---
name: CodeRabbit non-reliability-minded null-health pattern
description: CodeRabbit recurringly suggests flipping "null = healthy" cold-start heuristics to "null = unhealthy", which regresses cold-start latency. Use a cooldown instead.
type: feedback
---

CodeRabbit on PR #57 (and earlier passes on GitHub/JIRA sync PRs) recurringly flags helpers like `modeIsHealthy(null) === true` as a bug and suggests inverting them. Blindly accepting breaks healthy cold-starts — every first request then has to pay a pre-flight probe before the selector will consider the primary auth/transport.

**Why:** On PR #57 the auth selector deliberately treats a null rate-limit snapshot as healthy so the first App request proceeds without an extra `/rate_limit` round-trip. CodeRabbit's diff would have forced a `/rate_limit` or identical probe on every cold start to restore parity.

**How to apply:** When CodeRabbit flags a "null-treated-as-healthy" pattern in a selector/breaker, keep the cold-start heuristic and add a *failure-path* cooldown instead. The failure path is the only place we've got real signal that the upstream is broken; flipping the default just pessimizes the good case to fix the bad case. Pattern to reach for: `let unavailableUntil: number = 0; catch(err) { unavailableUntil = Date.now() + COOLDOWN; }` + `selectMode()` checks `unavailableUntil > Date.now()`. 60s is a reasonable cooldown for GitHub-class upstreams.
