"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";

interface BoardSlice {
  name: string;
  key: string;
  count: number;
  color: string;
}

interface BoardDistributionProps {
  data: BoardSlice[];
}

function CustomTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-popover ring-1 ring-foreground/10 shadow-lg rounded-lg px-3 py-2">
      <p className="text-xs font-bold font-mono">{item.name}</p>
      <p className="text-xs text-muted-foreground">
        <span
          style={{ color: (item.payload as BoardSlice).color }}
          className="font-semibold"
        >
          {item.value}
        </span>{" "}
        tasks
      </p>
    </div>
  );
}

interface PieLabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}

function CustomLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: PieLabelProps) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontFamily="var(--font-geist-mono)"
      fontWeight="bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function BoardDistribution({ data }: BoardDistributionProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6">
        <h3 className="text-base font-bold font-mono uppercase tracking-wider mb-4">
          Board Distribution
        </h3>
        <div className="h-[300px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-card rounded-xl p-6">
      <h3 className="text-base font-bold font-mono uppercase tracking-wider mb-2">
        Board Distribution
      </h3>

      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="count"
            nameKey="name"
            labelLine={false}
            label={<CustomLabel />}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={(props) => <CustomTooltip {...props} />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-3 space-y-1.5">
        {data.map((board) => (
          <div key={board.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: board.color }}
              />
              <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                {board.name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold font-mono tabular-nums">
                {board.count}
              </span>
              <span className="text-xs font-mono text-muted-foreground w-9 text-right">
                {total > 0 ? ((board.count / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
