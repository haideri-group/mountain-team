"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Shield,
  ShieldOff,
  AlertTriangle,
  Check,
  Loader2,
  Globe,
  Pencil,
  X,
} from "lucide-react";
import { BRAND_GRADIENT } from "@/lib/brand";

interface IpRule {
  id: string;
  cidr: string;
  label: string | null;
  enabled: boolean;
  createdAt: string | Date | null;
  createdBy: string | null;
}

interface ListResponse {
  rules: IpRule[];
  yourIp: string | null;
  yourIpCovered: boolean;
}

function formatWhen(date: string | Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    hour12: true,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IpAllowlistManager() {
  const [rules, setRules] = useState<IpRule[]>([]);
  const [yourIp, setYourIp] = useState<string | null>(null);
  const [yourIpCovered, setYourIpCovered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cidrInput, setCidrInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({});
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ip-allowlist", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ListResponse;
      setRules(data.rules || []);
      setYourIp(data.yourIp);
      setYourIpCovered(!!data.yourIpCovered);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load allowlist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Server computes this against the same matcher used by the gate, so
  // CIDR ranges covering the client IP are reflected here — not just
  // exact-string matches.
  const yourIpAlreadyListed = yourIpCovered;

  const handleAdd = async (cidrOverride?: string, labelOverride?: string | null) => {
    const cidr = (cidrOverride ?? cidrInput).trim();
    if (!cidr) {
      setError("IP or CIDR is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ip-allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cidr,
          label: labelOverride !== undefined ? labelOverride : (labelInput.trim() || null),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCidrInput("");
      setLabelInput("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add rule");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (rule: IpRule) => {
    const nextEnabled = !rule.enabled;
    setPendingById((p) => ({ ...p, [rule.id]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/ip-allowlist/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Patch the single row in place — no full refetch, no table remount.
      setRules((rs) =>
        rs.map((r) => (r.id === rule.id ? { ...r, enabled: nextEnabled } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rule");
    } finally {
      setPendingById((p) => {
        const next = { ...p };
        delete next[rule.id];
        return next;
      });
    }
  };

  const handleDelete = async (rule: IpRule) => {
    if (!confirm(`Remove ${rule.cidr}${rule.label ? ` (${rule.label})` : ""} from the allowlist?`)) {
      return;
    }
    setPendingById((p) => ({ ...p, [rule.id]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/ip-allowlist/${rule.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Drop the row locally — no full refetch.
      setRules((rs) => rs.filter((r) => r.id !== rule.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete rule");
      setPendingById((p) => {
        const next = { ...p };
        delete next[rule.id];
        return next;
      });
    }
  };

  const startEditingLabel = (rule: IpRule) => {
    setEditingLabelId(rule.id);
    setEditLabelValue(rule.label || "");
  };

  const cancelEditingLabel = () => {
    setEditingLabelId(null);
    setEditLabelValue("");
  };

  const saveLabel = async (rule: IpRule) => {
    const trimmed = editLabelValue.trim();
    const nextLabel = trimmed.length === 0 ? null : trimmed;
    if (nextLabel === (rule.label ?? null)) {
      cancelEditingLabel();
      return;
    }
    setPendingById((p) => ({ ...p, [rule.id]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/ip-allowlist/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setRules((rs) =>
        rs.map((r) => (r.id === rule.id ? { ...r, label: nextLabel } : r)),
      );
      cancelEditingLabel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update label");
    } finally {
      setPendingById((p) => {
        const next = { ...p };
        delete next[rule.id];
        return next;
      });
    }
  };

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="p-5 space-y-1">
        <h3 className="text-base font-bold font-mono">IP Allowlist — Guest Access</h3>
        <p className="text-xs text-muted-foreground">
          Controls which IPs can view public pages (/overview, /issue/*) without logging in.
          Logged-in users are never affected by this list.
        </p>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Your-IP banner */}
        {yourIp && (
          <div className="rounded-xl bg-muted/15 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
                  Your current IP
                </p>
                <p className="text-sm font-mono truncate">{yourIp}</p>
              </div>
            </div>
            {yourIpAlreadyListed ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Allowlisted
              </span>
            ) : (
              <button
                onClick={() => handleAdd(yourIp, "My current IP")}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 h-8 rounded-full text-xs font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50 shrink-0"
                style={{ background: BRAND_GRADIENT }}
              >
                <Plus className="h-3 w-3" />
                Add my IP
              </button>
            )}
          </div>
        )}

        {/* Add-IP form */}
        <div className="rounded-xl bg-muted/10 p-4 space-y-3">
          <p className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
            Add IP or CIDR range
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={cidrInput}
              onChange={(e) => setCidrInput(e.target.value)}
              placeholder="e.g. 203.0.113.5 or 203.0.113.0/24"
              className="flex-1 px-3 h-9 rounded-lg bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Optional label"
              maxLength={255}
              className="flex-1 px-3 h-9 rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <button
              onClick={() => handleAdd()}
              disabled={submitting || !cidrInput.trim()}
              className="flex items-center justify-center gap-1.5 px-5 h-9 rounded-full text-sm font-bold font-mono uppercase tracking-wider text-white shadow-md transition-all disabled:opacity-50"
              style={{ background: BRAND_GRADIENT }}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Rule list */}
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="flex items-center justify-center p-8 rounded-xl bg-muted/10">
            <p className="text-sm text-muted-foreground">
              No IP rules yet — guests can&apos;t reach public pages without one.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/10 overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground bg-muted/20">
              <span>IP / CIDR</span>
              <span>Label</span>
              <span>Added</span>
              <span className="text-center">Enabled</span>
              <span></span>
            </div>
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-4 py-3 items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {rule.enabled ? (
                    <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <ShieldOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-mono truncate">{rule.cidr}</span>
                </div>
                {editingLabelId === rule.id ? (
                  <div className="flex items-center gap-1 min-w-0">
                    <input
                      type="text"
                      value={editLabelValue}
                      onChange={(e) => setEditLabelValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveLabel(rule);
                        if (e.key === "Escape") cancelEditingLabel();
                      }}
                      disabled={!!pendingById[rule.id]}
                      placeholder="Label"
                      maxLength={255}
                      autoFocus
                      className="h-7 min-w-0 flex-1 px-2 rounded bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                    />
                    <button
                      onClick={() => saveLabel(rule)}
                      disabled={!!pendingById[rule.id]}
                      className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                      aria-label="Save label"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={cancelEditingLabel}
                      disabled={!!pendingById[rule.id]}
                      className="p-1 rounded text-muted-foreground hover:bg-muted/30 disabled:opacity-50"
                      aria-label="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 min-w-0 group/label">
                    <span className="text-xs text-muted-foreground truncate">
                      {rule.label || "—"}
                    </span>
                    <button
                      onClick={() => startEditingLabel(rule)}
                      disabled={!!pendingById[rule.id]}
                      className="p-0.5 rounded text-muted-foreground/0 group-hover/label:text-muted-foreground hover:bg-muted/30 transition-all shrink-0"
                      aria-label="Edit label"
                      title="Edit label"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                  {formatWhen(rule.createdAt)}
                </span>
                <div className="inline-flex items-center gap-2 shrink-0">
                  {pendingById[rule.id] && (
                    <Loader2
                      aria-hidden
                      className="h-3.5 w-3.5 text-muted-foreground animate-spin"
                    />
                  )}
                  <button
                    onClick={() => handleToggle(rule)}
                    disabled={!!pendingById[rule.id]}
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
                    className={`inline-flex items-center h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      rule.enabled ? "bg-primary" : "bg-muted-foreground/25"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        rule.enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <button
                  onClick={() => handleDelete(rule)}
                  disabled={!!pendingById[rule.id]}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                  aria-label="Delete rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
