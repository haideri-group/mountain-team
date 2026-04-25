import { sanitizeErrorText } from "@/lib/jira/client";

const PEOPLE_API = "https://people.googleapis.com/v1";

// Bound the upstream-error text we surface to error messages, matching the
// approach in src/app/api/google/directory-search/route.ts. Keeps the error
// useful for debugging without letting an unexpected Google response (HTML
// maintenance page, multi-MB stacktrace) inflate our log lines.
function sanitizeAndTruncate(raw: string): string {
  const safe = sanitizeErrorText(raw);
  return safe.length > 1000 ? safe.slice(0, 1000) + "…" : safe;
}

interface DirectoryDate {
  year?: number;
  month?: number;
  day?: number;
}

interface DirectoryOrganization {
  title?: string;
  name?: string;
  department?: string;
  current?: boolean;
  startDate?: DirectoryDate;
  endDate?: DirectoryDate;
}

interface DirectoryPerson {
  names?: { displayName: string }[];
  emailAddresses?: { value: string; type?: string }[];
  photos?: { url: string }[];
  organizations?: DirectoryOrganization[];
}

export interface DirectoryMatch {
  email: string;
  name: string;
  photoUrl: string | null;
  jobTitle: string | null;
  orgJoinedDate: string | null;
}

// Prefer the current organization's title; fall back to the first non-empty title.
function extractJobTitle(orgs?: DirectoryOrganization[]): string | null {
  if (!orgs || orgs.length === 0) return null;
  const current = orgs.find((o) => o.current && o.title);
  if (current?.title) return current.title.trim();
  const any = orgs.find((o) => o.title);
  return any?.title ? any.title.trim() : null;
}

