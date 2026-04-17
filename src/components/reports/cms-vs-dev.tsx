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

interface CmsVsDevPoint {
  period: string;
  cms: number;
  dev: number;
}

interface CmsVsDevProps {
  data: CmsVsDevPoint[];
}

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
      {payload.length === 2 && (
        <p className="text-xs font-bold font-mono mt-1 pt-1 border-t border-muted/30">
          Total:{" "}
          {payload.reduce((s: number, p) => s + Number(p.value ?? 0), 0)}
        </p>
      )}
    </div>
  );
}

const axisStyle = {
  fontSize: 10,
  fontFamily: "var(--font-geist-mono)",
  fill: "var(--muted-foreground)",
};

export function CmsVsDev({ data }: CmsVsDevProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">
            CMS vs Development
          </h3>
          <ChartInfo chartId="cmsVsDev" />
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
            CMS vs Development
          </h3>
          <ChartInfo chartId="cmsVsDev" />
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          by task type
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barCategoryGap="28%" barGap={3}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--muted)"
            strokeOpacity={0.3}
            vertical={false}
          />
          <XAxis
            dataKey="period"
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
            dataKey="cms"
            name="CMS Changes"
            stackId="a"
            fill="#804200"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="dev"
            name="Development"
            stackId="a"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
