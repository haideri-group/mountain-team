"use client";

import { useState, useMemo } from "react";
import {
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  X,
  CalendarRange,
} from "lucide-react";
import Link from "next/link";
import { IssueStatusBadge } from "@/components/overview/issue-status-badge";
import { IssueTypeIcon } from "@/components/shared/issue-type-icon";

interface TaskIssue {
  id: string;
  jiraKey: string;
  title: string;
  status: string;
  priority: string | null;
  type: string | null;
  dueDate: string | null;
  completedDate: string | null;
  cycleTime: number | null;
  storyPoints: number | null;
  boardKey: string;
  boardColor: string;
  jiraCreatedAt: string | null;
}

interface TaskHistoryTableProps {
  issues: TaskIssue[];
  boards: { id: string; jiraKey: string; name: string; color: string | null }[];
}

const PAGE_SIZE_OPTIONS = [7, 15, 25, 50];

const priorityColors: Record<string, string> = {
  highest: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-blue-600 dark:text-blue-400",
  lowest: "text-gray-500 dark:text-gray-400",
};

const priorityLabels: Record<string, string> = {
  highest: "Highest",
  high: "High",
  medium: "Medium",
  low: "Low",
  lowest: "Lowest",
};

type SortField =
  | "jiraKey"
  | "title"
  | "status"
  | "priority"
  | "jiraCreatedAt"
  | "dueDate"
  | "completedDate"
  | "cycleTime";
type SortDir = "asc" | "desc";
type DateField = "jiraCreatedAt" | "dueDate" | "completedDate";

const dateFieldLabels: Record<DateField, string> = {
  jiraCreatedAt: "Created",
  dueDate: "Due Date",
  completedDate: "Completed",
};

