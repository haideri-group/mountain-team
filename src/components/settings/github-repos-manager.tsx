"use client";

import { useState, useEffect } from "react";
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
import { SlideOver } from "@/components/shared/slide-over";

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

// Preset templates for known repos
const FRONTEND_TEMPLATE = {
  owner: "tilemountainuk",
  name: "tile-mountain-sdk",
  mappings: [
    { branchPattern: "main-tilemtn", environment: "production" as const, siteName: "tilemtn", siteLabel: "Tile Mountain" },
    { branchPattern: "main-bathmtn", environment: "production" as const, siteName: "bathmtn", siteLabel: "Bath Mountain" },
    { branchPattern: "main-wallsandfloors", environment: "production" as const, siteName: "wallsandfloors", siteLabel: "Walls and Floors" },
    { branchPattern: "main-tilemtnae", environment: "production" as const, siteName: "tilemtnae", siteLabel: "TM Dubai" },
    { branchPattern: "main-waftrd", environment: "production" as const, siteName: "waftrd", siteLabel: "WAF Trade" },
    { branchPattern: "main-splendourtiles", environment: "production" as const, siteName: "splendourtiles", siteLabel: "Splendour Tiles" },
    { branchPattern: "stage-tilemtn", environment: "staging" as const, siteName: "tilemtn", siteLabel: "Tile Mountain" },
    { branchPattern: "stage-bathmtn", environment: "staging" as const, siteName: "bathmtn", siteLabel: "Bath Mountain" },
    { branchPattern: "stage-wallsandfloors", environment: "staging" as const, siteName: "wallsandfloors", siteLabel: "Walls and Floors" },
    { branchPattern: "stage-tilemtnae", environment: "staging" as const, siteName: "tilemtnae", siteLabel: "TM Dubai" },
    { branchPattern: "stage-waftrd", environment: "staging" as const, siteName: "waftrd", siteLabel: "WAF Trade" },
    { branchPattern: "stage-splendourtiles", environment: "staging" as const, siteName: "splendourtiles", siteLabel: "Splendour Tiles" },
    { branchPattern: "stage", environment: "staging" as const, siteName: null, siteLabel: "All Sites", isAllSites: true },
    { branchPattern: "main", environment: "canonical" as const, siteName: null, siteLabel: "Canonical" },
  ],
};

const BACKEND_TEMPLATE = {
  owner: "tilemountainuk",
  name: "tilemountain2",
  mappings: [
    { branchPattern: "master-tm", environment: "production" as const, siteName: "tm", siteLabel: "Tile Mountain" },
    { branchPattern: "master-bm", environment: "production" as const, siteName: "bm", siteLabel: "Bath Mountain" },
    { branchPattern: "master-waf", environment: "production" as const, siteName: "waf", siteLabel: "Walls and Floors" },
    { branchPattern: "master-tmdubai", environment: "production" as const, siteName: "tmdubai", siteLabel: "TM Dubai" },
    { branchPattern: "stage-tm", environment: "staging" as const, siteName: "tm", siteLabel: "Tile Mountain" },
    { branchPattern: "stage-bm", environment: "staging" as const, siteName: "bm", siteLabel: "Bath Mountain" },
    { branchPattern: "stage-waf", environment: "staging" as const, siteName: "waf", siteLabel: "Walls and Floors" },
    { branchPattern: "stage-tmdubai", environment: "staging" as const, siteName: "tmdubai", siteLabel: "TM Dubai" },
    { branchPattern: "master", environment: "canonical" as const, siteName: null, siteLabel: "Canonical" },
  ],
};

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

  const handleBackfill = async (repo: GitHubRepo) => {
    setActionLoading(`backfill_${repo.id}`);
    setBackfillResult(null);
    try {
      const res = await fetch(`/api/github/repos/${repo.id}/backfill`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBackfillResult(`Backfill complete: ${data.deploymentsCreated || 0} deployments recorded`);
      } else {
        setBackfillResult(`Error: ${data.error || "Backfill failed"}`);
      }
    } catch {
      setBackfillResult("Error: Failed to connect");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddRepo = async (template: typeof FRONTEND_TEMPLATE) => {
    setActionLoading("adding");
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: template.owner,
          name: template.name,
          branchMappings: template.mappings.map((m) => ({
            branchPattern: m.branchPattern,
            environment: m.environment,
            siteName: m.siteName,
            siteLabel: m.siteLabel,
            isAllSites: (m as any).isAllSites || false,
          })),
        }),
      });
      if (res.ok) {
        setShowAddPanel(false);
        fetchRepos();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add repo");
      }
    } finally {
      setActionLoading(null);
    }
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
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-muted-foreground">
            Select a preset template to add a repository with pre-configured branch mappings.
          </p>

          {/* Frontend template */}
          <button
            onClick={() => handleAddRepo(FRONTEND_TEMPLATE)}
            disabled={actionLoading === "adding" || repos.some((r) => r.fullName === "tilemountainuk/tile-mountain-sdk")}
            className="w-full text-left rounded-xl border border-border/50 p-5 hover:bg-muted/10 transition-all disabled:opacity-50 space-y-2"
          >
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-bold font-mono">tile-mountain-sdk</p>
                <p className="text-xs text-muted-foreground">Frontend — Nuxt 3 / Vue Storefront 2</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              6 live sites + 6 staging + shared stage + canonical main. {FRONTEND_TEMPLATE.mappings.length} branch mappings.
            </p>
          </button>

          {/* Backend template */}
          <button
            onClick={() => handleAddRepo(BACKEND_TEMPLATE)}
            disabled={actionLoading === "adding" || repos.some((r) => r.fullName === "tilemountainuk/tilemountain2")}
            className="w-full text-left rounded-xl border border-border/50 p-5 hover:bg-muted/10 transition-all disabled:opacity-50 space-y-2"
          >
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-bold font-mono">tilemountain2</p>
                <p className="text-xs text-muted-foreground">Backend — Magento 2</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              4 live sites + 4 staging + canonical master. {BACKEND_TEMPLATE.mappings.length} branch mappings.
            </p>
          </button>

          {actionLoading === "adding" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding repository...
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
