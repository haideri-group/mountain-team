"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SlidersHorizontal, X, RefreshCw, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface BoardOption {
  id: string;
  jiraKey: string;
  name: string;
  color: string | null;
}

interface FilterBarProps {
  boards: BoardOption[];
  filters: {
    board: string;
    availability: string;
    type: string;
    priority: string;
    status: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearAll: () => void;
  isAdmin: boolean;
  onSyncNow?: () => void;
  syncing?: boolean;
}

const availabilityOptions = [
  { value: "", label: "All Availability" },
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "departed", label: "Departed" },
];

const typeOptions = [
  { value: "", label: "All Types" },
  { value: "bug", label: "Bug" },
  { value: "story", label: "Story" },
  { value: "cms_change", label: "CMS Change" },
  { value: "enhancement", label: "Enhancement" },
  { value: "task", label: "Task" },
];

const priorityOptions = [
  { value: "", label: "All Priorities" },
  { value: "highest", label: "Highest" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "lowest", label: "Lowest" },
];

const statusOptions = [
  { value: "", label: "All Statuses" },
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "on_hold", label: "On Hold" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "ready_for_testing", label: "Ready for Testing" },
  { value: "ready_for_live", label: "Ready for Live" },
  { value: "rolling_out", label: "Rolling Out" },
  { value: "post_live_testing", label: "Post Live Testing" },
  { value: "done", label: "Done" },
];

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(-1);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? options[0]?.label;
  const isFiltered = value !== "";

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Open and set initial focus index to current selection
  const open = useCallback(() => {
    const idx = options.findIndex((o) => o.value === value);
    setFocusedIdx(idx >= 0 ? idx : 0);
    setIsOpen(true);
  }, [options, value]);

  // Scroll focused option into view
  useEffect(() => {
    if (!isOpen || focusedIdx < 0) return;
    const el = listRef.current?.children[focusedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [isOpen, focusedIdx]);

  // Click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      // Open on arrow down/up/Enter/Space when trigger is focused
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        open();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setFocusedIdx(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIdx(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIdx >= 0 && focusedIdx < options.length) {
          onChange(options[focusedIdx].value);
          close();
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  }

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => (isOpen ? close() : open())}
        className={cn(
          "h-9 px-3 pr-8 rounded-lg text-sm font-mono cursor-pointer relative",
          "transition-all focus:outline-none focus:ring-2 focus:ring-primary/30",
          isFiltered
            ? "bg-primary/10 text-primary font-semibold dark:bg-primary/15"
            : "bg-muted/30 text-foreground hover:bg-muted/50 dark:bg-muted/20 dark:hover:bg-muted/30",
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {selectedLabel}
        <ChevronDown
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={
            focusedIdx >= 0 ? `option-${options[focusedIdx].value}` : undefined
          }
          className={cn(
            "absolute left-0 top-full mt-1.5 z-50",
            "min-w-[200px] max-h-[280px] overflow-y-auto",
            "bg-popover/95 backdrop-blur-xl rounded-lg",
            "ring-1 ring-foreground/10 shadow-xl py-1",
          )}
        >
          {options.map((o, idx) => {
            const isSelected = value === o.value;
            const isFocused = focusedIdx === idx;
            return (
              <div
                key={o.value}
                id={`option-${o.value}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusedIdx(idx)}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm font-mono text-left cursor-pointer transition-colors",
                  isSelected
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-popover-foreground",
                  isFocused && !isSelected && "bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center h-4 w-4 shrink-0",
                    !isSelected && "invisible",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  boards,
  filters,
  onFilterChange,
  onClearAll,
  isAdmin,
  onSyncNow,
  syncing,
}: FilterBarProps) {
  const hasFilters = Object.values(filters).some((v) => v !== "");

  const boardOptions = [
    { value: "", label: "All Boards" },
    ...boards.map((b) => ({ value: b.jiraKey, label: `${b.jiraKey} — ${b.name}` })),
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />

      <FilterSelect
        value={filters.board}
        onChange={(v) => onFilterChange("board", v)}
        options={boardOptions}
      />
      <FilterSelect
        value={filters.availability}
        onChange={(v) => onFilterChange("availability", v)}
        options={availabilityOptions}
      />
      <FilterSelect
        value={filters.type}
        onChange={(v) => onFilterChange("type", v)}
        options={typeOptions}
      />
      <FilterSelect
        value={filters.priority}
        onChange={(v) => onFilterChange("priority", v)}
        options={priorityOptions}
      />
      <FilterSelect
        value={filters.status}
        onChange={(v) => onFilterChange("status", v)}
        options={statusOptions}
      />

      {hasFilters && (
        <button
          onClick={onClearAll}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}

      {isAdmin && onSyncNow && (
        <button
          onClick={onSyncNow}
          disabled={syncing}
          className="ml-auto flex items-center gap-2 px-4 h-9 rounded-lg text-xs font-bold font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          Sync Now
        </button>
      )}
    </div>
  );
}
