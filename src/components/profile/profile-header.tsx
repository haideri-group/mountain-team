"use client";

import { Mail, Calendar, UserX, ExternalLink, Users } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import type { MemberStatus } from "@/types";

interface ProfileHeaderProps {
  member: {
    displayName: string;
    email: string | null;
    role: string | null;
    status: MemberStatus;
    avatarUrl: string | null;
    joinedDate: string | null;
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

function formatFullDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "long",
    day: "numeric",
    year: "numeric",
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
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {member.email}
                </span>
              )}
              {member.joinedDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {isDeparted && member.departedDate
                    ? `${formatFullDate(member.joinedDate)} — ${formatFullDate(member.departedDate)}`
                    : `Joined ${formatFullDate(member.joinedDate)}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
