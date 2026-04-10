"use client";

import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { SlideOver } from "@/components/shared/slide-over";
import { AddBoardPanel } from "./add-board-panel";

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

  const refreshBoards = async () => {
    const res = await fetch("/api/boards");
    if (res.ok) {
      const data = await res.json();
      setBoards(data);
    }
  };

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
        <AddBoardPanel
          onBoardAdded={() => {
            setShowAddPanel(false);
            refreshBoards();
          }}
        />
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
