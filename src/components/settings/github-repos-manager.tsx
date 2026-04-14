"use client";

import { useState, useEffect, useRef } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Check,
  AlertTriangle,
  Webhook,
  Globe,
  Server,
} from "lucide-react";
// envColors used, Globe/Server used for branch mapping icons
import { SlideOver } from "@/components/shared/slide-over";
import { AddRepoPanel } from "./add-repo-panel";

interface BranchMapping {
  id: string;
  branchPattern: string;
  environment: "staging" | "production" | "canonical";
  siteName: string | null;
  siteLabel: string | null;
  isAllSites: boolean;
}

interface GitHubRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  webhookActive: boolean;
  lastBackfillAt: string | null;
  branchMappings: BranchMapping[];
}

const envColors = {
  staging: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  production: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  canonical: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};

export function GitHubReposManager() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [backfillRepoId, setBackfillRepoId] = useState<string | null>(null);
  const [backfillProgress, setBackfillProgress] = useState<{
    phase: string; message: string; prsScanned: number; prsTotal: number; deploymentsCreated: number;
  } | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // On mount: check if a backfill is already running
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      // We don't know which repo, but we can check the global progress
      for (const repo of repos) {
        try {
          const res = await fetch(`/api/github/repos/${repo.id}/backfill`);
          if (!res.ok || cancelled) continue;
          const data = await res.json();
          if (data.progress && (data.progress.phase === "fetching" || data.progress.phase === "processing")) {
            setBackfillRepoId(repo.id);
            setBackfillProgress(data.progress);
            break;
          }
        } catch { /* ignore */ }
      }
    };
    if (repos.length > 0) check();
    return () => { cancelled = true; };
  }, [repos.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll progress while backfilling
  useEffect(() => {
    if (backfillRepoId) {
      const poll = async () => {
        try {
          const res = await fetch(`/api/github/repos/${backfillRepoId}/backfill`);
          if (res.ok) {
            const data = await res.json();
            setBackfillProgress(data.progress);
            if (data.progress && (data.progress.phase === "done" || data.progress.phase === "failed" || data.progress.phase === "idle")) {
              setBackfillRepoId(null);
              setBackfillProgress(null);
              if (data.progress.phase === "done") {
                setBackfillResult(`Backfill complete: ${data.progress.deploymentsCreated} deployments from ${data.progress.prsScanned} PRs`);
              }
            }
          }
        } catch { /* ignore */ }
      };
      poll();
      pollRef.current = setInterval(poll, 1000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
  }, [backfillRepoId]);

  const fetchRepos = async () => {
    try {
      const res = await fetch("/api/github/repos");
      if (res.ok) {
        const data = await res.json();
        setRepos(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const handleDelete = async (repo: GitHubRepo) => {
    if (!confirm(`Remove "${repo.fullName}" and all its deployment records?`)) return;
    setActionLoading(repo.id);
    try {
      await fetch(`/api/github/repos/${repo.id}`, { method: "DELETE" });
      setRepos(repos.filter((r) => r.id !== repo.id));
    } finally {
      setActionLoading(null);
    }
  };

  const handleBackfill = (repo: GitHubRepo) => {
    setActionLoading(`backfill_${repo.id}`);
    setBackfillResult(null);
    setBackfillRepoId(repo.id);

    // Fire-and-forget — polling handles the lifecycle
    fetch(`/api/github/repos/${repo.id}/backfill`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setBackfillResult(`Error: ${data.error || "Backfill failed"}`);
          setBackfillRepoId(null);
        }
      })
      .catch(() => {
        setBackfillResult("Error: Failed to connect");
        setBackfillRepoId(null);
      })
      .finally(() => {
        setActionLoading(null);
      });
  };

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-5">
        <div>
          <h3 className="text-base font-bold font-mono">GitHub Repositories</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track deployments across staging and production branches
          </p>
        </div>
        <button
          onClick={() => setShowAddPanel(true)}
          className="flex items-center gap-2 px-4 h-9 rounded-full text-sm font-bold font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
        >
          <Plus className="h-4 w-4" />
          Add Repo
        </button>
      </div>

      {loading ? (
        <div className="px-5 pb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : repos.length === 0 ? (
        <div className="px-5 pb-5">
          <div className="rounded-lg bg-muted/30 p-8 text-center">
            <GitBranch className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No GitHub repositories tracked yet. Add one to start tracking deployments.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-5 pb-5 space-y-4">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="rounded-xl border border-border/50 p-5 space-y-4"
            >
              {/* Repo header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[#1a1a2e] flex items-center justify-center">
                    <GitBranch className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold font-mono">{repo.fullName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${repo.webhookActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                        <Webhook className="h-2.5 w-2.5" />
                        {repo.webhookActive ? "Webhook Active" : "Webhook Not Set"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {repo.branchMappings.length} branch mappings
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBackfill(repo)}
                    disabled={actionLoading === `backfill_${repo.id}`}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold font-mono uppercase tracking-wider bg-muted/30 hover:bg-muted/50 transition-all disabled:opacity-50"
                    title="Backfill deployment history"
                  >
                    {actionLoading === `backfill_${repo.id}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Backfill
                  </button>
                  <button
                    onClick={() => handleDelete(repo)}
                    disabled={actionLoading === repo.id}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove repo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Branch mappings grouped by environment */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(["staging", "production", "canonical"] as const).map((env) => {
                  const mappings = repo.branchMappings.filter(
                    (m) => m.environment === env,
                  );
                  if (mappings.length === 0) return null;
                  return (
                    <div key={env} className="rounded-lg bg-muted/15 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {env === "staging" ? (
                          <Server className="h-3 w-3 text-amber-600" />
                        ) : env === "production" ? (
                          <Globe className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <GitBranch className="h-3 w-3 text-blue-600" />
                        )}
                        <span className={`text-[10px] font-bold font-mono uppercase tracking-wider ${env === "staging" ? "text-amber-600" : env === "production" ? "text-emerald-600" : "text-blue-600"}`}>
                          {env}
                        </span>
                      </div>
                      {mappings.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <code className="font-mono text-foreground">{m.branchPattern}</code>
                          <span className="text-muted-foreground">
                            {m.isAllSites ? "All Sites" : m.siteLabel || m.siteName}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Backfill progress bar */}
              {backfillRepoId === repo.id && backfillProgress && (backfillProgress.phase === "fetching" || backfillProgress.phase === "processing") && (
                <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                      <span className="text-xs font-bold font-mono uppercase tracking-wider text-blue-700 dark:text-blue-400">
                        {backfillProgress.phase === "fetching" ? "Scanning PRs" : "Processing"}
                      </span>
                    </div>
                    {backfillProgress.prsScanned > 0 && (
                      <span className="text-xs font-bold font-mono text-blue-700 dark:text-blue-400">
                        {backfillProgress.prsScanned} PRs · {backfillProgress.deploymentsCreated} deployments
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400/80">
                    {backfillProgress.message}
                  </p>
                  {backfillProgress.phase === "processing" ? (
                    <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: backfillProgress.prsTotal > 0 ? `${Math.min(100, (backfillProgress.prsScanned / backfillProgress.prsTotal) * 100)}%` : "50%",
                          background: "linear-gradient(135deg, #944a00, #ff8400)",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden">
                      <div
                        className="h-full w-1/3 rounded-full animate-pulse"
                        style={{ background: "linear-gradient(135deg, #944a00, #ff8400)" }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Backfill result */}
              {backfillResult && (
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${backfillResult.startsWith("Error") ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"}`}>
                  {backfillResult.startsWith("Error") ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {backfillResult}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Repo Panel */}
      <SlideOver
        open={showAddPanel}
        onClose={() => setShowAddPanel(false)}
        title="Add GitHub Repository"
      >
        <AddRepoPanel
          existingRepos={repos.map((r) => r.fullName)}
          onRepoAdded={() => {
            setShowAddPanel(false);
            fetchRepos();
          }}
        />
      </SlideOver>
    </div>
  );
}
