import "server-only";
import type { CronicleResult } from "./types";

/**
 * Low-level Cronicle HTTP wrapper.
 *
 * - `CRONICLE_API_KEY` stays server-side only (`import "server-only"`).
 * - Every call is bounded by a 10s `AbortSignal.timeout` — a hung Cronicle
 *   must not cascade into a slow page render.
 * - Errors are swallowed and surfaced as `{ ok: false, error }` — the `/logs`
 *   page renders fully using `sync_logs` alone when Cronicle is unreachable.
 *
 * Returns `{ ok: false, error: "cronicle_not_configured" }` if env is missing,
 * so callers can distinguish "admin hasn't set this up" from "transient failure".
 */

const TIMEOUT_MS = 10_000;

function getBaseUrl(): string | null {
  const raw = process.env.CRONICLE_BASE_URL || "";
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function getApiKey(): string | null {
  const k = process.env.CRONICLE_API_KEY || "";
  return k || null;
}

export function isCronicleConfigured(): boolean {
  return !!getBaseUrl() && !!getApiKey();
}

export async function cronicleGet<T>(
  path: string,
  params?: Record<string, string>,
): Promise<CronicleResult<T>> {
  const base = getBaseUrl();
  const apiKey = getApiKey();
  if (!base || !apiKey) {
    return { ok: false, error: "cronicle_not_configured" };
  }

  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const url = `${base}${path.startsWith("/") ? path : "/" + path}${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `cronicle_http_${res.status}`,
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const msg = err instanceof Error ? err.message : String(err);
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, error: "cronicle_timeout" };
    }
    return { ok: false, error: `cronicle_fetch_failed:${msg.slice(0, 100)}` };
  }
}
