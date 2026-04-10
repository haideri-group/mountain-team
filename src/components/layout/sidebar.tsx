import Link from "next/link";
import { Users, LayoutDashboard, Briefcase, Calendar, FolderGit2, CheckSquare, Settings, UserCircle, PieChart, ChevronDown } from "lucide-react";
import { auth } from "@/auth";

export async function Sidebar() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const userEmail = session?.user?.email || "guest@tilemountain.co.uk";
  const userName = session?.user?.name || "Guest User";

  return (
    <div className="w-[280px] h-full bg-sidebar flex flex-col border-r border-sidebar-border">
      {/* Header */}
      <div className="h-[88px] flex items-center px-6 border-b border-sidebar-border shrink-0">
        <Link href="/overview" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Users className="h-6 w-6" />
          </div>
          <span className="font-mono text-xl font-bold tracking-tight text-sidebar-foreground">TEAMFLOW</span>
        </Link>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
        <div>
          <h4 className="mb-4 px-2 text-xs font-semibold tracking-widest text-muted uppercase font-mono">Main</h4>
          <nav className="space-y-1">
            <NavItem href="/overview" icon={<LayoutDashboard size={24} />} label="Overview" />
            <NavItem href="/calendar" icon={<Calendar size={24} />} label="Calendar" />
            <NavItem href="/members" icon={<UserCircle size={24} />} label="Members" />
          </nav>
        </div>

        {isAdmin && (
          <div>
            <h4 className="mb-4 px-2 text-xs font-semibold tracking-widest text-muted uppercase font-mono">System</h4>
            <nav className="space-y-1">
              <NavItem href="/settings" icon={<Settings size={24} />} label="Settings" />
            </nav>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent transition-colors">
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium text-sidebar-foreground truncate w-40 text-left">{userName}</span>
            <span className="text-xs text-muted truncate w-40 text-left">{userEmail}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  // Simple active state check representation
  const isActive = false;
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-full px-4 py-3 text-sm transition-colors ${
        isActive 
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
