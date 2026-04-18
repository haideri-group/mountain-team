"use client";

/**
 * Shared FilterSelect dropdown component used across all pages.
 * Provides keyboard navigation, ARIA roles, and consistent styling.
 */

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Align dropdown panel. "left" = left edge aligns with trigger. "right" = right edge aligns. Default: "left". */
  align?: "left" | "right";
}

export function FilterSelect({ value, onChange, options, align = "left" }: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const listboxId = `filter-listbox-${instanceId}`;

  const defaultValue = options[0]?.value ?? "";
  const normalizedValue = options.some((o) => o.value === value) ? value : defaultValue;
  const selectedLabel = options.find((o) => o.value === normalizedValue)?.label ?? options[0]?.label;
  const isFiltered = normalizedValue !== defaultValue;

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const open = useCallback(() => {
    const idx = options.findIndex((o) => o.value === value);
    setFocusedIdx(idx >= 0 ? idx : 0);
    setIsOpen(true);
  }, [options, value]);

  useEffect(() => {
    if (!isOpen || focusedIdx < 0) return;
    const el = listRef.current?.children[focusedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [isOpen, focusedIdx]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        open();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, options.length - 1)); break;
      case "ArrowUp": e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); break;
      case "Home": e.preventDefault(); setFocusedIdx(0); break;
      case "End": e.preventDefault(); setFocusedIdx(options.length - 1); break;
      case "Enter": case " ":
        e.preventDefault();
        if (focusedIdx >= 0 && focusedIdx < options.length) { onChange(options[focusedIdx].value); close(); }
        break;
      case "Escape": e.preventDefault(); close(); break;
      case "Tab": setIsOpen(false); break;
    }
  }

  return (
    <div ref={ref} className="relative shrink-0" onKeyDown={handleKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (isOpen ? close() : open())}
        className={cn(
          "h-9 px-3 pr-8 rounded-lg text-xs font-mono cursor-pointer relative",
          "transition-all focus:outline-none focus:ring-2 focus:ring-primary/30",
          isFiltered
            ? "bg-primary/10 text-primary font-semibold ring-1 ring-primary/20 dark:bg-primary/15"
            : "bg-card text-foreground hover:bg-muted/30 ring-1 ring-foreground/10",
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
      >
        {selectedLabel}
        <ChevronDown className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180",
        )} />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={focusedIdx >= 0 ? `${listboxId}-opt-${focusedIdx}` : undefined}
          className={cn(
            "absolute top-full mt-1.5 z-50",
            align === "right" ? "right-0" : "left-0",
            "min-w-[220px] max-h-[320px] overflow-y-auto",
            "rounded-xl py-2",
            "bg-card shadow-2xl",
            "ring-1 ring-foreground/10",
            "[&::-webkit-scrollbar]:w-1.5",
            "[&::-webkit-scrollbar-track]:bg-transparent",
            "[&::-webkit-scrollbar-thumb]:bg-muted/50",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb:hover]:bg-muted",
          )}
          style={{ scrollbarWidth: "thin", scrollbarColor: "var(--color-muted) transparent" }}
        >
          {options.map((o, idx) => {
            const isSelected = value === o.value;
            const isFocused = focusedIdx === idx;
            return (
              <div
                key={o.value}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusedIdx(idx)}
                onClick={() => { onChange(o.value); close(); }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 text-xs font-mono cursor-pointer transition-colors mx-1.5 rounded-lg whitespace-nowrap",
                  isSelected
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-foreground",
                  isFocused && !isSelected && "bg-muted/50",
                )}
              >
                <span className={cn(
                  "flex items-center justify-center h-4 w-4 rounded-full shrink-0",
                  isSelected ? "bg-primary/20" : "bg-transparent",
                  !isSelected && "invisible",
                )}>
                  <Check className="h-3 w-3" />
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
