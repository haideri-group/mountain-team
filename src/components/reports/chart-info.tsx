"use client";

/**
 * Thin wrapper preserving the existing <ChartInfo chartId="…" /> API used
 * across /reports. All dialog/guide logic now lives in shared primitives
 * so /releases and future surfaces can reuse them.
 */
import { InfoButton } from "@/components/shared/info-modal";
import type { GuideKey } from "@/lib/chart-guides";

export type ChartId = GuideKey;

export function ChartInfo({ chartId }: { chartId: ChartId }) {
  return <InfoButton guideKey={chartId} />;
}
