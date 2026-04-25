"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { User, Settings, ExternalLink, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileDropdownProps {
  userName: string;
  userEmail: string;
  userRole: string;
  userImage?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  src,
  name,
  size = 32,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(name);
  const sizeClass = size === 44 ? "h-11 w-11 text-sm" : "h-8 w-8 text-xs";

  if (src && !imgError) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={cn(
          sizeClass,
          "rounded-full object-cover shrink-0 ring-2 ring-primary/20",
        )}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        sizeClass,
        "rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold font-mono shrink-0 ring-2 ring-primary/20",
      )}
    >
      {initials}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProfileDropdown({
  userName,
  userEmail,
  userRole,
  userImage,
}: ProfileDropdownProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const isAdmin = userRole === "admin";

  // Resolve the current user's member ID by email (for "My Profile" link)
  useEffect(() => {
    async function resolveMemberId() {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(userEmail)}`);
        if (!res.ok) return;
        const data = await res.json();
        const match = data.members?.find(
          (m: { email: string; id: string }) => m.email === userEmail,
        );
        if (match) setMemberId(match.id);
      } catch {
        // Silent fail — "My Profile" just won't navigate
      }
    }

    resolveMemberId();
  }, [userEmail]);

  // ── Click outside + Escape ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  function navigate(href: string) {
    setIsOpen(false);
    router.push(href);
  }

  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL || "#";

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger ───────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Open profile menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          "rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isOpen ? "opacity-80" : "hover:opacity-80",
        )}
        suppressHydrationWarning
      >
        <Avatar src={userImage} name={userName} size={32} />
      </button>

      {/* ── Dropdown Panel ────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Profile menu"
          className={cn(
            "absolute right-0 top-full mt-2 z-50 w-[280px]",
            "bg-popover/95 backdrop-blur-xl",
            "ring-1 ring-foreground/10 shadow-2xl rounded-xl",
            "overflow-hidden",
          )}
        >
          {/* Profile section */}
          <div className="px-4 pt-4 pb-3 flex items-center gap-3">
            <Avatar src={userImage} name={userName} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">
                {userName}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {userEmail}
              </p>
              <span
                className={cn(
                  "inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide",
                  isAdmin
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {isAdmin ? "Admin" : "User"}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-foreground/5 mx-1" />

          {/* Menu items */}
          <div className="py-2 px-1">
            <button
              onClick={() => memberId && navigate(`/members/${memberId}`)}
              disabled={!memberId}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                "hover:bg-accent text-foreground",
                "focus-visible:outline-none focus-visible:bg-accent",
                !memberId && "opacity-50 cursor-not-allowed",
              )}
            >
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>My Profile</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => navigate("/settings")}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  "hover:bg-accent text-foreground",
                  "focus-visible:outline-none focus-visible:bg-accent",
                )}
              >
                <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Settings</span>
              </button>
            )}

            <a
              href={jiraBaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsOpen(false)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                "hover:bg-accent text-foreground",
                "focus-visible:outline-none focus-visible:bg-accent",
              )}
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>Open JIRA</span>
            </a>
          </div>

          {/* Divider */}
          <div className="h-px bg-foreground/5 mx-1" />

          {/* Sign out */}
          <div className="py-2 px-1">
            <form action={logout} onSubmit={() => setIsOpen(false)}>
              <button
                type="submit"
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  "hover:bg-destructive/10 text-destructive",
                  "focus-visible:outline-none focus-visible:bg-destructive/10",
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sign Out</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
