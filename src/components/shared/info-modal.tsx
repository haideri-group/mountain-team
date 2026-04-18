"use client";

/**
 * Shared info dialog. Pass in a `guideKey` (looked up from `src/lib/chart-guides.ts`)
 * or a custom `guide` object with { title, description, bullets, tip? }.
 *
 * `<InfoButton>` renders a small ⓘ affordance; clicking it opens the modal.
 * `<InfoModal>` is exposed for cases where the open state lives elsewhere.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Info, X, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUIDES, type Guide, type GuideKey } from "@/lib/chart-guides";

export function InfoModal({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={guide.title}
        className={cn(
          "relative z-10 w-[90vw] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain",
          "bg-popover/95 backdrop-blur-xl rounded-xl",
          "ring-1 ring-foreground/10 shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
          "p-5 space-y-4",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
              {guide.title}
            </h3>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{guide.description}</p>

        <div className="space-y-2.5">
          <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground">
            How to read this
          </p>
          <ul className="space-y-2">
            {guide.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-foreground/80 leading-relaxed">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        {guide.tip && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/8">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{guide.tip}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function InfoButton({ guideKey, label }: { guideKey: GuideKey; label?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const guide = GUIDES[guideKey];

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        className="p-0.5 rounded-md hover:bg-muted/30 transition-colors text-muted-foreground/40 hover:text-muted-foreground"
        aria-label={label ?? `Info about ${guide.title}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {isOpen && (
        <InfoModal
          guide={guide}
          onClose={() => {
            setIsOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
