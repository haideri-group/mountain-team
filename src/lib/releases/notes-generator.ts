/**
 * Release notes generator. Pure function — no DB calls.
 *
 * Produces two variants from the same input:
 *
 *   internal          for the dev team / PM handoff. Retains JIRA keys,
 *                     assignees, and issue types. Grouped by type.
 *
 *   customer-facing   cleaned up, plain English, no JIRA keys. Good for
 *                     a changelog page or release email. Grouped by type
 *                     using user-friendly headings.
 */

export interface NotesIssue {
  jiraKey: string;
  title: string;
  type: string | null; // bug | story | task | enhancement | cms_change | subtask
  assigneeName: string | null;
}

export interface NotesRelease {
  name: string;
  projectKey: string;
  description: string | null;
  releaseDate: string | null; // YYYY-MM-DD
  released: boolean;
}

export interface GeneratedNotes {
  internal: string; // markdown
  customer: string; // markdown
}

const INTERNAL_GROUPS: Array<{ key: string; heading: string; types: string[] }> = [
  { key: "features", heading: "Features", types: ["story", "enhancement"] },
  { key: "fixes", heading: "Fixes", types: ["bug"] },
  { key: "improvements", heading: "Improvements", types: ["task"] },
  { key: "content", heading: "Content updates", types: ["cms_change"] },
  { key: "other", heading: "Other", types: [] },
];

const CUSTOMER_GROUPS: Array<{ key: string; heading: string; types: string[] }> = [
  { key: "features", heading: "What's new", types: ["story", "enhancement"] },
  { key: "fixes", heading: "Issues resolved", types: ["bug"] },
  { key: "improvements", heading: "Improvements", types: ["task"] },
  { key: "content", heading: "Content updates", types: ["cms_change"] },
];

function classify(type: string | null, groups: typeof INTERNAL_GROUPS): string {
  if (!type) return "other";
  for (const g of groups) {
    if (g.types.includes(type)) return g.key;
  }
  return "other";
}

function bucketize(
  issues: NotesIssue[],
  groups: typeof INTERNAL_GROUPS,
): Map<string, NotesIssue[]> {
  const map = new Map<string, NotesIssue[]>();
  for (const g of groups) map.set(g.key, []);
  for (const issue of issues) {
    const key = classify(issue.type, groups);
    const bucket = map.get(key) || map.get("other") || [];
    bucket.push(issue);
    if (!map.has(key)) map.set("other", bucket);
  }
  return map;
}

/** Strip common noise from JIRA titles for customer-facing output:
 *  - leading ticket-like prefixes ("[PROD] ", "FE: ")
 *  - trailing ticket numbers in parens
 *  - capitalise first letter, ensure a closing period */
function cleanTitle(title: string): string {
  let s = title.trim();
  s = s.replace(/^\[[^\]]+\]\s*/, ""); // leading "[tag] "
  s = s.replace(/^(FE|BE|QA|PM)\s*:\s*/i, ""); // leading "FE: " etc.
  s = s.replace(/\s*\([A-Z]{2,}-\d+\)\s*$/, ""); // trailing "(PROD-1234)"
  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += ".";
  return s;
}

function formatDate(d: string | null): string {
  if (!d) return "TBD";
  const dt = new Date(`${d}T12:00:00Z`);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function generateReleaseNotes(
  release: NotesRelease,
  issues: NotesIssue[],
): GeneratedNotes {
  // ── Internal (dev-facing) ─────────────────────────────────────────────
  const internalBuckets = bucketize(issues, INTERNAL_GROUPS);
  const internalLines: string[] = [];
  internalLines.push(`# ${release.name}`);
  internalLines.push(``);
  internalLines.push(`**Project:** ${release.projectKey}`);
  internalLines.push(`**Release date:** ${formatDate(release.releaseDate)}`);
  internalLines.push(`**Status:** ${release.released ? "Released" : "Pending"}`);
  if (release.description) {
    internalLines.push(``);
    internalLines.push(release.description.trim());
  }
  internalLines.push(``);
  internalLines.push(`**Total issues:** ${issues.length}`);
  internalLines.push(``);

  for (const g of INTERNAL_GROUPS) {
    const bucket = internalBuckets.get(g.key) || [];
    if (bucket.length === 0) continue;
    internalLines.push(`## ${g.heading} (${bucket.length})`);
    internalLines.push(``);
    for (const i of bucket) {
      const who = i.assigneeName ? ` — @${i.assigneeName}` : "";
      internalLines.push(`- **${i.jiraKey}** · ${i.title}${who}`);
    }
    internalLines.push(``);
  }

  // ── Customer-facing ───────────────────────────────────────────────────
  const customerBuckets = bucketize(
    issues.filter((i) => i.type !== "subtask"), // hide subtasks entirely
    CUSTOMER_GROUPS,
  );
  const customerLines: string[] = [];
  customerLines.push(`# ${release.name}`);
  customerLines.push(``);
  customerLines.push(`*${formatDate(release.releaseDate)}*`);
  customerLines.push(``);
  if (release.description) {
    customerLines.push(release.description.trim());
    customerLines.push(``);
  }

  let anyCustomer = false;
  for (const g of CUSTOMER_GROUPS) {
    const bucket = customerBuckets.get(g.key) || [];
    if (bucket.length === 0) continue;
    anyCustomer = true;
    customerLines.push(`## ${g.heading}`);
    customerLines.push(``);
    for (const i of bucket) {
      customerLines.push(`- ${cleanTitle(i.title)}`);
    }
    customerLines.push(``);
  }
  if (!anyCustomer) {
    customerLines.push(`_No user-visible changes in this release._`);
    customerLines.push(``);
  }

  return {
    internal: internalLines.join("\n").trimEnd() + "\n",
    customer: customerLines.join("\n").trimEnd() + "\n",
  };
}
