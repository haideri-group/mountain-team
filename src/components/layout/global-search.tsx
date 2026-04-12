"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberResult {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  teamName: string | null;
  role: string | null;
  status: string;
}

interface IssueResult {
  id: string;
  jiraKey: string;
  title: string;
  status: string;
  boardKey: string;
  boardColor: string;
  assigneeName: string | null;
}

interface SearchResults {
  members: MemberResult[];
  issues: IssueResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MemberAvatar({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="h-7 w-7 rounded-full object-cover shrink-0"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold font-mono text-primary-foreground shrink-0"
    >
      {initials}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flat list of all navigable items for keyboard traversal
  const allItems = [
    ...(results?.members ?? []).map((m) => ({ type: "member" as const, item: m })),
    ...(results?.issues ?? []).map((i) => ({ type: "issue" as const, item: i })),
  ];

  // ── Global Cmd+K / Ctrl+K shortcut ────────────────────────────────────────
  useEffect(() => {
    function handleGlobalKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsOpen(true);
      }
    }
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  // ── Click outside + Escape ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // ── Debounced search ───────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      const data: SearchResults = await res.json();
      setResults(data);
      setFocusedIndex(-1);
    } catch {
      setResults({ members: [], issues: [] });
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(value), 300);
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen || allItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      const focused = allItems[focusedIndex];
      if (!focused) return;
      navigateTo(focused);
    }
  }

  function navigateTo(entry: { type: "member" | "issue"; item: MemberResult | IssueResult }) {
    setIsOpen(false);
    setQuery("");
    setResults(null);

    if (entry.type === "member") {
      router.push(`/members/${(entry.item as MemberResult).id}`);
    } else {
      router.push(`/issue/${(entry.item as IssueResult).jiraKey}`);
    }
  }

  const hasResults = results && (results.members.length > 0 || results.issues.length > 0);
  const showEmpty = results && !hasResults && query.length >= 2 && !isLoading;

  return (
    <div ref={containerRef} className="relative hidden md:block">
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative flex items-center gap-2 h-9 rounded-full transition-all",
          "bg-input px-3",
          isOpen
            ? "ring-1 ring-primary/50 w-[280px]"
            : "w-[200px] hover:w-[240px] focus-within:w-[280px]",
        )}
      >
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          autoComplete="off"
          spellCheck={false}
          aria-label="Search members and issues"
          aria-autocomplete="list"
          aria-controls="search-results"
          className={cn(
            "flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
            "focus:outline-none",
          )}
        />
        {/* Shortcut hint — hidden when typing */}
        {!query && (
          <kbd
            aria-hidden="true"
            className="hidden sm:flex items-center gap-0.5 shrink-0 text-[10px] font-mono text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-md"
          >
            <span>⌘K</span>
          </kbd>
        )}
      </div>

      {/* ── Results Dropdown ──────────────────────────────────────────────── */}
      {isOpen && (
        <div
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className={cn(
            "absolute left-0 top-full mt-2 z-50 w-[360px]",
            "bg-popover/95 backdrop-blur-xl",
            "ring-1 ring-foreground/10 shadow-2xl rounded-xl",
            "overflow-hidden",
          )}
        >
          {/* Prompt state — no query or too short */}
          {query.length < 2 && !isLoading && (
            <div className="px-4 py-8 text-center">
              <Search className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Type to search members and issues
              </p>
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && (
            <div className="px-4 py-3 space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-2/3" />
                    <div className="h-2.5 bg-muted rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          )}

          {/* Members section */}
          {!isLoading && results && results.members.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
                Members
              </p>
              <ul role="group" aria-label="Members">
                {results.members.map((member, idx) => {
                  const flatIdx = idx;
                  return (
                    <li key={member.id}>
                      <button
                        role="option"
                        aria-selected={focusedIndex === flatIdx}
                        onMouseEnter={() => setFocusedIndex(flatIdx)}
                        onClick={() =>
                          navigateTo({ type: "member", item: member })
                        }
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          "focus-visible:outline-none",
                          focusedIndex === flatIdx
                            ? "bg-accent"
                            : "hover:bg-accent/50",
                        )}
                      >
                        <MemberAvatar
                          src={member.avatarUrl}
                          name={member.displayName}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {member.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[member.teamName, member.role]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        {member.status === "departed" && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            DEPARTED
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Issues section */}
          {!isLoading && results && results.issues.length > 0 && (
            <div>
              {results.members.length > 0 && (
                <div className="h-px bg-foreground/5 mx-1 my-1" />
              )}
              <p className="px-4 pt-2 pb-1.5 text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
                Issues
              </p>
              <ul role="group" aria-label="Issues">
                {results.issues.map((issue, idx) => {
                  const flatIdx = (results?.members.length ?? 0) + idx;
                  return (
                    <li key={issue.id}>
                      <button
                        role="option"
                        aria-selected={focusedIndex === flatIdx}
                        onMouseEnter={() => setFocusedIndex(flatIdx)}
                        onClick={() =>
                          navigateTo({ type: "issue", item: issue })
                        }
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          "focus-visible:outline-none",
                          focusedIndex === flatIdx
                            ? "bg-accent"
                            : "hover:bg-accent/50",
                        )}
                      >
                        {/* Board-colored key */}
                        <span
                          className="text-[11px] font-bold font-mono uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded"
                          style={{
                            color: issue.boardColor,
                            backgroundColor: `${issue.boardColor}18`,
                          }}
                        >
                          {issue.jiraKey}
                        </span>

                        {/* Title */}
                        <p className="flex-1 text-sm text-foreground truncate min-w-0">
                          {issue.title}
                        </p>

                        {/* Status badge */}
                        <IssueStatusBadge status={issue.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Footer hint */}
          {hasResults && (
            <div className="h-px bg-foreground/5 mx-1" />
          )}
          {(hasResults || query.length >= 2) && (
            <div className="px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
              <span>
                <kbd className="bg-muted px-1 py-0.5 rounded">⌘K</kbd> to search
              </span>
              <span>·</span>
              <span>
                <kbd className="bg-muted px-1 py-0.5 rounded">ESC</kbd> to close
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
