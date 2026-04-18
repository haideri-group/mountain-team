"use client";

import { useState, useRef } from "react";
import { Info, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoModal } from "@/components/shared/info-modal";
import { GUIDES } from "@/lib/chart-guides";
import type { ReleaseReadiness } from "./types";

/**
 * Engineer-facing tile showing the readiness score behind an ⓘ.
 * Clicking ⓘ opens the standard guide modal describing the formula.
 * The riskFactors array is rendered inside the modal for transparency.
 */
export function ReadinessBreakdown({ readiness }: { readiness: ReleaseReadiness }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const scoreTone =
    readiness.score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : readiness.score >= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const baseGuide = GUIDES.releaseReadiness;

  return (
    <>
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-[11px] font-mono text-muted-foreground">Readiness</span>
        <span className={cn("text-sm font-bold font-mono", scoreTone)}>{readiness.score}/100</span>
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setIsOpen(true)}
          className="p-0.5 rounded-md hover:bg-muted/30 transition-colors text-muted-foreground/40 hover:text-muted-foreground"
          aria-label="About the readiness score"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      {isOpen && (
        <InfoModal
          guide={{
            ...baseGuide,
            // Extend the base guide with the live risk-factor breakdown so the
            // modal is self-describing: formula + what's happening right now.
            bullets: [
              ...baseGuide.bullets,
              ...(readiness.riskFactors.length > 0
                ? [
                    "— — —",
                    "Current signals for this release:",
                    ...readiness.riskFactors.map((f) => `• ${f}`),
                  ]
                : []),
            ],
          }}
          onClose={() => {
            setIsOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
