"use client";

import { useState, useCallback } from "react";
import {
  Search,
  GitBranch,
  Loader2,
  AlertTriangle,
  Globe,
  Server,
  Zap,
  Trash2,
} from "lucide-react";

// --- Preset templates ---

const FRONTEND_PRESET = {
  owner: "tilemountainuk",
  name: "tile-mountain-sdk",
  label: "Frontend — Nuxt 3 / Vue Storefront 2",
  description: "6 live + 6 staging + shared stage + canonical main",
  mappings: [
    { branchPattern: "main-tilemtn", environment: "production" as const, siteName: "tilemtn", siteLabel: "Tile Mountain", isAllSites: false },
    { branchPattern: "main-bathmtn", environment: "production" as const, siteName: "bathmtn", siteLabel: "Bath Mountain", isAllSites: false },
    { branchPattern: "main-wallsandfloors", environment: "production" as const, siteName: "wallsandfloors", siteLabel: "Walls and Floors", isAllSites: false },
    { branchPattern: "main-tilemtnae", environment: "production" as const, siteName: "tilemtnae", siteLabel: "TM Dubai", isAllSites: false },
    { branchPattern: "main-waftrd", environment: "production" as const, siteName: "waftrd", siteLabel: "WAF Trade", isAllSites: false },
    { branchPattern: "main-splendourtiles", environment: "production" as const, siteName: "splendourtiles", siteLabel: "Splendour Tiles", isAllSites: false },
    { branchPattern: "stage-tilemtn", environment: "staging" as const, siteName: "tilemtn", siteLabel: "Tile Mountain", isAllSites: false },
    { branchPattern: "stage-bathmtn", environment: "staging" as const, siteName: "bathmtn", siteLabel: "Bath Mountain", isAllSites: false },
    { branchPattern: "stage-wallsandfloors", environment: "staging" as const, siteName: "wallsandfloors", siteLabel: "Walls and Floors", isAllSites: false },
    { branchPattern: "stage-tilemtnae", environment: "staging" as const, siteName: "tilemtnae", siteLabel: "TM Dubai", isAllSites: false },
    { branchPattern: "stage-waftrd", environment: "staging" as const, siteName: "waftrd", siteLabel: "WAF Trade", isAllSites: false },
    { branchPattern: "stage-splendourtiles", environment: "staging" as const, siteName: "splendourtiles", siteLabel: "Splendour Tiles", isAllSites: false },
    { branchPattern: "stage", environment: "staging" as const, siteName: null, siteLabel: "All Sites", isAllSites: true },
    { branchPattern: "main", environment: "canonical" as const, siteName: null, siteLabel: "Canonical", isAllSites: false },
  ],
};

const BACKEND_PRESET = {
  owner: "tilemountainuk",
  name: "tilemountain2",
  label: "Backend — Magento 2",
  description: "4 live + 4 staging + canonical master",
  mappings: [
    { branchPattern: "master-tm", environment: "production" as const, siteName: "tm", siteLabel: "Tile Mountain", isAllSites: false },
    { branchPattern: "master-bm", environment: "production" as const, siteName: "bm", siteLabel: "Bath Mountain", isAllSites: false },
    { branchPattern: "master-waf", environment: "production" as const, siteName: "waf", siteLabel: "Walls and Floors", isAllSites: false },
    { branchPattern: "master-tmdubai", environment: "production" as const, siteName: "tmdubai", siteLabel: "TM Dubai", isAllSites: false },
    { branchPattern: "stage-tm", environment: "staging" as const, siteName: "tm", siteLabel: "Tile Mountain", isAllSites: false },
    { branchPattern: "stage-bm", environment: "staging" as const, siteName: "bm", siteLabel: "Bath Mountain", isAllSites: false },
    { branchPattern: "stage-waf", environment: "staging" as const, siteName: "waf", siteLabel: "Walls and Floors", isAllSites: false },
    { branchPattern: "stage-tmdubai", environment: "staging" as const, siteName: "tmdubai", siteLabel: "TM Dubai", isAllSites: false },
    { branchPattern: "master", environment: "canonical" as const, siteName: null, siteLabel: "Canonical", isAllSites: false },
  ],
};

