import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";

interface JiraComment {
  id: string;
  author: { displayName: string; avatarUrls?: Record<string, string> };
  body: unknown;
  created: string;
}

interface JiraChangelogItem {
  field: string;
  fieldtype: string;
  fromString: string | null;
  toString: string | null;
}

interface JiraChangelogHistory {
  id: string;
  author: { displayName: string };
  created: string;
  items: JiraChangelogItem[];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { key } = await params;
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key.toUpperCase())}?expand=changelog,renderedFields&fields=description,comment,subtasks,parent,summary,attachment,issuelinks`;

    const res = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(),
        Accept: "application/json",
      },
      next: { revalidate: 60 }, // cache for 60 seconds
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `JIRA API error ${res.status}: ${sanitizeErrorText(text)}` },
        { status: res.status },
      );
    }

    const data = await res.json();

    // Description — use renderedFields for pre-rendered HTML
    const description: string | null =
      data.renderedFields?.description || null;

    // Comments
    const rawComments: JiraComment[] =
      data.fields?.comment?.comments || [];
    const comments = rawComments.map((c) => ({
      id: c.id,
      author: c.author?.displayName || "Unknown",
      authorAvatar: c.author?.avatarUrls?.["24x24"] || null,
      body:
        data.renderedFields?.comment?.comments?.find(
          (rc: { id: string; body: string }) => rc.id === c.id,
        )?.body || "(comment)",
      created: c.created?.split("T")[0] || "",
    }));

    // Changelog
    const rawHistory: JiraChangelogHistory[] =
      data.changelog?.histories || [];
    const changelog = rawHistory.flatMap((h) =>
      h.items
        .filter((item) =>
          ["status", "assignee", "priority", "Sprint", "labels"].includes(
            item.field,
          ),
        )
        .map((item) => ({
          id: `${h.id}-${item.field}`,
          author: h.author?.displayName || "System",
          created: h.created?.split("T")[0] || "",
          field: item.field,
          from: item.fromString || "",
          to: item.toString || "",
        })),
    );

    // Subtasks
    const rawSubtasks = data.fields?.subtasks || [];
    const subtasks = rawSubtasks.map(
      (st: {
        key: string;
        fields: { summary: string; status: { name: string } };
      }) => ({
        key: st.key,
        title: st.fields?.summary || "",
        status: st.fields?.status?.name || "",
      }),
    );

    // Parent
    const parentKey: string | null = data.fields?.parent?.key || null;
    const parentTitle: string | null =
      data.fields?.parent?.fields?.summary || null;

    // Attachments
    const rawAttachments = data.fields?.attachment || [];
    const attachments = rawAttachments.map(
      (a: {
        id: string;
        filename: string;
        mimeType: string;
        size: number;
        content: string;
        thumbnail?: string;
        created: string;
        author: { displayName: string };
      }) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        url: a.content,
        thumbnail: a.thumbnail || null,
        created: a.created?.split("T")[0] || "",
        author: a.author?.displayName || "Unknown",
      }),
    );

    // Linked issues
    const rawLinks = data.fields?.issuelinks || [];
    const linkedIssues = rawLinks.map(
      (link: {
        id: string;
        type: { name: string; inward: string; outward: string };
        inwardIssue?: { key: string; fields: { summary: string; status: { name: string } } };
        outwardIssue?: { key: string; fields: { summary: string; status: { name: string } } };
      }) => {
        const related = link.inwardIssue || link.outwardIssue;
        const direction = link.inwardIssue ? "inward" : "outward";
        return {
          id: link.id,
          type: direction === "inward" ? link.type.inward : link.type.outward,
          key: related?.key || "",
          title: related?.fields?.summary || "",
          status: related?.fields?.status?.name || "",
        };
      },
    );

    return NextResponse.json({
      description,
      comments,
      changelog,
      subtasks,
      parentKey,
      parentTitle,
      attachments,
      linkedIssues,
    });
  } catch (error) {
    console.error("Failed to fetch JIRA issue details:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch from JIRA",
      },
      { status: 500 },
    );
  }
}
