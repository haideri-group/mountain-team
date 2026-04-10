import { Bell, Search, LogOut } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { auth } from "@/auth";
import { logout } from "@/app/actions/auth";

export async function Topbar() {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const initials = session?.user?.name?.substring(0, 2).toUpperCase() || "U";

  return (
    <div className="h-16 flex items-center justify-between px-8 bg-card border-b border-border shrink-0">
      <div className="flex items-center gap-6 flex-1">
        <h1 className="text-xl font-bold font-mono">Team Overview</h1>

        {isLoggedIn && (
          <div className="relative w-64 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search tasks, members..."
              className="w-full h-9 pl-9 pr-4 rounded-full bg-input border-transparent text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />

        {isLoggedIn && (
          <>
            <button className="relative p-2 rounded-full hover:bg-accent transition-colors hidden sm:block">
              <Bell className="h-5 w-5 text-foreground" />
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
              </span>
            </button>

            <div className="flex items-center ml-2 border-l border-border pl-4 gap-4">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium text-xs shadow-sm">
                {initials}
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="text-muted hover:text-foreground transition-colors mt-1"
                  title="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
