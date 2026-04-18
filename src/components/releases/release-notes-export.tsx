"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Copy, Download, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoButton } from "@/components/shared/info-modal";

type Variant = "internal" | "customer";

interface NotesResponse {
  name: string;
  projectKey: string;
  issueCount: number;
  internal: string;
  customer: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function download(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReleaseNotesExport({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<NotesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("internal");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/releases/${releaseId}/notes`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load notes (${res.status})`);
        return (await res.json()) as NotesResponse;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      });
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  const body = data ? data[variant] : "";

  const onCopy = useCallback(async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some browsers block clipboard without user gesture → ignore silently
    }
  }, [body]);

  const onDownload = useCallback(() => {
    if (!data) return;
    const slug = slugify(data.name);
    download(`${slug}-${variant}.md`, body);
  }, [data, variant, body]);

  return (
    <div className="bg-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
          <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground/70">
            Release notes
          </h3>
          <InfoButton guideKey="releaseNotes" />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0 rounded-full bg-muted/30 p-0.5">
            {(["internal", "customer"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider transition-all",
                  variant === v
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "internal" ? "Dev" : "Customer"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onCopy}
            disabled={!body}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-40"
            aria-label="Copy notes to clipboard"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>

          <button
            type="button"
            onClick={onDownload}
            disabled={!body}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-40"
            aria-label="Download notes as .md"
          >
            <Download className="h-3 w-3" />
            .md
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !data ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Generating…
        </div>
      ) : (
        <pre className="text-xs font-mono bg-muted/10 rounded-lg p-4 max-h-[340px] overflow-y-auto overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {body}
        </pre>
      )}
    </div>
  );
}
