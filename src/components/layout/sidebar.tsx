import Link from "next/link";
import { Users, LayoutDashboard, Calendar, Settings, UserCircle, PieChart } from "lucide-react";
import { auth } from "@/auth";
import { SidebarNav } from "./sidebar-nav";

export async function Sidebar() {
  const session = await auth();

  if (!session) return null;

  const isAdmin = session?.user?.role === "admin";
  const userEmail = session?.user?.email;
  const userName = session?.user?.name;

  // Releases is shown in the nav to admins only for now — the page itself
  // is still reachable by URL for any logged-in user. Intent: don't
  // advertise the feature to the wider team until the team-lead workflow
  // (readiness signals, notification triage, pre-release checklist) has
  // settled in real use.
  const mainItems = [
    { href: "/overview", icon: "LayoutDashboard", label: "Overview" },
    { href: "/calendar", icon: "Calendar", label: "Calendar" },
    { href: "/members", icon: "UserCircle", label: "Members" },
    { href: "/workload", icon: "BarChart3", label: "Workload" },
    { href: "/deployments", icon: "Rocket", label: "Deployments" },
    ...(isAdmin ? [{ href: "/releases", icon: "Package", label: "Releases" }] : []),
    { href: "/reports", icon: "PieChart", label: "Reports" },
  ];

  const systemItems = isAdmin
    ? [
        { href: "/users", icon: "ShieldCheck", label: "Users" },
        { href: "/automations", icon: "ScrollText", label: "Automations" },
        { href: "/settings", icon: "Settings", label: "Settings" },
      ]
    : [];

  return (
    <div className="w-[280px] h-full bg-sidebar flex flex-col">
      {/* Header */}
      <div className="h-[88px] flex items-center px-6 shrink-0">
        <Link href="/overview" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Users className="h-6 w-6" />
          </div>
          <span className="font-mono text-xl font-bold tracking-tight text-sidebar-foreground">TEAMFLOW</span>
        </Link>
      </div>

      {/* Nav — Client Component for active state */}
      <SidebarNav mainItems={mainItems} systemItems={systemItems} />

      {/* Footer */}
      <div className="p-4">
        <div className="flex w-full items-center gap-3 rounded-lg p-2">
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium text-sidebar-foreground truncate w-40 text-left">{userName}</span>
            <span className="text-xs text-muted truncate w-40 text-left">{userEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
