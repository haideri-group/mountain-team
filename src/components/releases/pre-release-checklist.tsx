"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2, Loader2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoButton } from "@/components/shared/info-modal";
import { formatSmartDate } from "@/components/issue/issue-helpers";

interface ChecklistItem {
  id: string;
  label: string;
  isComplete: boolean;
  completedByName: string | null;
  completedAt: string | null;
  sortOrder: number;
}

export function PreReleaseChecklist({
  releaseId,
  isAdmin,
}: {
  releaseId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/releases/${releaseId}/checklist`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load checklist (${res.status})`);
      const data = (await res.json()) as { items: ChecklistItem[] };
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [releaseId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (item: ChecklistItem) => {
      const next = !item.isComplete;
      // optimistic update
      setItems((prev) =>
        prev
          ? prev.map((i) =>
              i.id === item.id
                ? { ...i, isComplete: next, completedAt: next ? new Date().toISOString() : null }
                : i,
            )
          : prev,
      );
      try {
        const res = await fetch(
          `/api/releases/${releaseId}/checklist?itemId=${item.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isComplete: next }),
          },
        );
        if (!res.ok) throw new Error("Toggle failed");
        // Refresh to pick up server-side completedByName / completedAt
        await load();
      } catch {
        // Revert on failure
        setItems((prev) =>
          prev ? prev.map((i) => (i.id === item.id ? item : i)) : prev,
        );
      }
    },
    [releaseId, load],
  );

  const addItem = useCallback(async () => {
    const label = newLabel.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/checklist`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("Add failed");
      setNewLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [newLabel, releaseId, busy, load]);

  const removeItem = useCallback(
    async (itemId: string) => {
      if (!isAdmin) return;
      try {
        const res = await fetch(`/api/releases/${releaseId}/checklist?itemId=${itemId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [releaseId, load, isAdmin],
  );

  const completedCount = items?.filter((i) => i.isComplete).length ?? 0;
  const totalCount = items?.length ?? 0;

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground/60" />
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Pre-release checklist
          </h3>
          <InfoButton guideKey="releaseChecklist" />
        </div>
        {items && totalCount > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {completedCount}/{totalCount} complete
          </span>
        )}
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {!items ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No checklist items yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/10 transition-colors"
            >
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={item.isComplete}
                aria-label={item.isComplete ? "Uncheck" : "Check"}
                className={cn(
                  "mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0 transition-colors",
                  item.isComplete
                    ? "bg-emerald-500 text-white"
                    : "bg-muted/30 hover:bg-muted/50",
                )}
              >
                {item.isComplete && <Check className="h-3 w-3" />}
              </button>

              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "text-xs",
                    item.isComplete ? "line-through text-muted-foreground" : "text-foreground",
                  )}
                >
                  {item.label}
                </span>
                {item.completedByName && item.completedAt && (
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                    {item.completedByName} · {formatSmartDate(item.completedAt)}
                  </p>
                )}
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label="Delete item"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Add a checklist item…"
            className="flex-1 text-xs bg-muted/20 rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary/40"
            disabled={busy}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!newLabel.trim() || busy}
            className="flex items-center gap-1 text-[10px] font-bold font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg bg-muted/20 hover:bg-muted/30 disabled:opacity-40 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      )}
    </div>
  );
}
