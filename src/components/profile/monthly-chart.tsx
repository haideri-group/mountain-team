"use client";

interface MonthlyChartProps {
  data: { month: string; count: number }[];
}

export function MonthlyChart({ data }: MonthlyChartProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="bg-card rounded-xl p-6">
      <h3 className="text-base font-bold font-mono mb-5">
        Monthly Completions
      </h3>
      <div className="flex items-end gap-3 h-40">
        {data.map((d) => {
          const heightPct = (d.count / maxCount) * 100;
          return (
            <div
              key={d.month}
              className="flex-1 flex flex-col items-center gap-2"
            >
              <span className="text-xs font-bold font-mono text-muted-foreground">
                {d.count}
              </span>
              <div className="w-full relative" style={{ height: "100px" }}>
                <div
                  className="absolute bottom-0 w-full rounded-t-md bg-primary/80 transition-all"
                  style={{ height: `${Math.max(heightPct, 4)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                {d.month}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
