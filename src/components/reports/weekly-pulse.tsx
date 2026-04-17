"use client";

import { ChartInfo } from "./chart-info";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";

interface WeeklyPoint {
  week: string;
  created: number;
  completed: number;
}

interface WeeklyPulseProps {
  data: WeeklyPoint[];
}

function CustomTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover ring-1 ring-foreground/10 shadow-lg rounded-lg px-3 py-2 min-w-[120px]">
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

const axisStyle = {
  fontSize: 10,
  fontFamily: "var(--font-geist-mono)",
  fill: "var(--muted-foreground)",
};

export function WeeklyPulse({ data }: WeeklyPulseProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Weekly Pulse
          </h3>
          <ChartInfo chartId="weeklyPulse" />
        </div>
        <div className="h-[260px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            Weekly Pulse
          </h3>
          <ChartInfo chartId="weeklyPulse" />
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          created vs completed
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barCategoryGap="32%" barGap={3}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--muted)"
            strokeOpacity={0.3}
            vertical={false}
          />
          <XAxis
            dataKey="week"
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
          <Tooltip
            content={(props) => <CustomTooltip {...props} />}
            cursor={{ fill: "var(--muted)", fillOpacity: 0.2 }}
          />
          <Legend
            wrapperStyle={{
              fontSize: 11,
              fontFamily: "var(--font-geist-mono)",
              paddingTop: 10,
            }}
          />
          <Bar
            dataKey="created"
            name="Created"
            fill="#93c5fd"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="completed"
            name="Completed"
            fill="#ff8400"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
