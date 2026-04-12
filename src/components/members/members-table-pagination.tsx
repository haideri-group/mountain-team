"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PageSize = 20 | 50 | 70 | 100;

export interface PaginationState {
  page: number;
  pageSize: PageSize;
}

interface MembersTablePaginationProps {
  /** Total number of *filtered* members being paginated. */
  totalCount: number;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZES: PageSize[] = [20, 50, 70, 100];

/**
 * Returns the page number buttons to render.
 * Uses ellipsis ("...") tokens to truncate large ranges.
 *
 * Rules:
 *   - Always show first + last page
 *   - Always show 1 page on each side of the active page
 *   - Collapse everything else into a single "..." token
 *
 * Examples (10 pages):
 *   page 1  → [1] 2 3 … 10
 *   page 5  → 1 … 4 [5] 6 … 10
 *   page 10 → 1 … 8 9 [10]
 */
function buildPageRange(
  current: number,
  total: number,
): (number | "ellipsis-start" | "ellipsis-end")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];

  const showLeftEllipsis = current > 4;
  const showRightEllipsis = current < total - 3;

  pages.push(1);

  if (showLeftEllipsis) {
    pages.push("ellipsis-start");
  } else {
    for (let i = 2; i <= Math.min(4, current + 1); i++) pages.push(i);
  }

  // Surrounding window
  const start = showLeftEllipsis ? current - 1 : current + 2;
  const end = showRightEllipsis ? current + 1 : current - 2;
  for (let i = start; i <= end; i++) {
    if (i > 1 && i < total) pages.push(i);
  }

  if (showRightEllipsis) {
    pages.push("ellipsis-end");
  } else {
    for (let i = Math.max(current - 1, total - 3); i < total; i++) {
      if (i > 1) pages.push(i);
    }
  }

  pages.push(total);

  // Remove accidental duplicates while preserving order
  const seen = new Set<string | number>();
  return pages.filter((p) => {
    const key = typeof p === "number" ? p : p;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * A single page number button.
 * Active state: solid #ff8400 pill — unmistakable without needing a border.
 * Inactive state: transparent with hover surface lift.
 */
function PageButton({
  page,
  isActive,
  onClick,
}: {
  page: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Go to page ${page}`}
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
      className={cn(
        // Base — monospaced, tight, perfectly square on all sizes
        "relative inline-flex items-center justify-center",
        "h-7 min-w-7 rounded-full px-1.5",
        "text-xs font-mono font-bold tracking-wide",
        "transition-all duration-150 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        isActive
          ? [
              // Active: primary gradient pill — no border needed, color is the signal
              "text-white",
              "shadow-[0_1px_4px_0_rgba(255,132,0,0.35)]",
            ]
          : [
              // Inactive: ghost — lifts on hover via muted surface
              "text-muted-foreground hover:text-foreground",
              "hover:bg-muted/40",
            ],
      )}
      style={
        isActive
          ? { background: "linear-gradient(135deg, #944a00, #ff8400)" }
          : undefined
      }
    >
      {page}
    </button>
  );
}

/**
 * Prev / Next arrow buttons.
 * Disabled at the boundaries — visually faded, cursor blocked.
 */
function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const label = direction === "prev" ? "Previous page" : "Next page";

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center",
        "h-7 w-7 rounded-full",
        "transition-all duration-150 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        disabled
          ? "pointer-events-none opacity-30 cursor-not-allowed"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
      )}
    >
      {direction === "prev" ? (
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      )}
    </button>
  );
}

/**
 * Ellipsis spacer — purely decorative, not interactive.
 */
function EllipsisToken() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center h-7 w-5 text-xs text-muted-foreground/60 font-mono select-none"
    >
      …
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * MembersTablePagination
 *
 * Sits flush at the bottom of the `bg-card rounded-xl` table container.
 * Separated from the table body by a single surface-shift row (bg-muted/20).
 *
 * Layout (left → right):
 *   [Page size selector]   [Showing X–Y of Z members]   [Prev · Pages · Next]
 *
 * On mobile (<sm): the page size selector and count text collapse.
 * Only the page navigator remains fully visible.
 */
export function MembersTablePagination({
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
}: MembersTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Clamp page to valid range (e.g. after a filter reduces total)
  const safePage = Math.min(Math.max(1, page), totalPages);

  const rangeStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalCount);

  const pageRange = buildPageRange(safePage, totalPages);

  const [sizeDropdownOpen, setSizeDropdownOpen] = useState(false);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(e.target as Node)) {
        setSizeDropdownOpen(false);
      }
    };
    if (sizeDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [sizeDropdownOpen]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        "px-5 py-3.5",
        "bg-muted/20",
        "rounded-b-xl",
        className,
      )}
    >
      {/* ── Left cluster: page size selector ──────────────────────────── */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden sm:block">
          Rows
        </span>

        {/* Custom styled dropdown — no native <select> to avoid OS-styled popup */}
        <div ref={sizeDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setSizeDropdownOpen(!sizeDropdownOpen)}
            aria-label="Items per page"
            className={cn(
              "h-7 pl-3 pr-7 rounded-full",
              "bg-muted/30",
              "text-xs font-mono font-semibold text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring/40",
              "transition-colors cursor-pointer",
              "inline-flex items-center gap-1 relative",
            )}
          >
            {pageSize}
            <ChevronDown className="h-3 w-3 text-muted-foreground absolute right-2" />
          </button>

          {sizeDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-20 rounded-lg bg-popover shadow-lg ring-1 ring-foreground/10 overflow-hidden z-50">
              {PAGE_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    onPageSizeChange(size);
                    onPageChange(1);
                    setSizeDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-xs font-mono font-semibold text-left transition-colors",
                    size === pageSize
                      ? "text-primary bg-primary/10"
                      : "text-foreground hover:bg-muted/40",
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Center: record range summary ──────────────────────────────── */}
      <p
        className={cn(
          "text-[10px] font-mono font-medium tracking-wide",
          "text-muted-foreground",
          // Hidden on mobile — keeps the nav centered
          "hidden sm:block",
          // Flex-grow so it can absorb extra space on wider viewports
          "flex-1 text-center",
        )}
      >
        {totalCount === 0 ? (
          <span className="text-muted-foreground/50">No members found</span>
        ) : (
          <>
            <span className="text-foreground font-bold">
              {rangeStart}–{rangeEnd}
            </span>{" "}
            <span className="uppercase tracking-widest">of</span>{" "}
            <span className="text-foreground font-bold">{totalCount}</span>{" "}
            <span className="uppercase tracking-widest text-muted-foreground/60">
              members
            </span>
          </>
        )}
      </p>

      {/* ── Right cluster: page navigation ────────────────────────────── */}
      <nav
        aria-label="Pagination"
        className="flex items-center gap-0.5 ml-auto sm:ml-0"
      >
        {/* Mobile-only compact count (replaces the center paragraph) */}
        <span className="text-[10px] font-mono text-muted-foreground mr-2 sm:hidden">
          {safePage}/{totalPages}
        </span>

        <NavButton
          direction="prev"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        />

        {/* Page buttons — hidden on mobile to keep the bar compact */}
        <div className="hidden sm:flex items-center gap-0.5">
          {pageRange.map((token) => {
            if (token === "ellipsis-start" || token === "ellipsis-end") {
              return <EllipsisToken key={token} />;
            }
            return (
              <PageButton
                key={token}
                page={token}
                isActive={token === safePage}
                onClick={() => onPageChange(token)}
              />
            );
          })}
        </div>

        <NavButton
          direction="next"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        />
      </nav>
    </div>
  );
}
