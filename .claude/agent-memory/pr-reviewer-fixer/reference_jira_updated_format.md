---
name: jira_updatedat_format_and_mysql_parsing
description: Storage format of issues.jiraUpdatedAt and the correct way to parse it in MySQL SQL (watch out for %z which MySQL does NOT support).
type: reference
---

`issues.jiraUpdatedAt` is `varchar(50)` and stores the raw JIRA
`fields.updated` string unchanged — see `src/lib/jira/normalizer.ts:333`.

JIRA's format is ISO 8601-ish **but non-standard**:
```
2026-04-19T12:34:56.789+0000
2023-06-25T20:32:13.00-0400
```
The timezone offset has **no colon** (`+0000`, not `+00:00`) and
fractional seconds can be 2 or 3 digits.

**MySQL gotcha:** `STR_TO_DATE` has **no `%z` format specifier**. A format
like `'%Y-%m-%dT%H:%i:%s.%f%z'` silently returns NULL for every row — every
date comparison becomes false, which breaks priority buckets, staleness
checks, etc. Silent bug.

**Correct parse pattern:**
```sql
STR_TO_DATE(LEFT(i.jiraUpdatedAt, 23), '%Y-%m-%dT%H:%i:%s.%f')
```
This truncates to the base datetime (`YYYY-MM-DDTHH:MM:SS.sss`) and drops
the timezone offset. Accurate within seconds, which is sufficient for
"is this row newer than my last sync stamp" checks. If you ever need
exact wall-clock comparison, you'd have to strip the offset separately
and apply `CONVERT_TZ`.

**How to apply:** When reviewing SQL that parses `jiraUpdatedAt` or
`jiraCreatedAt`, make sure the format string doesn't contain `%z`. This
was a critical bug in PR #51 (`src/lib/sync/deployment-backfill.ts`
priority 4 bucket) caught by CodeRabbit; fixed in commit 9d40a59.
