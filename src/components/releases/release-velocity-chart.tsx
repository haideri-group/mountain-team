"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import { InfoButton } from "@/components/shared/info-modal";
import { CHART_COLORS } from "@/lib/chart-colors";

interface WeekPoint {
  week: string; // "2026-W16"
  count: number;
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
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold" style={{ color: CHART_COLORS.brand }}>
          Released:
        </span>{" "}
        {payload[0]?.value}
      </p>
    </div>
  );
}

/** Strip "2026-" prefix → "W16" for denser axis labels. */
function shortWeek(key: string): string {
  const idx = key.indexOf("-W");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

export function ReleaseVelocityChart({ data }: { data: WeekPoint[] }) {
  const shaped = data.map((d) => ({ label: shortWeek(d.week), Released: d.count }));
  const empty = shaped.every((d) => d.Released === 0);

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold font-mono uppercase tracking-wider">Release velocity</h3>
          <InfoButton guideKey="releaseVelocity" />
        </div>
        <span className="text-xs font-mono text-muted-foreground">releases / week (last 12w)</span>
      </div>

      {empty ? (
        <div className="h-[240px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No releases shipped in this window.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={shaped} barCategoryGap="28%">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--muted)"
              strokeOpacity={0.3}
              vertical={false}
            />
            <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              content={(props) => <CustomTooltip {...props} />}
              cursor={{ fill: "var(--muted)", fillOpacity: 0.2 }}
            />
            <Bar dataKey="Released" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
