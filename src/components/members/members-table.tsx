"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { Search, RefreshCw, Loader2, Pencil, Check, X } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterSelect } from "@/components/shared/filter-select";
import {
  MembersTablePagination,
  type PageSize,
} from "@/components/members/members-table-pagination";
import Link from "next/link";

interface DirectorySuggestion {
  name: string;
  email: string;
  photo: string | null;
}

interface Member {
  id: string;
  displayName: string;
  email: string | null;
  role: string | null;
  status: "active" | "on_leave" | "departed";
  jiraAccountId: string;
  joinedDate: string | null;
  departedDate: string | null;
  capacity: number | null;
  color: string | null;
  avatarUrl: string | null;
  teamName: string | null;
}

interface ApiResponse {
  members: Member[];
  totalCount: number;
  metrics: { active: number; onLeave: number; departed: number; total: number };
  teamOptions: string[];
  page: number;
  pageSize: number;
  totalPages: number;
}

interface MembersTableProps {
  isAdmin: boolean;
}

export function MembersTable({ isAdmin }: MembersTableProps) {
  // Filters & pagination state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);

  // Data from API
  const [members, setMembers] = useState<Member[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [metrics, setMetrics] = useState({ active: 0, onLeave: 0, departed: 0, total: 0 });
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    added: number;
    departed: number;
    updated: number;
  } | null>(null);

  // Email editing state
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [suggestions, setSuggestions] = useState<DirectorySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // --- Data fetching ---

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (teamFilter !== "all") params.set("team", teamFilter);

      const res = await fetch(`/api/team?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");

      const data: ApiResponse = await res.json();
      setMembers(data.members);
      setTotalCount(data.totalCount);
      setMetrics(data.metrics);
      setTeamOptions(data.teamOptions);
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, teamFilter]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // --- Filter handlers (reset page to 1) ---

  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleTeamFilterChange = (value: string) => {
    setTeamFilter(value);
    setPage(1);
  };

  // --- Sync ---

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const res = await fetch("/api/sync/team-members", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      setSyncResult({
        added: data.added,
        departed: data.departed,
        updated: data.updated,
      });
      // Re-fetch current page
      fetchMembers();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // --- Email editing with Google autocomplete ---

  const searchDirectory = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);
    try {
      const res = await fetch(
        `/api/google/directory-search?q=${encodeURIComponent(query)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.results || []);
        setShowSuggestions(data.results?.length > 0);
        setSelectedIndex(-1);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const handleEmailInputChange = (value: string) => {
    setEditEmailValue(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchDirectory(value), 300);
  };

  const selectSuggestion = (suggestion: DirectorySuggestion) => {
    setEditEmailValue(suggestion.email);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleEmailSave = async (memberId: string) => {
    const res = await fetch(`/api/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: editEmailValue || null }),
    });

    if (res.ok) {
      setMembers(
        members.map((m) =>
          m.id === memberId ? { ...m, email: editEmailValue || null } : m,
        ),
      );
      // Avatar will be synced in background by the API — refresh after a few seconds
      if (editEmailValue) {
        setTimeout(() => fetchMembers(), 5000);
      }
    }
    setEditingEmailId(null);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const startEditingEmail = (member: Member) => {
    setEditingEmailId(member.id);
    setEditEmailValue(member.email || "");
    setSuggestions([]);
    setShowSuggestions(false);
    setTimeout(() => searchDirectory(member.displayName), 100);
  };

  // --- Helpers ---

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Members", value: metrics.active, color: "text-emerald-600" },
          { label: "On Leave", value: metrics.onLeave, color: "text-amber-600" },
          { label: "Departed", value: metrics.departed, color: "text-gray-500" },
          { label: "Total (All Time)", value: metrics.total, color: "text-foreground" },
        ].map((metric) => (
          <div key={metric.label} className="bg-card rounded-xl p-5 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{metric.label}</p>
            <p className={`text-2xl font-bold font-mono ${metric.color}`}>{metric.value}</p>
          </div>
        ))}
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20">
          <span className="text-xs font-bold font-mono text-emerald-700 dark:text-emerald-400">
            Sync complete:
          </span>
          <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
            +{syncResult.added} added, {syncResult.departed} departed,{" "}
            {syncResult.updated} updated
          </span>
        </div>
      )}

      {syncError && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/20">
          <span className="text-xs font-bold text-red-700 dark:text-red-400">Sync failed:</span>
          <span className="text-xs text-red-600 dark:text-red-400/80">{syncError}</span>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-card rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                defaultValue={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search members..."
                className="w-full h-9 pl-9 pr-4 rounded-full bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>
            <FilterSelect
              value={statusFilter}
              onChange={handleStatusFilterChange}
              options={[
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "on_leave", label: "On Leave" },
                { value: "departed", label: "Departed" },
              ]}
            />
            {teamOptions.length > 0 && (
              <FilterSelect
                value={teamFilter}
                onChange={handleTeamFilterChange}
                options={[
                  { value: "all", label: "All Teams" },
                  ...teamOptions.map((t) => ({ value: t, label: t })),
                ]}
              />
            )}
          </div>

          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-5 h-9 rounded-full text-sm font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #944a00, #ff8400)" }}
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? "Syncing..." : "Sync from JIRA"}
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto relative">
          {/* Loading overlay */}
          {loading && members.length > 0 && (
            <div className="absolute inset-0 bg-card/60 z-10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Initial loading */}
          {loading && members.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-3 text-sm text-muted-foreground">Loading members...</span>
            </div>
          )}

          {!loading && members.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-muted-foreground text-sm">No members found</p>
            </div>
          )}

          {members.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">Member</th>
                  <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground hidden md:table-cell">Role</th>
                  <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Capacity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {members.map((member) => (
                  <tr
                    key={member.id}
                    className={`hover:bg-muted/20 transition-colors ${member.status === "departed" ? "opacity-50" : ""}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Link href={`/members/${member.id}`} className="shrink-0">
                          {member.avatarUrl ? (
                            <Image src={member.avatarUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div
                              className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ backgroundColor: member.color || "#6b7280" }}
                            >
                              {getInitials(member.displayName)}
                            </div>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/members/${member.id}`} className="group">
                            <p className="text-sm font-semibold font-mono truncate group-hover:text-primary transition-colors">
                              {member.displayName}
                            </p>
                          </Link>
                          {editingEmailId === member.id ? (
                            <div className="relative mt-0.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="email"
                                  value={editEmailValue}
                                  onChange={(e) => handleEmailInputChange(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                                        selectSuggestion(suggestions[selectedIndex]);
                                      } else {
                                        handleEmailSave(member.id);
                                      }
                                    }
                                    if (e.key === "Escape") {
                                      if (showSuggestions) setShowSuggestions(false);
                                      else setEditingEmailId(null);
                                    }
                                    if (e.key === "ArrowDown") {
                                      e.preventDefault();
                                      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
                                    }
                                    if (e.key === "ArrowUp") {
                                      e.preventDefault();
                                      setSelectedIndex((i) => Math.max(i - 1, -1));
                                    }
                                  }}
                                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                  className="h-6 w-56 px-2 rounded bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  placeholder="Search by name or type email..."
                                  autoFocus
                                />
                                {loadingSuggestions && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                <button onClick={() => handleEmailSave(member.id)} className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => { setEditingEmailId(null); setShowSuggestions(false); }} className="p-0.5 rounded text-muted-foreground hover:bg-muted/30">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {showSuggestions && suggestions.length > 0 && (
                                <div ref={suggestionsRef} className="absolute left-0 top-7 z-50 w-72 rounded-lg bg-popover shadow-lg ring-1 ring-foreground/10 overflow-hidden">
                                  {suggestions.map((s, i) => (
                                    <button
                                      key={s.email}
                                      onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                                      className={`flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors ${
                                        i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                                      }`}
                                    >
                                      {s.photo ? (
                                        <Image src={s.photo} alt="" width={24} height={24} unoptimized referrerPolicy="no-referrer" className="h-6 w-6 rounded-full shrink-0" />
                                      ) : (
                                        <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center text-[9px] font-bold font-mono text-muted-foreground shrink-0">
                                          {s.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium truncate">{s.name}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 mt-0.5 group/email">
                              <p className="text-xs text-muted-foreground truncate">
                                {member.email || "No email"}
                              </p>
                              {isAdmin && (
                                <button
                                  onClick={() => startEditingEmail(member)}
                                  className="p-0.5 rounded text-muted-foreground/0 group-hover/email:text-muted-foreground hover:bg-muted/30 transition-all"
                                  title="Edit email"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="text-sm">{member.role || "—"}</span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={member.status} />
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="text-xs font-mono text-muted-foreground">{member.capacity ?? 10} pts</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <MembersTablePagination
            totalCount={totalCount}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </div>
    </div>
  );
}
