"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { LogsSummaryStrip } from "./logs-summary-strip";
import { LogsFilters, type LogsFiltersValue } from "./logs-filters";
import { LogsTable, type LogRow } from "./logs-table";
import { LogsDrawer, type LogDetail } from "./logs-drawer";
import { CronicleSchedulePanel } from "./cronicle-schedule-panel";

interface ListResponse {
  rows: LogRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_FILTERS: LogsFiltersValue = {
  type: "all",
  status: "all",
  source: "all",
  from: "",
  to: "",
};

const PAGE_SIZE_OPTIONS = [20, 24, 48, 75, 100] as const;

export function LogsView() {
  const [filters, setFilters] = useState<LogsFiltersValue>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [data, setData] = useState<ListResponse | null>(null);
  // Two-flag pattern: `initialLoading` drives the first-paint skeleton;
  // background refreshes leave `data` on screen so SSE-driven reloads
  // don't blank the table. Only shows a subtle "refreshing…" pip.
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Bumped every time the SSE stream emits a sync_log change. Child
  // panels subscribe via the `refreshTick` prop so their `useEffect`
  // refetches automatically.
  const [refreshTick, setRefreshTick] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (filters.type !== "all") params.set("type", filters.type);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.source !== "all") params.set("source", filters.source);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    return params.toString();
  }, [filters, page, pageSize]);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/automations?${query}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as ListResponse;
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // Subscribe to server-side event stream exactly once per mount. We read
  // the latest `load` / `selectedId` / `loadDetail` via refs so changing
  // filters or the selected row does NOT re-open the EventSource.
  const loadRef = useRef(load);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/automations/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as LogDetail;
      setDetail(body);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadDetailRef = useRef(loadDetail);
  useEffect(() => {
    loadDetailRef.current = loadDetail;
  });

  // SSE subscription — opened exactly once per page mount. Handler reads
  // from refs so filter / page / row-click changes don't tear down the
  // connection. Auto-reconnects on transient network errors natively.
  useEffect(() => {
    const es = new EventSource("/api/automations/events");
    es.addEventListener("message", (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.event === "syncLog") {
          loadRef.current();
          setRefreshTick((t) => t + 1);
          if (selectedIdRef.current === evt.id) {
            loadDetailRef.current(evt.id);
          }
        }
      } catch {
        // malformed event — ignore
      }
    });
    return () => es.close();
  }, []);

  const onRowClick = useCallback(
    (id: string) => {
      // Clear previous row's detail immediately so the drawer shows the
      // skeleton instead of briefly rendering stale content from the last
      // opened row while the new fetch is in flight.
      setDetail(null);
      setSelectedId(id);
      loadDetail(id);
    },
    [loadDetail],
  );

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  // Poll detail every 1s while drawer open on a running row.
  useEffect(() => {
    if (!selectedId || !detail || detail.log.status !== "running") return;
    const handle = setInterval(() => loadDetail(selectedId), 1000);
    return () => clearInterval(handle);
  }, [selectedId, detail, loadDetail]);

  const handleFilterChange = useCallback((next: LogsFiltersValue) => {
    setFilters(next);
    setPage(1);
  }, []);

  const onMarkFailed = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/automations/${encodeURIComponent(id)}/fail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await loadDetail(id);
      await load();
    },
    [load, loadDetail],
  );

  const onReclaimAll = useCallback(async (): Promise<{ reclaimed: number }> => {
    // Match the banner's "stuck for more than 1 hour" semantic. Server
    // default is 2 min (safe lower bound); we pass 1h explicitly so the
    // button can't accidentally reclaim a long-running sync (e.g. a
    // legitimate 45-min deployment backfill).
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const res = await fetch(`/api/automations/reclaim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graceMs: ONE_HOUR_MS }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => ({}))) as {
      reclaimed?: number;
    };
    await load();
    // Force summary + schedule panels to refetch too. When `reclaimed=0`
    // no SSE event fires from the server, so without this bump the
    // summary strip's stuckOver1h count can stay stale and the banner
    // would linger even though the server reports zero stuck rows.
    setRefreshTick((t) => t + 1);
    return { reclaimed: body.reclaimed ?? 0 };
  }, [load]);

  return (
    <div className="space-y-6">
      <LogsSummaryStrip onReclaimAll={onReclaimAll} refreshTick={refreshTick} />

      <CronicleSchedulePanel onViewRun={onRowClick} refreshTick={refreshTick} />

      <div className="flex items-center justify-between gap-4">
        <LogsFilters value={filters} onChange={handleFilterChange} />
        <button
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 h-9 rounded-lg bg-muted/40 hover:bg-muted/60 text-sm font-mono uppercase tracking-wider transition-colors disabled:opacity-50"
          suppressHydrationWarning
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Reload
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <LogsTable
        rows={data?.rows ?? []}
        loading={initialLoading && data === null}
        onRowClick={onRowClick}
      />

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
          <span>
            Page {data.page} of {data.totalPages} · {data.totalCount} run
            {data.totalCount === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
              Per page
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-lg bg-background px-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#ff8400]/30"
                suppressHydrationWarning
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || refreshing}
              className="px-3 h-8 rounded-lg bg-muted/40 hover:bg-muted/60 disabled:opacity-50"
              suppressHydrationWarning
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages || refreshing}
              className="px-3 h-8 rounded-lg bg-muted/40 hover:bg-muted/60 disabled:opacity-50"
              suppressHydrationWarning
            >
              Next
            </button>
          </div>
        </div>
      )}

      <LogsDrawer
        open={!!selectedId}
        detail={detail}
        loading={detailLoading}
        onClose={closeDrawer}
        onMarkFailed={onMarkFailed}
      />
    </div>
  );
}
