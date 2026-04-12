"use client";

import { useState, useCallback } from "react";
import { PieChart, Pie, Cell, Sector, ResponsiveContainer, type PieSectorDataItem } from "recharts";
import { cn } from "@/lib/utils";

interface BoardSlice {
  name: string;
  key: string;
  count: number;
  color: string;
}

interface BoardDistributionProps {
  data: BoardSlice[];
}

// Custom active shape — expands the hovered segment outward
function ActiveShape(props: PieSectorDataItem) {
  const {
    cx = 0,
    cy = 0,
    innerRadius = 0,
    outerRadius = 0,
    startAngle = 0,
    endAngle = 0,
    fill = "#ccc",
    percent = 0,
  } = props;

  // Calculate label position
  const RADIAN = Math.PI / 180;
  const midAngle = (startAngle + endAngle) / 2;
  const expandedOuter = (outerRadius as number) + 6;
  const radius = (innerRadius as number) + (expandedOuter - (innerRadius as number)) * 0.5;
  const x = (cx as number) + radius * Math.cos(-midAngle * RADIAN);
  const y = (cy as number) + radius * Math.sin(-midAngle * RADIAN);

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={(innerRadius as number) - 2}
        outerRadius={expandedOuter}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="none"
        style={{ filter: "brightness(1.15)", transition: "all 0.2s ease" }}
      />
      {(percent as number) >= 0.05 && (
        <text
          x={x}
          y={y}
          fill="#ffffff"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fontFamily="var(--font-geist-mono)"
          fontWeight="bold"
          style={{ pointerEvents: "none" }}
        >
          {`${((percent as number) * 100).toFixed(0)}%`}
        </text>
      )}
    </g>
  );
}

function PercentLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
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
      style={{ pointerEvents: "none" }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function BoardDistribution({ data }: BoardDistributionProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onPieEnter = useCallback((_data: PieSectorDataItem, index: number) => {
    setActiveIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

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
  const activeItem = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div className="bg-card rounded-xl p-6">
      <h3 className="text-base font-bold font-mono uppercase tracking-wider mb-2">
        Board Distribution
      </h3>

      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart style={{ outline: "none" }}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="count"
              nameKey="name"
              stroke="none"
              label={<PercentLabel />}
              labelLine={false}
              activeShape={ActiveShape}
              inactiveShape={{ opacity: 0.35 }}
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="none"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — shows hovered item or total */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            {activeItem ? (
              <>
                <p className="text-2xl font-bold font-mono tabular-nums leading-none">
                  {activeItem.count}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1 uppercase tracking-wider max-w-[80px] truncate">
                  {activeItem.name}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground/60">
                  {((activeItem.count / total) * 100).toFixed(0)}%
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold font-mono tabular-nums leading-none">
                  {total}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground mt-1 uppercase tracking-wider">
                  Total
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Legend — synced with chart hover */}
      <div className="mt-3 space-y-1">
        {data.map((board, index) => (
          <div
            key={board.key}
            className={cn(
              "flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-200",
              activeIndex === index
                ? "bg-muted/30"
                : activeIndex !== null
                  ? "opacity-40"
                  : "hover:bg-muted/20",
            )}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 transition-transform duration-200"
                style={{
                  backgroundColor: board.color,
                  transform: activeIndex === index ? "scale(1.4)" : "scale(1)",
                }}
              />
              <span className="text-xs font-mono text-foreground truncate max-w-[120px]">
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
