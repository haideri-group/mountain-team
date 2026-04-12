"use client";

import { ExternalLink } from "lucide-react";

interface BoardHealthRow {
  boardKey: string;
  boardName: string;
  color: string;
  active: number;
  blocked: number;
  overdue: number;
  done: number;
}

interface BoardHealthProps {
  data: BoardHealthRow[];
}

export function BoardHealth({ data }: BoardHealthProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl overflow-hidden">
        <div className="px-6 py-4">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Board Health
          </h3>
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  const headerCell =
    "px-4 py-3 text-left text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground";

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between">
        <h3 className="text-base font-bold font-mono uppercase tracking-wider">
          Board Health
        </h3>
        <span className="text-xs font-mono text-muted-foreground">
          {data.length} boards
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/20">
              <th className={headerCell}>Board</th>
              <th className={headerCell}>Active</th>
              <th className={headerCell}>Blocked</th>
              <th className={headerCell}>Overdue</th>
              <th className={headerCell}>Done</th>
            </tr>
          </thead>
          <tbody>
            {data.map((board) => {
              const total = board.active + board.blocked + board.overdue + board.done;
              const donePercent = total > 0 ? (board.done / total) * 100 : 0;

              return (
                <tr
                  key={board.boardKey}
                  className="border-t border-muted/20 hover:bg-muted/10 transition-colors"
                >
                  {/* Board name — links to JIRA board */}
                  <td className="px-4 py-3">
                    <a
                      href={`${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/jira/software/c/projects/${board.boardKey}/summary`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 group"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: board.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                          {board.boardName}
                        </p>
                        <p className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                          {board.boardKey}
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </p>
                      </div>
                    </a>
                  </td>

                  {/* Active */}
                  <td className="px-4 py-3 text-sm font-bold font-mono tabular-nums">
                    {board.active}
                  </td>

                  {/* Blocked */}
                  <td className="px-4 py-3 text-sm font-bold font-mono tabular-nums">
                    <span
                      className={
                        board.blocked > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }
                    >
                      {board.blocked}
                    </span>
                  </td>

                  {/* Overdue */}
                  <td className="px-4 py-3 text-sm font-bold font-mono tabular-nums">
                    <span
                      className={
                        board.overdue > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                      }
                    >
                      {board.overdue}
                    </span>
                  </td>

                  {/* Done with mini progress */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {board.done}
                      </span>
                      <div className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${donePercent}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground tabular-nums">
                        {donePercent.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
