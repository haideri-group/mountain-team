"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { InfoButton } from "@/components/shared/info-modal";

interface SnapshotPoint {
  date: string;
  done: number;
  inProgress: number;
  toDo: number;
  staging: number;
  production: number;
}

const axisStyle = {
  fontSize: 10,
  fontFamily: "var(--font-geist-mono)",
  fill: "var(--muted-foreground)",
};

function CustomTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover ring-1 ring-foreground/10 shadow-lg rounded-lg px-3 py-2 min-w-[130px]">
      <p className="text-xs font-bold font-mono mb-1">{label}</p>
      {payload.map((p) => (
        <p key={String(p.name)} className="text-xs text-muted-foreground">
          <span style={{ color: p.color as string }} className="font-semibold">
            {p.name}:
          </span>{" "}
          {p.value}
        </p>
      ))}
    </div>
  );
}

function formatTick(date: string): string {
  // YYYY-MM-DD → "12 Apr"
  const [, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(2000, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function ReleaseBurndownChart({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<SnapshotPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/releases/${releaseId}/history`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
        const json = (await res.json()) as { snapshots: SnapshotPoint[] };
        if (!cancelled) setData(json.snapshots);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  if (error) {
    return (
      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Burndown
          </h3>
          <InfoButton guideKey="releaseBurndown" />
        </div>
        <p className="text-xs text-destructive">{error}</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Burndown
          </h3>
          <InfoButton guideKey="releaseBurndown" />
        </div>
        <div className="h-[220px] flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Burndown
          </h3>
          <InfoButton guideKey="releaseBurndown" />
        </div>
        <div className="h-[220px] flex items-center justify-center">
          <p className="text-xs text-muted-foreground">
            No snapshots yet — first data point lands on the next issue sync.
          </p>
        </div>
      </div>
    );
  }

  const shaped = data.map((p) => ({
    date: formatTick(p.date),
    Done: p.done,
    "In progress": p.inProgress,
    "To do": p.toDo,
  }));

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Burndown
          </h3>
          <InfoButton guideKey="releaseBurndown" />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{data.length} snapshots</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={shaped} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" strokeOpacity={0.3} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={(props) => <CustomTooltip {...props} />} cursor={{ stroke: "var(--muted)", strokeOpacity: 0.3 }} />
          <Line
            type="monotone"
            dataKey="Done"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="In progress"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="To do"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
