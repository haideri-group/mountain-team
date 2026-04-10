"use client";

import { useState } from "react";
import { Plus, X, Trash2, Eye, EyeOff } from "lucide-react";
import { SlideOver } from "@/components/shared/slide-over";

interface Board {
  id: string;
  jiraKey: string;
  name: string;
  color: string | null;
  description: string | null;
  isTracked: boolean | null;
}

interface BoardsManagerProps {
  boards: Board[];
}

export function BoardsManager({ boards: initialBoards }: BoardsManagerProps) {
  const [boards, setBoards] = useState(initialBoards);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  // Add board form state
  const [form, setForm] = useState({
    jiraKey: "",
    name: "",
    color: "#ff8400",
    description: "",
  });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const tracked = boards.filter((b) => b.isTracked);
  const untracked = boards.filter((b) => !b.isTracked);

  const toggleTracking = async (board: Board) => {
    setLoading(board.id);
    try {
      const res = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTracked: !board.isTracked }),
      });
      if (res.ok) {
        setBoards(boards.map((b) => (b.id === board.id ? { ...b, isTracked: !b.isTracked } : b)));
      }
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (board: Board) => {
    if (!confirm(`Delete project "${board.name}" (${board.jiraKey})? This cannot be undone.`))
      return;

    const res = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
    if (res.ok) {
      setBoards(boards.filter((b) => b.id !== board.id));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.jiraKey.trim() || !form.name.trim()) {
      setFormError("JIRA Key and Project Name are required");
      return;
    }

    setFormLoading(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, isTracked: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add board");
      }

      const data = await res.json();

      setBoards([
        ...boards,
        {
          id: data.id,
          jiraKey: form.jiraKey.toUpperCase(),
          name: form.name,
          color: form.color,
          description: form.description || null,
          isTracked: true,
        },
      ]);
      setForm({ jiraKey: "", name: "", color: "#ff8400", description: "" });
      setShowAddPanel(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tracked Projects */}
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5">
          <div>
            <h3 className="text-base font-bold font-mono">Tracked Projects</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tasks from these JIRA boards are being monitored for your team
            </p>
          </div>
          <button
            onClick={() => setShowAddPanel(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-full text-sm font-bold font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Project
          </button>
        </div>

        {tracked.length === 0 ? (
          <div className="px-5 pb-5">
            <div className="rounded-lg bg-muted/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No projects being tracked yet. Add a JIRA project to get started.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-3">
            {tracked.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                loading={loading === board.id}
                onToggle={() => toggleTracking(board)}
                onDelete={() => handleDelete(board)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Untracked Projects */}
      {untracked.length > 0 && (
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="p-5">
            <h3 className="text-base font-bold font-mono">Available Projects</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              These projects exist but are not being tracked
            </p>
          </div>
          <div className="px-5 pb-5 space-y-3">
            {untracked.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                loading={loading === board.id}
                onToggle={() => toggleTracking(board)}
                onDelete={() => handleDelete(board)}
                dimmed
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Project Panel */}
      <SlideOver open={showAddPanel} onClose={() => setShowAddPanel(false)} title="Add JIRA Project">
        <form onSubmit={handleAdd} className="flex flex-col h-full">
          <div className="flex-1 px-6 py-5 space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Add a JIRA board/project to track its tasks for your team members.
            </p>

            {formError && (
              <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                JIRA Board Key *
              </label>
              <input
                type="text"
                value={form.jiraKey}
                onChange={(e) => setForm({ ...form, jiraKey: e.target.value.toUpperCase() })}
                placeholder="e.g. PROD, BUTTERFLY, EAGLE"
                className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                required
              />
              <p className="text-xs text-muted-foreground">
                This must match the JIRA board key exactly (e.g., tasks will be PROD-1234)
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                Project Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Production Board, Social Logins"
                className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of the project..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
                Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-10 w-10 rounded-lg cursor-pointer border-0"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-28 h-10 px-3 rounded-lg bg-muted/30 border-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
                <p className="text-xs text-muted-foreground">Used for task bars on calendar</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              type="button"
              onClick={() => setShowAddPanel(false)}
              className="px-5 h-10 rounded-lg text-sm font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-bold font-mono uppercase tracking-wider bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90 shadow-lg transition-all disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {formLoading ? "Adding..." : "Add Project"}
            </button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}

function BoardCard({
  board,
  loading,
  onToggle,
  onDelete,
  dimmed = false,
}: {
  board: Board;
  loading: boolean;
  onToggle: () => void;
  onDelete: () => void;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border border-border/50 transition-all ${dimmed ? "opacity-50" : "hover:bg-muted/10"}`}
    >
      {/* Color dot */}
      <div
        className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-bold font-mono"
        style={{ backgroundColor: board.color || "#6b7280" }}
      >
        {board.jiraKey.substring(0, 2)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono">{board.jiraKey}</span>
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm truncate">{board.name}</span>
        </div>
        {board.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{board.description}</p>
        )}
      </div>

      {/* Tracking badge */}
      <span
        className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-full ${
          board.isTracked
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        }`}
      >
        {board.isTracked ? "Tracked" : "Not Tracked"}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          disabled={loading}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
          title={board.isTracked ? "Stop tracking" : "Start tracking"}
        >
          {board.isTracked ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
