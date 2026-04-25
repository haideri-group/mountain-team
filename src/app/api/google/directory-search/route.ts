import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { sanitizeErrorText } from "@/lib/jira/client";

const PEOPLE_API = "https://people.googleapis.com/v1";

interface DirectoryPerson {
  names?: { displayName: string }[];
  emailAddresses?: { value: string }[];
  photos?: { url: string }[];
}

// GET /api/google/directory-search?q=danish
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const googleToken = session.user.googleAccessToken;
    if (!googleToken) {
      return NextResponse.json(
        { error: "Sign in with Google to use directory search" },
        { status: 401 },
      );
    }

    const query = request.nextUrl.searchParams.get("q") || "";
    if (query.length < 3) {
      return NextResponse.json({ results: [] });
    }

    const params = new URLSearchParams({
      query,
      readMask: "names,emailAddresses,photos",
      sources: "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE",
      pageSize: "8",
    });

    const res = await fetch(
      `${PEOPLE_API}/people:searchDirectoryPeople?${params}`,
      {
        headers: {
          Authorization: `Bearer ${googleToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      // Surface the upstream Google API error body to the client — it's
      // typically a JSON-encoded `{ error: { code, message, status } }`
      // structure that's far more useful for debugging than a bare status
      // code (e.g., expired token vs missing scope vs revoked grant).
      // sanitizeErrorText() redacts any token-shaped strings (project-wide
      // pattern from src/lib/jira/client). The 1000-char cap prevents an
      // unexpected upstream response (HTML maintenance page, multi-MB
      // stacktrace) from blowing up our response size.
      const raw = await res.text();
      const safe = sanitizeErrorText(raw);
      const truncated = safe.length > 1000 ? safe.slice(0, 1000) + "…" : safe;
      return NextResponse.json(
        { error: `Directory search failed: ${res.status} ${truncated}` },
        { status: res.status },
      );
    }

    const data: { people?: DirectoryPerson[] } = await res.json();

    const results = (data.people || [])
      .filter((p) => p.emailAddresses?.[0]?.value)
      .map((p) => ({
        name: p.names?.[0]?.displayName || "",
        email: p.emailAddresses![0].value,
        photo: p.photos?.[0]?.url || null,
      }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Directory search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 },
    );
  }
}
