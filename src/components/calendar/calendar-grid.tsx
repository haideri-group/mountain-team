"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { TaskChip } from "./task-chip";

interface CalendarEvent {
  id: string;
  issueKey: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  assigneeInitials: string;
  boardKey: string;
  boardColor: string;
  status: string;
  priority: string | null;
  type: string | null;
  startDate: string;
  endDate: string;
  isOverdue: boolean;
  teamName: string | null;
}

interface CalendarGridProps {
  year: number;
  month: number; // 1-12
  events: CalendarEvent[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_CHIPS = 3;

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface GridCell {
  day: number;
  month: number;
  year: number;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

export function CalendarGrid({ year, month, events }: CalendarGridProps) {
  const todayKey = new Date().toISOString().split("T")[0];

  // Build 42-cell grid (6 rows × 7 cols), week starts Monday
  const cells = useMemo<GridCell[]>(() => {
    const firstDay = new Date(year, month - 1, 1);
    // getDay(): 0=Sun,1=Mon,...,6=Sat → shift so Mon=0
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

    const grid: GridCell[] = [];

    // Leading cells from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const dateKey = toDateKey(prevYear, prevMonth, d);
      const dow = grid.length % 7;
      grid.push({
        day: d,
        month: prevMonth,
        year: prevYear,
        dateKey,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        isWeekend: dow === 5 || dow === 6,
      });
    }

    // Current month cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = toDateKey(year, month, d);
      const dow = grid.length % 7;
      grid.push({
        day: d,
        month,
        year,
        dateKey,
        isCurrentMonth: true,
        isToday: dateKey === todayKey,
        isWeekend: dow === 5 || dow === 6,
      });
    }

    // Trailing cells for next month
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    let nextDay = 1;
    while (grid.length < 42) {
      const dateKey = toDateKey(nextYear, nextMonth, nextDay);
      const dow = grid.length % 7;
      grid.push({
        day: nextDay,
        month: nextMonth,
        year: nextYear,
        dateKey,
        isCurrentMonth: false,
        isToday: dateKey === todayKey,
        isWeekend: dow === 5 || dow === 6,
      });
      nextDay++;
    }

    return grid;
  }, [year, month, todayKey]);

  // Group events by dateKey (use endDate as the display date)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.endDate || event.startDate;
      if (!key) continue;
      const existing = map.get(key) || [];
      existing.push(event);
      map.set(key, existing);
    }
    return map;
  }, [events]);

  const rows = useMemo(() => {
    const result: GridCell[][] = [];
    for (let i = 0; i < 6; i++) {
      result.push(cells.slice(i * 7, i * 7 + 7));
    }
    return result;
  }, [cells]);

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-foreground/5">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2.5 text-center text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar rows */}
      <div className="divide-y divide-foreground/5">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-7 divide-x divide-foreground/5" style={{ minHeight: "120px" }}>
            {row.map((cell) => {
              const cellEvents = eventsByDate.get(cell.dateKey) || [];
              const visible = cellEvents.slice(0, MAX_VISIBLE_CHIPS);
              const overflow = cellEvents.length - MAX_VISIBLE_CHIPS;

              return (
                <div
                  key={cell.dateKey}
                  className={cn(
                    "relative p-1.5 flex flex-col gap-1 min-h-[120px]",
                    cell.isWeekend && "bg-muted/10",
                    cell.isToday && "bg-primary/5",
                    !cell.isCurrentMonth && "opacity-30",
                  )}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-start px-0.5 mb-0.5">
                    <span
                      className={cn(
                        "text-xs font-mono leading-none",
                        cell.isToday
                          ? "h-5 w-5 flex items-center justify-center rounded-full bg-primary text-white font-bold text-[11px]"
                          : "text-muted-foreground font-medium",
                      )}
                    >
                      {cell.day}
                    </span>
                  </div>

                  {/* Event chips */}
                  <div className="flex flex-col gap-0.5 flex-1">
                    {visible.map((event) => (
                      <TaskChip key={event.id} event={event} />
                    ))}

                    {overflow > 0 && (
                      <span className="text-[9px] font-mono text-muted-foreground px-1.5 py-0.5">
                        +{overflow} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
