"use client";

import { useState } from "react";
import { Search, UserPlus, Trash2, Edit, MoreVertical } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { SlideOver } from "@/components/shared/slide-over";
import { AddMemberForm } from "./add-member-form";

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
}

interface MembersTableProps {
  members: Member[];
  isAdmin: boolean;
}

export function MembersTable({ members: initialMembers, isAdmin }: MembersTableProps) {
  const [members, setMembers] = useState(initialMembers);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");

  const refreshMembers = async () => {
    const res = await fetch("/api/team");
    if (res.ok) {
      const data = await res.json();
      setMembers(data);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}?`)) return;

    const res = await fetch(`/api/team/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMembers(members.filter((m) => m.id !== id));
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const body: Record<string, string | null> = { status: newStatus };
    if (newStatus === "departed") {
      body.departedDate = new Date().toISOString().split("T")[0];
    }
    if (newStatus === "active") {
      body.departedDate = null;
    }

    const res = await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setMembers(
        members.map((m) =>
          m.id === id
            ? { ...m, status: newStatus as Member["status"], departedDate: body.departedDate ?? m.departedDate }
            : m,
        ),
      );
      setEditingId(null);
    }
  };

  const filtered = members.filter((m) => {
    const matchSearch =
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.jiraAccountId.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || m.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount = members.filter((m) => m.status === "active").length;
  const onLeaveCount = members.filter((m) => m.status === "on_leave").length;
  const departedCount = members.filter((m) => m.status === "departed").length;

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
          { label: "Active Members", value: activeCount, color: "text-emerald-600" },
          { label: "On Leave", value: onLeaveCount, color: "text-amber-600" },
          { label: "Departed", value: departedCount, color: "text-gray-500" },
          { label: "Total (All Time)", value: members.length, color: "text-foreground" },
        ].map((metric) => (
          <div key={metric.label} className="bg-card rounded-xl p-5 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{metric.label}</p>
            <p className={`text-2xl font-bold font-mono ${metric.color}`}>{metric.value}</p>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-card rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full h-9 pl-9 pr-4 rounded-full bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-full bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all appearance-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="on_leave">On Leave</option>
              <option value="departed">Departed</option>
            </select>
          </div>

          {isAdmin && (
            <button
              onClick={() => setShowAddPanel(true)}
              className="flex items-center gap-2 px-4 h-9 rounded-full text-sm font-bold font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
            >
              <UserPlus className="h-4 w-4" />
              Add Member
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Member
                </th>
                <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                  Role
                </th>
                <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                  JIRA ID
                </th>
                <th className="text-left px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                  Joined
                </th>
                {isAdmin && (
                  <th className="text-right px-5 py-3 text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((member) => (
                <tr
                  key={member.id}
                  className={`hover:bg-muted/20 transition-colors ${member.status === "departed" ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: member.color || "#6b7280" }}
                      >
                        {getInitials(member.displayName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold font-mono truncate">
                          {member.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email || "No email"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <span className="text-sm">{member.role || "—"}</span>
                  </td>
                  <td className="px-5 py-4">
                    {editingId === member.id ? (
                      <select
                        value={editStatus}
                        onChange={(e) => {
                          handleStatusChange(member.id, e.target.value);
                        }}
                        className="h-8 px-2 rounded-lg bg-muted/30 border-transparent text-xs focus:outline-none"
                        autoFocus
                        onBlur={() => setEditingId(null)}
                      >
                        <option value="active">Active</option>
                        <option value="on_leave">On Leave</option>
                        <option value="departed">Departed</option>
                      </select>
                    ) : (
                      <button
                        onClick={() => {
                          if (isAdmin) {
                            setEditingId(member.id);
                            setEditStatus(member.status);
                          }
                        }}
                        className={isAdmin ? "cursor-pointer" : "cursor-default"}
                      >
                        <StatusBadge status={member.status} />
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <span className="text-xs font-mono text-muted-foreground">
                      {member.jiraAccountId}
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell">
                    <span className="text-xs font-mono text-muted-foreground">
                      {member.joinedDate || "—"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleDelete(member.id, member.displayName)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-5 py-12 text-center">
                    <p className="text-muted-foreground text-sm">No members found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Panel */}
      <SlideOver open={showAddPanel} onClose={() => setShowAddPanel(false)} title="Add New Member">
        <AddMemberForm
          onSuccess={() => {
            setShowAddPanel(false);
            refreshMembers();
          }}
          onCancel={() => setShowAddPanel(false)}
        />
      </SlideOver>
    </div>
  );
}
