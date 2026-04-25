"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Search, Loader2, ShieldCheck, UserX, UserCheck, Users, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterSelect } from "@/components/shared/filter-select";

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  avatarUrl: string | null;
  isActive: boolean;
  hasPassword: boolean;
  isGoogleOAuth: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
}

interface UsersApiResponse {
  users: AppUser[];
  totalCount: number;
  metrics: { total: number; admins: number; regularUsers: number; deactivated: number };
  page: number;
  pageSize: number;
  totalPages: number;
}

interface UsersTableProps {
  currentUserId: string;
}

const SUPER_ADMIN_EMAIL = "syed.haider@ki5.co.uk";
const PAGE_SIZES = [10, 20, 50];

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function UsersTable({ currentUserId }: UsersTableProps) {
  const [data, setData] = useState<UsersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set("search", search);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/users?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => {}, 300));
  };

  const handleRoleChange = async (user: AppUser) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!confirm(`Change ${user.name || user.email} from "${user.role}" to "${newRole}"?`)) return;

    setUpdatingId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update role");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (user: AppUser) => {
    const action = user.isActive ? "deactivate" : "activate";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${user.name || user.email}?${!user.isActive ? "" : " They will not be able to log in."}`)) return;

    setUpdatingId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update status");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const metrics = data?.metrics || { total: 0, admins: 0, regularUsers: 0, deactivated: 0 };
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: metrics.total, icon: Users, color: "text-foreground" },
          { label: "Admins", value: metrics.admins, icon: ShieldCheck, color: "text-primary" },
          { label: "Users", value: metrics.regularUsers, icon: Shield, color: "text-muted-foreground" },
          { label: "Deactivated", value: metrics.deactivated, icon: UserX, color: "text-red-500" },
        ].map((card) => (
          <div key={card.label} className="bg-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                {card.label}
              </span>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className={`text-3xl font-bold font-mono ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-card rounded-xl overflow-hidden">
        {/* Header + Filters */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold font-mono">Application Users</h3>
            <span className="text-xs text-muted-foreground font-mono">
              {data?.totalCount || 0} total
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>

            {/* Role filter */}
            <FilterSelect
              value={roleFilter}
              onChange={(v) => { setRoleFilter(v); setPage(1); }}
              align="right"
              options={[
                { value: "all", label: "All Roles" },
                { value: "admin", label: "Admin" },
                { value: "user", label: "User" },
              ]}
            />

            {/* Status filter */}
            <FilterSelect
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1); }}
              align="right"
              options={[
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "deactivated", label: "Deactivated" },
              ]}
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading users...</span>
          </div>
        ) : !data?.users.length ? (
          <div className="px-5 pb-8 text-center text-sm text-muted-foreground py-12">
            No users found{search ? ` matching "${search}"` : ""}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/20">
                  <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                    User
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[100px]">
                    Role
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[140px]">
                    Status
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[120px]">
                    Last Login
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground w-[120px]">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
                  const isUpdating = updatingId === user.id;

                  return (
                    <tr
                      key={user.id}
                      className={cn(
                        "border-t border-border/30 transition-colors",
                        !user.isActive && "opacity-50",
                        "hover:bg-muted/5",
                      )}
                    >
                      {/* User */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {user.avatarUrl ? (
                            <Image
                              src={user.avatarUrl}
                              alt=""
                              width={36}
                              height={36}
                              unoptimized
                              className="h-9 w-9 rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-muted/50 flex items-center justify-center text-xs font-bold font-mono text-muted-foreground">
                              {getInitials(user.name, user.email)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">
                                {user.name || "—"}
                              </p>
                              {isSuperAdmin && (
                                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase">
                                  Owner
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email}
                              </p>
                              {/* Google OAuth icon */}
                              {user.isGoogleOAuth && (
                                <span title="Google OAuth" className="shrink-0">
                                  <svg className="h-3 w-3" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 01-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                  </svg>
                                </span>
                              )}
                              {/* Key icon — shown if user has password credentials */}
                              {user.hasPassword && (
                                <span title="Password credentials" className="shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/>
                                    <path d="m21 2-9.6 9.6"/>
                                    <circle cx="7.5" cy="15.5" r="5.5"/>
                                  </svg>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleRoleChange(user)}
                          disabled={isUpdating || isSuperAdmin}
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide transition-all",
                            user.role === "admin"
                              ? "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                            !isSuperAdmin && "cursor-pointer hover:ring-2 hover:ring-primary/20",
                            isSuperAdmin && "cursor-not-allowed",
                          )}
                          title={isSuperAdmin ? "System owner — cannot change role" : `Click to change to ${user.role === "admin" ? "user" : "admin"}`}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            user.role
                          )}
                        </button>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide",
                              user.isActive
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                : "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
                            )}
                          >
                            {user.isActive ? "Active" : "Deactivated"}
                          </span>
                          {!isSuperAdmin && (
                            <button
                              onClick={() => handleToggleActive(user)}
                              disabled={isUpdating || (isSelf && user.isActive)}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                isSelf && user.isActive
                                  ? "text-muted-foreground/30 cursor-not-allowed"
                                  : user.isActive
                                    ? "text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
                              )}
                              title={
                                isSelf && user.isActive
                                  ? "Cannot deactivate yourself"
                                  : user.isActive
                                    ? "Deactivate user"
                                    : "Activate user"
                              }
                            >
                              {user.isActive ? (
                                <UserX className="h-3.5 w-3.5" />
                              ) : (
                                <UserCheck className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Last Login */}
                      <td className="px-5 py-4">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatDate(user.lastLoginAt)}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="px-5 py-4">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="px-5 py-4 flex items-center justify-between border-t border-border/30">
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="h-8 px-2 rounded-lg bg-muted/30 text-xs font-mono appearance-none cursor-pointer focus:outline-none pr-6"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 4px center",
                }}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s} per page</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data.totalCount)} of {data.totalCount} users
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-mono hover:bg-muted/30 disabled:opacity-30 transition-colors"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page < 3) pageNum = i + 1;
                else if (page > totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "h-8 w-8 rounded-lg text-xs font-mono transition-colors",
                      page === pageNum
                        ? "text-white"
                        : "hover:bg-muted/30 text-muted-foreground",
                    )}
                    style={
                      page === pageNum
                        ? { background: "linear-gradient(135deg, #944a00, #ff8400)" }
                        : undefined
                    }
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-mono hover:bg-muted/30 disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