// --- Types ---

type Environment = "staging" | "production" | "canonical";

interface BranchRow {
  branchPattern: string;
  environment: Environment | null;
  siteName: string | null;
  siteLabel: string | null;
  isAllSites: boolean;
}

interface AddRepoPanelProps {
  existingRepos: string[];
  onRepoAdded: () => void;
}

// --- Heuristic classification ---

function classifyBranch(name: string): Partial<BranchRow> {
  if (name === "main" || name === "master") {
    return { environment: "canonical", siteName: null, siteLabel: "Canonical", isAllSites: false };
  }
  if (name === "stage" || name === "staging") {
    return { environment: "staging", siteName: null, siteLabel: "All Sites", isAllSites: true };
  }
  if (name.startsWith("stage-")) {
    const site = name.replace("stage-", "");
    return { environment: "staging", siteName: site, siteLabel: null, isAllSites: false };
  }
  if (name.startsWith("main-")) {
    const site = name.replace("main-", "");
    return { environment: "production", siteName: site, siteLabel: null, isAllSites: false };
  }
  if (name.startsWith("master-")) {
    const site = name.replace("master-", "");
    return { environment: "production", siteName: site, siteLabel: null, isAllSites: false };
  }
  return { environment: null, siteName: null, siteLabel: null, isAllSites: false };
}

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 6px center",
};

// --- Component ---

