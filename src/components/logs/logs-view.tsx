"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
  }, [filters, page]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/logs?${query}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as ListResponse;
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/logs/${encodeURIComponent(id)}`, {
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

  const onRowClick = useCallback(
    (id: string) => {
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
      const res = await fetch(`/api/logs/${encodeURIComponent(id)}/fail`, {
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

  const onReclaimAll = useCallback(async () => {
    const res = await fetch(`/api/logs/reclaim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    await load();
  }, [load]);

  return (
    <div className="space-y-6">
      <LogsSummaryStrip onReclaimAll={onReclaimAll} />

      <CronicleSchedulePanel />

      <div className="flex items-center justify-between gap-4">
        <LogsFilters value={filters} onChange={handleFilterChange} />
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 h-9 rounded-lg bg-muted/40 hover:bg-muted/60 text-sm font-mono uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
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
        loading={loading}
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
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 h-8 rounded-lg bg-muted/40 hover:bg-muted/60 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages || loading}
              className="px-3 h-8 rounded-lg bg-muted/40 hover:bg-muted/60 disabled:opacity-50"
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
