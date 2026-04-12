"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsDropdown } from "./notifications-dropdown";
import { ProfileDropdown } from "./profile-dropdown";
import { GlobalSearch } from "./global-search";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopbarProps {
  userName: string;
  userEmail: string;
  userRole: string;
  userImage?: string | null;
  isLoggedIn?: boolean;
}

// ─── Title mapping ────────────────────────────────────────────────────────────

function getPageTitle(pathname: string): string {
  if (pathname === "/overview") return "Team Overview";
  if (pathname === "/calendar") return "Calendar";
  if (pathname === "/workload") return "Workload";
  if (pathname === "/reports") return "Reports";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/members") return "Members";
  if (pathname.startsWith("/members/")) return "Member Profile";
  if (pathname.startsWith("/issue/")) return "Issue Detail";
  return "TeamFlow";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Topbar({
  userName,
  userEmail,
  userRole,
  userImage,
  isLoggedIn = true,
}: TopbarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <div className="h-16 flex items-center justify-between px-6 bg-card shrink-0">
      {/* Left: Title + Search */}
      <div className="flex items-center gap-5 flex-1 min-w-0">
        <h1 className="text-xl font-bold font-mono uppercase tracking-wider text-foreground shrink-0 select-none">
          {title}
        </h1>
        {isLoggedIn && <GlobalSearch />}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0 ml-4">
        <ThemeToggle />
        {isLoggedIn ? (
          <>
            <NotificationsDropdown />
            <div
              className="w-px h-5 bg-foreground/10 mx-1"
              aria-hidden="true"
            />
            <ProfileDropdown
              userName={userName}
              userEmail={userEmail}
              userRole={userRole}
              userImage={userImage}
            />
          </>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold font-mono uppercase tracking-wider text-white ml-2"
            style={{
              background: "linear-gradient(135deg, #944a00, #ff8400)",
            }}
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </Link>
        )}
      </div>
    </div>
  );
}
