/**
 * Free Integrations — Shared fetch + sync-log helpers
 * ====================================================
 *
 * Centralises the boilerplate every free-integration client uses:
 *   • `fetchWithTimeout()` — fetch with a 15s `AbortSignal.timeout` (per spec)
 *   • `logSync()` — append a `FreeIntegrationSyncLog` row (failures non-fatal)
 *   • `normalizeName()` + `levenshtein()` + `similarity()` — used by sanctions
 *     screeners to fuzzy-match against OFAC / UN / EU lists.
 *
 * All functions are pure / side-effect-free except for the network call and
 * DB log row. Every integration is wrapped in try/catch at the caller — a
 * failure in one integration never blocks another.
 *
 * TRULY FREE: no API keys, no billing, no credit card. Every endpoint
 * reachable via these helpers is a public, unauthenticated open-data source.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

/** Default 15-second timeout enforced on all free-integration fetches. */
export const FREE_FETCH_TIMEOUT_MS = 15_000;

/** User-Agent sent on every outbound request (some endpoints reject empty UA). */
export const SGTX_USER_AGENT =
  "Mozilla/5.0 (compatible; SGTX-Brain-OS/1.0; +https://sgtx.io)";

/**
 * Fetch wrapper with a hard 15s timeout via `AbortSignal.timeout`.
 * Returns the raw `Response` so the caller can choose `.text()` / `.json()`
 * / `.arrayBuffer()` and inspect the status code.
 *
 * On network error or timeout the function returns `null` (rather than
 * throwing) so callers can do `if (!res) return fallback` without try/catch.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = FREE_FETCH_TIMEOUT_MS,
): Promise<Response | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": SGTX_USER_AGENT,
      Accept: "*/*",
      ...(init.headers as Record<string, string> | undefined),
    };
    const response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      // Always disable Next.js fetch caching for live data syncs.
      cache: "no-store",
    });
    return response;
  } catch (err) {
    logger.warn("free-fetch: request failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Append a `FreeIntegrationSyncLog` row. Persistence failure is logged but
 * NOT propagated — sync results are still returned to the caller.
 */
export async function logSync(params: {
  integration: string;
  source: string;
  durationMs: number;
  recordsUpserted: number;
  status?: "SUCCESS" | "PARTIAL" | "FAILED";
  errors?: string[];
}): Promise<void> {
  try {
    await db.freeIntegrationSyncLog.create({
      data: {
        integration: params.integration,
        source: params.source,
        durationMs: params.durationMs,
        recordsUpserted: params.recordsUpserted,
        status: params.status ?? (params.errors && params.errors.length > 0 ? "PARTIAL" : "SUCCESS"),
        errors: params.errors && params.errors.length > 0 ? JSON.stringify(params.errors) : null,
      },
    });
  } catch (err) {
    logger.warn("free-fetch: logSync persistence failed", {
      integration: params.integration,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Name normalisation + Levenshtein similarity (used by sanctions screeners)
// ─────────────────────────────────────────────────────────────────────────────

/** Common legal / organisational suffixes to strip before fuzzy matching. */
const LEGAL_SUFFIXES = [
  "public joint stock company",
  "joint stock company",
  "open joint stock company",
  "limited liability company",
  "public limited company",
  "joint-stock company",
  "company limited",
  "incorporated",
  "corporation",
  "limited",
  "holdings",
  "holding",
  "group",
  "jsc",
  "pjsc",
  "ojsc",
  "llc",
  "ltd",
  "inc",
  "corp",
  "co",
  "gmbh",
  "ag",
  "sa",
  "plc",
  "oao",
  "zao",
  "pao",
  "ao",
];

export function normalizeName(name: string): string {
  let n = (name ?? "")
    .toString()
    .toLowerCase()
    .replace(/[.,;:'"!?()[\]{}]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      const re = new RegExp(`\\b${suf}\\b`, "g");
      const next = n.replace(re, " ").replace(/\s+/g, " ").trim();
      if (next !== n) {
        n = next;
        changed = true;
      }
    }
  }
  return n.trim();
}

/** Levenshtein edit distance, case-insensitive. */
export function levenshtein(a: string, b: string): number {
  const x = (a || "").toLowerCase();
  const y = (b || "").toLowerCase();
  const m = x.length;
  const n = y.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Similarity ratio in [0,1] based on Levenshtein distance. */
export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na && !nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}
