"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Check, Loader2, AlertTriangle, Wifi, WifiOff } from "lucide-react";

interface JiraProject {
  key: string;
  name: string;
  type: string;
  avatarUrl: string | null;
  alreadyAdded: boolean;
  boardId: string | null;
}

interface AddBoardPanelProps {
  onBoardAdded: () => void;
}

// Random color for new boards
const boardColors = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

export function AddBoardPanel({ onBoardAdded }: AddBoardPanelProps) {
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  // Manual form state
  const [manualForm, setManualForm] = useState({ jiraKey: "", name: "", color: "#ff8400", description: "" });
  const [manualError, setManualError] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jira/projects");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch JIRA projects");
      }
      const data = await res.json();
      setJiraProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to JIRA");
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (project: JiraProject) => {
    setAdding(project.key);
    try {
      const color = boardColors[Math.floor(Math.random() * boardColors.length)];
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraKey: project.key,
          name: project.name,
          color,
          description: `${project.type} project from JIRA`,
          isTracked: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      // Update local state to show as added
      setJiraProjects(jiraProjects.map((p) =>
        p.key === project.key ? { ...p, alreadyAdded: true } : p,
      ));
      onBoardAdded();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add project");
    } finally {
      setAdding(null);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError("");
    if (!manualForm.jiraKey.trim() || !manualForm.name.trim()) {
      setManualError("JIRA Key and Name are required");
      return;
    }
    setManualLoading(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...manualForm, jiraKey: manualForm.jiraKey.toUpperCase(), isTracked: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setManualForm({ jiraKey: "", name: "", color: "#ff8400", description: "" });
      setShowManualForm(false);
      onBoardAdded();
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setManualLoading(false);
    }
  };

  const filtered = jiraProjects.filter(
    (p) =>
      p.key.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const available = filtered.filter((p) => !p.alreadyAdded);
  const alreadyTracked = filtered.filter((p) => p.alreadyAdded);

  // JIRA not configured — show manual form
  if (!loading && error?.includes("not configured")) {
    return (
      <div className="px-6 py-5 space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
          <WifiOff className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">JIRA not connected</p>
            <p className="text-xs mt-0.5 opacity-80">
              Add JIRA_BASE_URL, JIRA_USER_EMAIL, and JIRA_API_TOKEN to your .env file to fetch projects automatically.
            </p>
          </div>
        </div>
        <ManualForm
          form={manualForm}
          setForm={setManualForm}
          error={manualError}
          loading={manualLoading}
          onSubmit={handleManualAdd}
        />
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Fetching projects from JIRA...</span>
      </div>
    );
  }

  // JIRA error (not config related)
  if (error) {
    return (
      <div className="px-6 py-5 space-y-5">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Failed to connect to JIRA</p>
            <p className="text-xs mt-0.5 opacity-80">{error}</p>
          </div>
        </div>
        <button
          onClick={fetchProjects}
          className="text-sm text-primary font-medium hover:underline"
        >
          Retry
        </button>
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => setShowManualForm(!showManualForm)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Or add manually →
          </button>
          {showManualForm && (
            <div className="mt-4">
              <ManualForm
                form={manualForm}
                setForm={setManualForm}
                error={manualError}
                loading={manualLoading}
                onSubmit={handleManualAdd}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // JIRA connected — show project list
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <Wifi className="h-4 w-4" />
          <span className="text-xs font-semibold font-mono uppercase tracking-wider">Connected to JIRA</span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full h-10 pl-9 pr-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5">
        {/* Available projects */}
        {available.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
              Available ({available.length})
            </p>
            {available.map((project) => (
              <div
                key={project.key}
                className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-muted/10 transition-all"
              >
                {project.avatarUrl ? (
                  <img src={project.avatarUrl} alt="" className="h-9 w-9 rounded-lg" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-muted/30 flex items-center justify-center text-xs font-bold font-mono text-muted-foreground">
                    {project.key.substring(0, 2)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold font-mono">{project.key}</p>
                  <p className="text-xs text-muted-foreground truncate">{project.name}</p>
                </div>
                <button
                  onClick={() => handleTrack(project)}
                  disabled={adding === project.key}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
                >
                  {adding === project.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Track
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Already tracked */}
        {alreadyTracked.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
              Already Tracked ({alreadyTracked.length})
            </p>
            {alreadyTracked.map((project) => (
              <div
                key={project.key}
                className="flex items-center gap-3 p-3 rounded-xl opacity-50"
              >
                {project.avatarUrl ? (
                  <img src={project.avatarUrl} alt="" className="h-9 w-9 rounded-lg" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-muted/30 flex items-center justify-center text-xs font-bold font-mono text-muted-foreground">
                    {project.key.substring(0, 2)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold font-mono">{project.key}</p>
                  <p className="text-xs text-muted-foreground truncate">{project.name}</p>
                </div>
                <Check className="h-4 w-4 text-emerald-500" />
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No projects found matching &ldquo;{search}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

// Manual fallback form
function ManualForm({
  form,
  setForm,
  error,
  loading,
  onSubmit,
}: {
  form: { jiraKey: string; name: string; color: string; description: string };
  setForm: (f: typeof form) => void;
  error: string;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <div className="space-y-1.5">
        <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
          JIRA Board Key *
        </label>
        <input
          type="text"
          value={form.jiraKey}
          onChange={(e) => setForm({ ...form, jiraKey: e.target.value.toUpperCase() })}
          placeholder="e.g. PROD, BUTTERFLY"
          className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/30"
          required
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
          Project Name *
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Production Board"
          className="w-full h-11 px-4 rounded-lg bg-muted/30 border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          required
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
          Color
        </label>
        <div className="flex gap-2">
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-10 rounded-lg cursor-pointer border-0" />
          <input type="text" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-28 h-10 px-3 rounded-lg bg-muted/30 text-sm font-mono" />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-bold font-mono uppercase tracking-wider bg-[#1a1a2e] text-white hover:bg-[#1a1a2e]/90 shadow-lg transition-all disabled:opacity-50 w-full justify-center"
      >
        <Plus className="h-4 w-4" />
        {loading ? "Adding..." : "Add Project"}
      </button>
    </form>
  );
}