export function AddRepoPanel({ existingRepos, onRepoAdded }: AddRepoPanelProps) {
  const [owner, setOwner] = useState("tilemountainuk");
  const [name, setName] = useState("");
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  const fullName = `${owner}/${name}`;
  const alreadyTracked = existingRepos.includes(fullName);

  const handleDetect = useCallback(async () => {
    if (!owner.trim() || !name.trim()) return;
    setDetecting(true);
    setError(null);
    setBranches([]);
    setDetected(false);

    try {
      const res = await fetch(
        `/api/github/repos/branches?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`,
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const rows: BranchRow[] = (data.branches as string[]).map((b) => ({
        branchPattern: b,
        ...classifyBranch(b),
      })) as BranchRow[];

      // Sort: classified first (by env), then unclassified
      const envOrder: Record<string, number> = { production: 0, staging: 1, canonical: 2 };
      rows.sort((a, b) => {
        if (a.environment && !b.environment) return -1;
        if (!a.environment && b.environment) return 1;
        if (a.environment && b.environment) {
          return (envOrder[a.environment] ?? 3) - (envOrder[b.environment] ?? 3);
        }
        return a.branchPattern.localeCompare(b.branchPattern);
      });

      setBranches(rows);
      setDetected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect branches");
    } finally {
      setDetecting(false);
    }
  }, [owner, name]);

  const applyPreset = (preset: typeof FRONTEND_PRESET) => {
    setOwner(preset.owner);
    setName(preset.name);
    setBranches(
      preset.mappings.map((m) => ({
        branchPattern: m.branchPattern,
        environment: m.environment,
        siteName: m.siteName,
        siteLabel: m.siteLabel,
        isAllSites: m.isAllSites,
      })),
    );
    setDetected(true);
    setError(null);
  };

  const updateBranch = (index: number, update: Partial<BranchRow>) => {
    setBranches((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...update } : b)),
    );
  };

  const removeBranch = (index: number) => {
    setBranches((prev) => prev.filter((_, i) => i !== index));
  };

  const mappedBranches = branches.filter((b) => b.environment !== null);

  const handleSave = async () => {
    if (mappedBranches.length === 0) {
      setError("At least one branch must be assigned an environment");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          name,
          branchMappings: mappedBranches.map((b) => ({
            branchPattern: b.branchPattern,
            environment: b.environment,
            siteName: b.siteName,
            siteLabel: b.siteLabel,
            isAllSites: b.isAllSites,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add repository");
      }

      onRepoAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Quick-fill presets */}
      <div className="space-y-2">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
          Quick Fill
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { preset: FRONTEND_PRESET, icon: Globe },
            { preset: BACKEND_PRESET, icon: Server },
          ].map(({ preset, icon: Icon }) => {
            const disabled = existingRepos.includes(`${preset.owner}/${preset.name}`);
            return (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                disabled={disabled}
                className="text-left rounded-lg border border-border/50 p-3 hover:bg-muted/10 transition-all disabled:opacity-40 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold font-mono">{preset.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual input */}
      <div className="space-y-3">
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
          Repository
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={owner}
            onChange={(e) => { setOwner(e.target.value); setDetected(false); }}
            placeholder="Owner"
            className="flex-1 h-9 px-3 rounded-lg bg-muted/30 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-muted-foreground font-mono">/</span>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setDetected(false); }}
            placeholder="Repo name"
            className="flex-1 h-9 px-3 rounded-lg bg-muted/30 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {alreadyTracked && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-mono">
            This repository is already tracked
          </p>
        )}

        <button
          onClick={handleDetect}
          disabled={!owner.trim() || !name.trim() || detecting || alreadyTracked}
          className="flex items-center gap-2 px-4 h-9 rounded-lg text-xs font-bold font-mono uppercase tracking-wider bg-muted/30 hover:bg-muted/50 transition-all disabled:opacity-40"
        >
          {detecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Detect Branches
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Branch mapping table */}
      {detected && branches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Branch Mappings
            </p>
            <span className="text-[10px] font-mono text-muted-foreground">
              {mappedBranches.length} mapped / {branches.length} total
            </span>
          </div>

          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {branches.map((branch, i) => (
              <div
                key={branch.branchPattern}
                className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${branch.environment ? "bg-muted/15" : "bg-muted/5 opacity-60"}`}
              >
                {/* Branch name */}
                <code className="text-[11px] font-mono font-semibold text-foreground w-40 truncate shrink-0" title={branch.branchPattern}>
                  {branch.branchPattern}
                </code>

                {/* Environment dropdown */}
                <select
                  value={branch.environment || ""}
                  onChange={(e) => {
                    const env = e.target.value as Environment | "";
                    updateBranch(i, {
                      environment: env || null,
                      isAllSites: false,
                    });
                  }}
                  className="h-7 px-2 rounded bg-muted/30 text-[10px] font-mono appearance-none cursor-pointer focus:outline-none pr-5 w-24 shrink-0"
                  style={selectStyle}
                >
                  <option value="">Skip</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                  <option value="canonical">Canonical</option>
                </select>

                {/* Site name */}
                <input
                  type="text"
                  value={branch.siteName || ""}
                  onChange={(e) => updateBranch(i, { siteName: e.target.value || null })}
                  placeholder="site"
                  className="h-7 px-2 rounded bg-muted/30 text-[10px] font-mono focus:outline-none w-20 shrink-0"
                  disabled={!branch.environment}
                />

                {/* Site label */}
                <input
                  type="text"
                  value={branch.siteLabel || ""}
                  onChange={(e) => updateBranch(i, { siteLabel: e.target.value || null })}
                  placeholder="label"
                  className="h-7 px-2 rounded bg-muted/30 text-[10px] font-mono focus:outline-none flex-1 min-w-0"
                  disabled={!branch.environment}
                />

                {/* All Sites toggle */}
                {branch.environment === "staging" && (
                  <label className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={branch.isAllSites}
                      onChange={(e) => updateBranch(i, { isAllSites: e.target.checked })}
                      className="h-3 w-3 rounded"
                    />
                    All
                  </label>
                )}

                {/* Remove */}
                <button
                  onClick={() => removeBranch(i)}
                  className="p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {detected && branches.length === 0 && !error && (
        <p className="text-xs text-muted-foreground italic py-2">
          No branches found in this repository.
        </p>
      )}

      {/* Save button */}
      {detected && mappedBranches.length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving || alreadyTracked}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-bold font-mono uppercase tracking-wider text-white transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #944a00, #ff8400)" }}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {saving ? "Saving..." : `Add Repository (${mappedBranches.length} mappings)`}
        </button>
      )}
    </div>
  );
}