// Format a People API Date object as YYYY-MM-DD. Fills missing month/day with
// 01 so downstream date parsing stays valid. Returns null if no year.
// The API may signal "not significant" by returning 0 for month/day (per spec),
// so `||` — not `??` — is required to replace falsy zeros alongside null/undefined.
function formatDirectoryDate(d?: DirectoryDate): string | null {
  if (!d || !d.year) return null;
  const y = String(d.year).padStart(4, "0");
  const m = String(d.month || 1).padStart(2, "0");
  const day = String(d.day || 1).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Extract the employment start date — prefer the current org, fall back to the
// earliest non-empty startDate across all organizations.
function extractOrgJoinedDate(orgs?: DirectoryOrganization[]): string | null {
  if (!orgs || orgs.length === 0) return null;
  const current = orgs.find((o) => o.current && o.startDate?.year);
  if (current) return formatDirectoryDate(current.startDate);
  const withDate = orgs
    .map((o) => formatDirectoryDate(o.startDate))
    .filter((d): d is string => d !== null)
    .sort();
  return withDate[0] || null;
}

interface SearchResponse {
  people?: DirectoryPerson[];
  totalSize?: number;
}

// Build search queries from a display name: full name, first+last, first only
function buildSearchQueries(displayName: string): string[] {
  const parts = displayName.trim().split(/\s+/);
  const queries: string[] = [displayName];

  if (parts.length >= 3) {
    // "Danish Mahmood Awan" → also try "Danish Awan"
    queries.push(`${parts[0]} ${parts[parts.length - 1]}`);
  }

  if (parts.length >= 2) {
    // Try first name only as last resort
    queries.push(parts[0]);
  }

  return queries;
}

// Execute a single directory search
async function searchDirectory(
  accessToken: string,
  query: string,
): Promise<DirectoryPerson[]> {
  const params = new URLSearchParams({
    query,
    readMask: "names,emailAddresses,photos,organizations",
    sources: "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE",
    pageSize: "5",
  });

  const res = await fetch(
    `${PEOPLE_API}/people:searchDirectoryPeople?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error(
      `Google Directory search failed: ${res.status} ${sanitizeAndTruncate(await res.text())}`,
    );
  }

  const data: SearchResponse = await res.json();
  return data.people || [];
}

// Pick the best match from search results
function pickBestMatch(
  people: DirectoryPerson[],
  displayName: string,
): DirectoryMatch | null {
  if (people.length === 0) return null;

  const nameParts = displayName.toLowerCase().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];

  // Score each person by how well their name matches
  let bestScore = -1;
  let bestMatch: DirectoryMatch | null = null;

  for (const person of people) {
    const email = person.emailAddresses?.[0]?.value;
    if (!email) continue;

    const name = (person.names?.[0]?.displayName || "").toLowerCase();
    const personParts = name.split(/\s+/);
    let score = 0;

    // Exact full name match
    if (name === displayName.toLowerCase()) score = 100;
    // First name matches
    if (personParts[0] === firstName) score += 40;
    // Last name matches
    if (personParts[personParts.length - 1] === lastName) score += 40;
    // Email contains first name
    if (email.toLowerCase().includes(firstName)) score += 10;
    // Email contains last name
    if (email.toLowerCase().includes(lastName)) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        email,
        name: person.names?.[0]?.displayName || displayName,
        photoUrl: person.photos?.[0]?.url || null,
        jobTitle: extractJobTitle(person.organizations),
        orgJoinedDate: extractOrgJoinedDate(person.organizations),
      };
    }
  }

  // Require at least a first name match (score >= 40) to avoid false positives
  return bestScore >= 40 ? bestMatch : null;
}

// Search Google Workspace directory for a person by name (tries multiple strategies)
export async function searchDirectoryByName(
  accessToken: string,
  displayName: string,
): Promise<DirectoryMatch | null> {
  const queries = buildSearchQueries(displayName);

  for (const query of queries) {
    const people = await searchDirectory(accessToken, query);
    const match = pickBestMatch(people, displayName);
    if (match) return match;
  }

  return null;
}

export interface MemberDirectoryMatch {
  email: string | null;
  photoUrl: string | null;
  jobTitle: string | null;
  orgJoinedDate: string | null;
}

// Match emails and photos for a batch of team members
export async function matchFromDirectory(
  accessToken: string,
  members: { id: string; displayName: string; email: string | null }[],
): Promise<Map<string, MemberDirectoryMatch>> {
  const matchMap = new Map<string, MemberDirectoryMatch>();

  for (const member of members) {
    try {
      // If member already has an email, search by email first for exact match
      if (member.email) {
        const peopleByEmail = await searchDirectory(accessToken, member.email);
        const emailMatch = peopleByEmail.find((p) =>
          p.emailAddresses?.some(
            (e) => e.value?.toLowerCase() === member.email!.toLowerCase(),
          ),
        );
        if (emailMatch) {
          matchMap.set(member.id, {
            email: null, // already have email
            photoUrl: emailMatch.photos?.[0]?.url || null,
            jobTitle: extractJobTitle(emailMatch.organizations),
            orgJoinedDate: extractOrgJoinedDate(emailMatch.organizations),
          });
          continue;
        }
      }

      // Fallback: search by name
      const result = await searchDirectoryByName(
        accessToken,
        member.displayName,
      );
      if (result) {
        // If member has email, verify the match email contains part of the member's name
        // to avoid false positives (e.g., "Danish Saeed" matching for "Danish Mahmood")
        if (member.email && result.email) {
          const memberPrefix = member.email.split("@")[0].toLowerCase();
          const matchPrefix = result.email.split("@")[0].toLowerCase();
          if (memberPrefix !== matchPrefix && !matchPrefix.includes(memberPrefix) && !memberPrefix.includes(matchPrefix)) {
            // Email prefixes don't match — likely a false positive, skip
            continue;
          }
        }
        matchMap.set(member.id, {
          email: member.email ? null : result.email,
          photoUrl: result.photoUrl,
          jobTitle: result.jobTitle,
          orgJoinedDate: result.orgJoinedDate,
        });
      }
    } catch (error) {
      console.warn(
        `Failed to match directory for ${member.displayName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return matchMap;
}

/**
 * Find a Google Workspace person by exact email match.
 * Returns photo URL, job title, and organization joining date.
 * Used for single-member enrichment after an email change.
 */
export async function findPersonByEmail(
  accessToken: string,
  email: string,
): Promise<{
  photoUrl: string | null;
  jobTitle: string | null;
  orgJoinedDate: string | null;
} | null> {
  try {
    const people = await searchDirectory(accessToken, email);
    const match = people.find((p) =>
      p.emailAddresses?.some(
        (e) => e.value?.toLowerCase() === email.toLowerCase(),
      ),
    );
    if (!match) return null;
    return {
      photoUrl: match.photos?.[0]?.url || null,
      jobTitle: extractJobTitle(match.organizations),
      orgJoinedDate: extractOrgJoinedDate(match.organizations),
    };
  } catch {
    return null;
  }
}