function toDateOnly(dateStr: string): string {
  return dateStr.substring(0, 10);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TaskHistoryTable({ issues, boards }: TaskHistoryTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [boardFilter, setBoardFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dateField, setDateField] = useState<DateField>("completedDate");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("jiraCreatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(7);

  const hasDateFilter = dateFrom || dateTo;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let result = [...issues];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.jiraKey.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q),
      );
    }

    if (statusFilter) {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (boardFilter) {
      result = result.filter((i) => i.boardKey === boardFilter);
    }

    if (priorityFilter) {
      result = result.filter((i) => i.priority === priorityFilter);
    }

    if (dateFrom || dateTo) {
      result = result.filter((i) => {
        const raw = i[dateField];
        if (!raw) return false;
        const val = toDateOnly(raw);
        if (dateFrom && val < dateFrom) return false;
        if (dateTo && val > dateTo) return false;
        return true;
      });
    }

    // Sort
    const priorityOrder = ["highest", "high", "medium", "low", "lowest"];
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "jiraKey":
          cmp = a.jiraKey.localeCompare(b.jiraKey);
          break;
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "priority":
          cmp =
            priorityOrder.indexOf(a.priority || "medium") -
            priorityOrder.indexOf(b.priority || "medium");
          break;
        case "jiraCreatedAt":
          cmp = (a.jiraCreatedAt || "").localeCompare(b.jiraCreatedAt || "");
          break;
        case "dueDate":
          cmp = (a.dueDate || "").localeCompare(b.dueDate || "");
          break;
        case "completedDate":
          cmp = (a.completedDate || "").localeCompare(b.completedDate || "");
          break;
        case "cycleTime":
          cmp = (a.cycleTime || 0) - (b.cycleTime || 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [issues, searchQuery, statusFilter, boardFilter, priorityFilter, dateField, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  const isMissedDeadline = (issue: TaskIssue) => {
    if (!issue.dueDate) return false;
    if (issue.status === "done" || issue.status === "closed") {
      return (
        issue.completedDate != null && issue.completedDate > issue.dueDate
      );
    }
    return issue.dueDate < new Date().toISOString().split("T")[0];
  };

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold font-mono">Task History</h3>
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-muted/30 text-muted-foreground">
              {filtered.length} total
            </span>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search tasks..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="h-8 px-3 rounded-lg bg-muted/30 text-xs font-mono appearance-none cursor-pointer focus:outline-none pr-7"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 6px center",
            }}
          >
            <option value="">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="on_hold">On Hold</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="ready_for_testing">Ready for Testing</option>
            <option value="ready_for_live">Ready for Live</option>
            <option value="done">Done</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={boardFilter}
            onChange={(e) => {
              setBoardFilter(e.target.value);
              setPage(0);
            }}
            className="h-8 px-3 rounded-lg bg-muted/30 text-xs font-mono appearance-none cursor-pointer focus:outline-none pr-7"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 6px center",
            }}
          >
            <option value="">All Boards</option>
            {boards.map((b) => (
              <option key={b.id} value={b.jiraKey}>
                {b.jiraKey}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(0);
            }}
            className="h-8 px-3 rounded-lg bg-muted/30 text-xs font-mono appearance-none cursor-pointer focus:outline-none pr-7"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 6px center",
            }}
          >
            <option value="">All Priorities</option>
            <option value="highest">Highest</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="lowest">Lowest</option>
          </select>

          {/* Date range separator */}
          <div className="h-4 w-px bg-border/50 mx-1" />

          {/* Date range filter */}
          <div className="flex items-center gap-2">
            <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={dateField}
              onChange={(e) => {
                setDateField(e.target.value as DateField);
                setPage(0);
              }}
              className="h-8 px-3 rounded-lg bg-muted/30 text-xs font-mono appearance-none cursor-pointer focus:outline-none pr-7"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
              }}
            >
              {Object.entries(dateFieldLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="h-8 px-2.5 rounded-lg bg-muted/30 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all [color-scheme:light] dark:[color-scheme:dark]"
              placeholder="From"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="h-8 px-2.5 rounded-lg bg-muted/30 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all [color-scheme:light] dark:[color-scheme:dark]"
              placeholder="To"
            />
            {hasDateFilter && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/20">
              {[
                { field: "jiraKey" as SortField, label: "Task", width: "w-[120px]" },
                { field: "title" as SortField, label: "Title", width: "" },
                { field: "status" as SortField, label: "Status", width: "w-[140px]" },
                { field: "priority" as SortField, label: "Priority", width: "w-[90px]" },
                { field: "jiraCreatedAt" as SortField, label: "Created", width: "w-[120px]" },
                { field: "dueDate" as SortField, label: "Due Date", width: "w-[120px]" },
                { field: "completedDate" as SortField, label: "Completed", width: "w-[120px]" },
                { field: "cycleTime" as SortField, label: "Cycle", width: "w-[70px]" },
              ].map((col) => (
                <th
                  key={col.field}
                  onClick={() => handleSort(col.field)}
                  className={`px-4 py-3 text-left text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors ${col.width} ${sortField === col.field ? "bg-muted/30" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    <SortIcon field={col.field} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No tasks found
                </td>
              </tr>
            )}
            {pageItems.map((issue) => {
              const missed = isMissedDeadline(issue);
              return (
                <tr
                  key={issue.id}
                  className={`border-t border-border/30 ${missed ? "bg-red-50/50 dark:bg-red-950/20" : "hover:bg-muted/5"} transition-colors`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/issue/${issue.jiraKey}`}
                      className="text-xs font-bold font-mono hover:underline inline-flex items-center gap-1.5"
                      style={{ color: issue.boardColor }}
                    >
                      <IssueTypeIcon type={issue.type} size={14} />
                      {issue.jiraKey}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-foreground line-clamp-1">
                      {issue.title}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <IssueStatusBadge status={issue.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-mono font-semibold ${priorityColors[issue.priority || "medium"]}`}
                    >
                      {priorityLabels[issue.priority || "medium"] || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatDate(issue.jiraCreatedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-mono ${missed ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}
                    >
                      {formatDate(issue.dueDate)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-mono ${missed ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
                    >
                      {formatDate(issue.completedDate)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-mono ${missed ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
                    >
                      {issue.cycleTime ? `${issue.cycleTime}d` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="h-8 px-2 rounded-lg bg-muted/30 text-xs font-mono appearance-none cursor-pointer focus:outline-none pr-6"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 4px center",
            }}
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} per page
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Showing {filtered.length === 0 ? 0 : page * pageSize + 1}-
            {Math.min((page + 1) * pageSize, filtered.length)} of{" "}
            {filtered.length} tasks
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-red-500">
            <Circle className="h-2 w-2 fill-red-500 text-red-500" />
            = Missed deadline
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="p-2 rounded-lg hover:bg-muted/30 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i;
            } else if (page < 3) {
              pageNum = i;
            } else if (page > totalPages - 3) {
              pageNum = totalPages - 5 + i;
            } else {
              pageNum = page - 2 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`h-8 w-8 rounded-lg text-xs font-mono transition-colors ${
                  page === pageNum
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                {pageNum + 1}
              </button>
            );
          })}
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="p-2 rounded-lg hover:bg-muted/30 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
