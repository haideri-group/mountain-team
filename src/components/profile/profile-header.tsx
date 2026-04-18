"use client";

import { useState } from "react";
import { Mail, Calendar, UserX, ExternalLink, Users, Check, Copy } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { APP_TIMEZONE } from "@/lib/config";
import type { MemberStatus } from "@/types";

interface ProfileHeaderProps {
  member: {
    displayName: string;
    email: string | null;
    role: string | null;
    status: MemberStatus;
    avatarUrl: string | null;
    joinedDate: string | null;
    orgJoinedDate: string | null;
    departedDate: string | null;
    jiraAccountId: string;
    teamName: string | null;
  };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

// Values are stored as date-only strings (YYYY-MM-DD). new Date() parses
// them as UTC midnight, so formatting in the client TZ can shift by a day
// for non-PKT users. Pin to APP_TIMEZONE to match the app-wide convention.
function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  });
}

export function ProfileHeader({ member }: ProfileHeaderProps) {
  const isDeparted = member.status === "departed";

  return (
    <div className={isDeparted ? "opacity-70" : ""}>
      {/* Departed banner */}
      {isDeparted && (
        <div className="mb-5 flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-dashed border-red-300 dark:border-red-800">
          <UserX className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              This member has departed the company
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
              Last working day: {formatFullDate(member.departedDate)}. Task
              history is preserved for reference.
            </p>
          </div>
        </div>
      )}

      {/* Profile card */}
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center text-lg font-bold font-mono text-muted-foreground">
              {getInitials(member.displayName)}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold font-mono">
                {member.displayName}
              </h2>
              <StatusBadge status={member.status} />
              {member.teamName && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                  <Users className="h-3 w-3" />
                  {member.teamName}
                </span>
              )}
              <a
                href={`https://tilemountain.atlassian.net/people/${member.jiraAccountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider bg-muted/30 text-muted-foreground hover:text-foreground transition-colors ${isDeparted ? "opacity-50" : ""}`}
              >
                <ExternalLink className="h-3 w-3" />
                JIRA
              </a>
            </div>

            {member.role && (
              <p className="text-sm text-muted-foreground mt-1">{member.role}</p>
            )}

            <div className="flex items-center gap-5 mt-3 text-xs text-muted-foreground">
              {member.email && (
                <CopyEmail email={member.email} />
              )}
              {(member.orgJoinedDate || member.joinedDate) && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {isDeparted && member.departedDate && member.orgJoinedDate
                    ? `${formatFullDate(member.orgJoinedDate)} — ${formatFullDate(member.departedDate)}`
                    : isDeparted && member.departedDate && member.joinedDate
                    ? `${formatFullDate(member.joinedDate)} — ${formatFullDate(member.departedDate)} (tracked)`
                    : member.orgJoinedDate
                    ? `Joined ${formatFullDate(member.orgJoinedDate)}`
                    : `Tracked since ${formatFullDate(member.joinedDate)}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = email;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="relative flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
      title="Click to copy email"
    >
      <Mail className="h-3.5 w-3.5" />
      <span>{email}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </span>
      <span
        className={`absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-foreground text-background text-[10px] font-mono font-bold whitespace-nowrap transition-all duration-300 pointer-events-none ${
          copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        }`}
      >
        Copied!
      </span>
    </button>
  );
}
