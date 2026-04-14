"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  UserCircle,
  PieChart,
  Settings,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  BarChart3,
  Calendar,
  UserCircle,
  PieChart,
  ShieldCheck,
  Settings,
};

interface NavItemConfig {
  href: string;
  icon: string;
  label: string;
}

interface SidebarNavProps {
  mainItems: NavItemConfig[];
  systemItems: NavItemConfig[];
}

export function SidebarNav({ mainItems, systemItems }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
      <div>
        <h4 className="mb-4 px-2 text-xs font-semibold tracking-widest text-slate-500 uppercase font-mono">
          Main
        </h4>
        <nav className="space-y-1">
          {mainItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={pathname.startsWith(item.href)}
            />
          ))}
        </nav>
      </div>

      {systemItems.length > 0 && (
        <div>
          <h4 className="mb-4 px-2 text-xs font-semibold tracking-widest text-slate-500 uppercase font-mono">
            System
          </h4>
          <nav className="space-y-1">
            {systemItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                isActive={pathname.startsWith(item.href)}
              />
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  isActive,
}: {
  href: string;
  icon: string;
  label: string;
  isActive: boolean;
}) {
  const Icon = iconMap[icon] || LayoutDashboard;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-4 py-3 text-sm uppercase tracking-widest transition-all duration-200",
        isActive
          ? "text-[#FF8400] font-bold border-r-2 border-[#FF8400] bg-white/5"
          : "text-slate-400 font-medium hover:bg-white/5",
      )}
    >
      <Icon size={20} />
      <span className="text-xs">{label}</span>
    </Link>
  );
}
