import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthHeader, getBaseUrl, sanitizeErrorText } from "@/lib/jira/client";
import { db } from "@/lib/db";
import { issues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
    // Public read-only endpoint — no auth required for GET

    const { key } = await params;
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key.toUpperCase())}?expand=changelog,renderedFields&fields=description,comment,subtasks,parent,summary,attachment,issuelinks,timetracking`;

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

    // Write-through: update DB description if we got a fresh one
    if (description) {
      db.update(issues)
        .set({ description })
        .where(eq(issues.jiraKey, key.toUpperCase()))
        .catch(() => {}); // non-fatal, fire-and-forget
    }

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

    // Time tracking
    const timetracking = data.fields?.timetracking || null;
    const timeTracking = timetracking
      ? {
          timeSpent: timetracking.timeSpent || null,
          timeSpentSeconds: timetracking.timeSpentSeconds || 0,
          remainingEstimate: timetracking.remainingEstimate || null,
          remainingEstimateSeconds: timetracking.remainingEstimateSeconds || 0,
          originalEstimate: timetracking.originalEstimate || null,
          originalEstimateSeconds: timetracking.originalEstimateSeconds || 0,
        }
      : null;

    // Worklogs — separate API call
    let worklogs: { author: string; authorAvatar: string | null; timeSpent: string; timeSpentSeconds: number; started: string }[] = [];
    try {
      const wlRes = await fetch(
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key.toUpperCase())}/worklog`,
        {
          headers: { Authorization: getAuthHeader(), Accept: "application/json" },
          cache: "no-store",
        },
      );
      if (wlRes.ok) {
        const wlData = await wlRes.json();
        // Aggregate by author
        const byAuthor = new Map<string, { seconds: number; avatar: string | null }>();
        for (const wl of wlData.worklogs || []) {
          const name = wl.author?.displayName || "Unknown";
          const existing = byAuthor.get(name);
          if (existing) {
            existing.seconds += wl.timeSpentSeconds || 0;
          } else {
            byAuthor.set(name, {
              seconds: wl.timeSpentSeconds || 0,
              avatar: wl.author?.avatarUrls?.["24x24"] || null,
            });
          }
        }
        worklogs = [...byAuthor.entries()]
          .sort((a, b) => b[1].seconds - a[1].seconds)
          .map(([author, data]) => {
            const h = Math.floor(data.seconds / 3600);
            const m = Math.round((data.seconds % 3600) / 60);
            return {
              author,
              authorAvatar: data.avatar,
              timeSpent: h > 0 ? `${h}h ${m}m` : `${m}m`,
              timeSpentSeconds: data.seconds,
              started: "",
            };
          });
      }
    } catch {
      // Non-fatal — worklogs may not be available
    }

    return NextResponse.json({
      description,
      comments,
      changelog,
      subtasks,
      parentKey,
      parentTitle,
      attachments,
      linkedIssues,
      timeTracking,
      worklogs,
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
