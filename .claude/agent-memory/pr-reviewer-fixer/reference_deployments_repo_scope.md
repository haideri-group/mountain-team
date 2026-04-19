---
name: deployments table cross-repo scope gotcha
description: Any query over `deployments` by `(jiraKey, commitSha)` must also filter by `repoId` if the caller is acting on a single repo.
type: reference
---

`deployments` has no unique constraint on `(jiraKey, commitSha)` and no unique constraint on `(repoId, jiraKey, commitSha)`. A single JIRA issue can have deployment rows across multiple tracked repos (frontend + backend), and the same commit SHA could in theory exist in both if anyone cherry-picks or git-submodules.

When a caller is scoped to one repo (e.g., `propagateDeploymentToOtherBranches` walks branches loaded `WHERE repoId = X`), any supporting SELECT over `deployments` must also filter `WHERE repoId = X`. Otherwise a row from repo Y can mask missing coverage in repo X.

Index coverage for this query: `idx_deployments_jirakey_env(jiraKey, environment)` — leading column matches, filter on `repoId` + `commitSha` is post-index. For typical jiraKey cardinality (<20 rows) this is a cheap filesort, no additional index needed.

Two separate bots (CodeAnt, CodeRabbit) independently flagged this on PR #55 — when two bots agree on a scope/filter concern, it's almost always a real bug even if the behavior under current data is benign.
