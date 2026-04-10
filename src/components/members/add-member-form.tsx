"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

interface AddMemberFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function AddMemberForm({ onSuccess, onCancel }: AddMemberFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    jiraAccountId: "",
    role: "",
    status: "active" as "active" | "on_leave" | "departed",
    joinedDate: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.displayName.trim() || !form.jiraAccountId.trim()) {
      setError("Name and JIRA Account ID are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add member");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 px-6 py-5 space-y-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Add a team member to start tracking their JIRA tasks in TeamFlow.
        </p>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
            {error}
          </div>
        )}

        {/* JIRA Account ID */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
            JIRA Account ID *
          </label>
          <input
            type="text"
            value={form.jiraAccountId}
            onChange={(e) => setForm({ ...form, jiraAccountId: e.target.value })}
            placeholder="e.g. john.doe"
            className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            required
          />
          <p className="text-xs text-muted-foreground">
            Their JIRA username to link tasks
          </p>
        </div>

        {/* Full Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Full Name *
          </label>
          <input
            type="text"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="e.g. John Doe"
            className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            required
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="e.g. john@tilemountain.co.uk"
            className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Role
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all appearance-none"
          >
            <option value="">Select role...</option>
            <option value="Senior Frontend Developer">Senior Frontend Developer</option>
            <option value="Mid Frontend Developer">Mid Frontend Developer</option>
            <option value="Junior Frontend Developer">Junior Frontend Developer</option>
            <option value="Tech Lead">Tech Lead</option>
            <option value="UI/UX Designer">UI/UX Designer</option>
            <option value="QA Engineer">QA Engineer</option>
            <option value="DevOps Engineer">DevOps Engineer</option>
          </select>
        </div>

        {/* Joined Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Joined Date
          </label>
          <input
            type="date"
            value={form.joinedDate}
            onChange={(e) => setForm({ ...form, joinedDate: e.target.value })}
            className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Status
          </label>
          <div className="flex gap-2">
            {(["active", "on_leave", "departed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, status: s })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  form.status === s
                    ? s === "active"
                      ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-400"
                      : s === "on_leave"
                        ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-400"
                        : "bg-gray-200 text-gray-700 ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-400"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {s === "active" ? "Active" : s === "on_leave" ? "On Leave" : "Departed"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 h-10 rounded-lg text-sm font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-bold font-mono uppercase tracking-wider bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90 shadow-lg transition-all disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {loading ? "Adding..." : "Add Member"}
        </button>
      </div>
    </form>
  );
}
