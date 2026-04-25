"use client";

import Image from "next/image";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Search, Clock } from "lucide-react";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";
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
  type: string | null;
  boardKey: string;
  boardColor: string;
  assigneeName: string | null;
}

interface SearchResults {
  members: MemberResult[];
  issues: IssueResult[];
}

// ─── JIRA URL detection ──────────────────────────────────────────────────────

const JIRA_KEY_REGEX = /[A-Z]{2,}-\d+/i;

function extractJiraKeyFromInput(input: string): string | null {
  const trimmed = input.trim();

  // Full JIRA URL: https://tilemountain.atlassian.net/browse/PROD-5849
  if (trimmed.includes("/browse/")) {
    const match = trimmed.match(/\/browse\/([A-Z]{2,}-\d+)/i);
    return match ? match[1].toUpperCase() : null;
  }

  // Bare JIRA key: PROD-5849
  if (JIRA_KEY_REGEX.test(trimmed) && !trimmed.includes(" ")) {
    const match = trimmed.match(JIRA_KEY_REGEX);
    return match ? match[0].toUpperCase() : null;
  }

  return null;
}

// ─── Recent Searches (localStorage) ──────────────────────────────────────────

const RECENT_KEY = "teamflow_recent_searches";
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(q: string) {
  const trimmed = q.trim();
  if (trimmed.length < 2) return;
  const recent = getRecentSearches().filter((s) => s !== trimmed);
  recent.unshift(trimmed);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
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
      <Image
        src={src}
        alt={name}
        width={28}
        height={28}
        unoptimized
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
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

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

    if (e.key === "Enter") {
      // Check for JIRA URL or bare key — navigate directly
      const jiraKey = extractJiraKeyFromInput(query);
      if (jiraKey) {
        e.preventDefault();
        addRecentSearch(jiraKey);
        setRecentSearches(getRecentSearches());
        setIsOpen(false);
        setQuery("");
        setResults(null);
        router.push(`/issue/${jiraKey}`);
        return;
      }

      // Navigate to focused search result
      if (focusedIndex >= 0 && allItems[focusedIndex]) {
        e.preventDefault();
        navigateTo(allItems[focusedIndex]);
        return;
      }
    }

    if (!isOpen || allItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    }
  }

  function navigateTo(entry: { type: "member" | "issue"; item: MemberResult | IssueResult }) {
    if (query.trim()) {
      addRecentSearch(query.trim());
      setRecentSearches(getRecentSearches());
    }
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
  const detectedKey = query.length >= 2 ? extractJiraKeyFromInput(query) : null;
  const showEmpty = results && !hasResults && query.length >= 2 && !isLoading && !detectedKey;

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
          suppressHydrationWarning
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
          {/* Recent searches — shown when no query */}
          {query.length < 2 && !isLoading && recentSearches.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
                <p className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground">
                  Recent
                </p>
                <button
                  onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                  className="text-[10px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Clear
                </button>
              </div>
              <ul>
                {recentSearches.map((term) => (
                  <li key={term}>
                    <button
                      onClick={() => {
                        setQuery(term);
                        search(term);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/50 transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      <span className="text-sm text-foreground truncate">{term}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prompt state — no query and no recent searches */}
          {query.length < 2 && !isLoading && recentSearches.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Search className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Type to search members and issues
              </p>
            </div>
          )}

          {/* JIRA key detected — direct navigation hint */}
          {detectedKey && (
            <button
              onClick={() => {
                addRecentSearch(detectedKey);
                setRecentSearches(getRecentSearches());
                setIsOpen(false);
                setQuery("");
                setResults(null);
                router.push(`/issue/${detectedKey}`);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
            >
              <span className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Search className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Open <span className="font-bold font-mono text-primary">{detectedKey}</span>
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Press Enter or click to navigate
                </p>
              </div>
              <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Enter
              </kbd>
            </button>
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
                        {/* Issue type icon + board-colored key */}
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-bold font-mono uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded"
                          style={{
                            color: issue.boardColor,
                            backgroundColor: `${issue.boardColor}18`,
                          }}
                        >
                          <IssueTypeIcon type={issue.type} size={12} />
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
