import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";
import { requirePublicOrSession } from "@/lib/ip/gate";

interface JiraComment {
  id: string;
  author: {
    displayName: string;
    avatarUrls?: Record<string, string>;
  };
  renderedBody?: string;
  body?: unknown;
  created: string;
  updated: string;
}

interface JiraCommentResponse {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

// GET /api/issues/{key}/comments?page=1&pageSize=10&sort=desc
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const gate = await requirePublicOrSession(request);
    if (!gate.allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { key } = await params;
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
    const sort = searchParams.get("sort") === "asc" ? "asc" : "desc";

    const startAt = (page - 1) * pageSize;
    const orderBy = sort === "desc" ? "-created" : "created";

    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key.toUpperCase())}/comment?startAt=${startAt}&maxResults=${pageSize}&orderBy=${orderBy}&expand=renderedBody`;

    const res = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `JIRA API error ${res.status}: ${sanitizeErrorText(text)}` },
        { status: res.status },
      );
    }

    const data: JiraCommentResponse = await res.json();

    const comments = data.comments.map((c) => ({
      id: c.id,
      author: c.author?.displayName || "Unknown",
      authorAvatar: c.author?.avatarUrls?.["24x24"] || null,
      body: c.renderedBody || "",
      created: c.created || "",
      updated: c.updated || "",
    }));

    const total = data.total;
    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      comments,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch comments" },
      { status: 500 },
    );
  }
}
