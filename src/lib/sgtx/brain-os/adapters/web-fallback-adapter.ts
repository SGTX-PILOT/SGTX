// SGTX Brain OS — Web Fallback Adapter
// =============================================================================
// When every AI model provider in the chain (Gemini → OpenAI → Groq → Static)
// is exhausted or unavailable, the Brain falls back to the open web: it
// searches for the query and reads the top results, synthesising a context
// string that downstream consumers can treat as a best-effort answer.
//
// This adapter wraps the `z-ai-web-dev-sdk` backend SDK. The SDK is imported
// lazily (dynamic `import()`) on the first call so that:
//   * The Brain module graph stays side-effect free on import.
//   * Environments without the SDK installed (or the API key configured) do not
//     crash — `isAvailable()` simply returns `false` and callers can fall back
//     to the static rule engine.
//
// SDK shape (verified against skills/web-search + skills/web-reader):
//   * `zai.functions.invoke("web_search", { query, num })`
//       → Array<{ url, name, snippet, host_name, rank, date, favicon }>
//   * `zai.functions.invoke("page_reader", { url })`
//       → { code, status, data: { html, title, url, publishedTime?, usage } }
//
// Caching: web search results are cached for 5 minutes per query+numResults
// tuple (same TTL pattern as `src/lib/sgtx/ai/multi-provider.ts`). Web reads
// are not cached (page contents can change and we only read on demand).
// =============================================================================

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single web search hit, normalised from the raw SDK shape. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

/** Normalised page contents returned by webRead(). */
export interface WebReadResult {
  title: string;
  content: string;
  url: string;
  publishedTime?: string;
}

/** Combined search + read outcome returned by webSearchAndRead(). */
export interface WebFallbackResult {
  query: string;
  searchResults: WebSearchResult[];
  readContents: WebReadResult[];
  /** Concatenated snippets + page contents, truncated to ~4000 chars. */
  synthesizedContext: string;
  totalLatencyMs: number;
  success: boolean;
  error?: string;
}

/** Options accepted by webSearch() and webSearchAndRead(). */
export interface WebSearchOptions {
  /** Number of search results to request (default 5, max 20). */
  numResults?: number;
}

/** Options accepted by webSearchAndRead(). */
export interface WebSearchAndReadOptions extends WebSearchOptions {
  /** How many of the top search hits to read in full (default 3, max 5). */
  maxPagesToRead?: number;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const SEARCH_TIMEOUT_MS = 15_000;
const READ_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches multi-provider.ts
const CACHE_MAX_ENTRIES = 200;
const SYNTHESIZED_MAX_CHARS = 4_000;
const READ_CONTENT_MAX_CHARS = 2_500;

interface CacheEntry {
  results: WebSearchResult[];
  expiresAt: number;
}

const searchCache = new Map<string, CacheEntry>();

/** Lazily-loaded ZAI SDK singleton (typed loosely — SDK has no published types here). */
type ZaiClient = {
  functions: {
    invoke(name: string, args: Record<string, unknown>): Promise<unknown>;
  };
};

let zaiClientPromise: Promise<ZaiClient> | null = null;
let zaiInitError: string | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lazily import + initialise the z-ai-web-dev-sdk client. Cached so subsequent
 * calls reuse the same promise. If the SDK is missing or the API key is not
 * configured, the promise rejects with a descriptive error and `zaiInitError`
 * is recorded so `isAvailable()` can short-circuit cheaply.
 */
async function getZaiClient(): Promise<ZaiClient> {
  if (zaiClientPromise) return zaiClientPromise;
  zaiClientPromise = (async () => {
    try {
      const mod = (await import("z-ai-web-dev-sdk")) as unknown as {
        default?: { create: () => Promise<ZaiClient> };
        create?: () => Promise<ZaiClient>;
      };
      const ZAI = mod.default ?? (mod as unknown as { create: () => Promise<ZaiClient> });
      if (!ZAI || typeof ZAI.create !== "function") {
        throw new Error("z-ai-web-dev-sdk is installed but has no `create()` export");
      }
      const client = await ZAI.create();
      zaiInitError = null;
      return client;
    } catch (err) {
      zaiInitError = err instanceof Error ? err.message : String(err);
      // Allow a future retry: clear the cached promise so the next call re-attempts.
      zaiClientPromise = null;
      throw new Error(`ZAI SDK unavailable: ${zaiInitError}`);
    }
  })();
  return zaiClientPromise;
}

/**
 * Cheap, synchronous availability probe. Returns true if the SDK loaded
 * successfully on a previous call (or no attempt has been made yet — the
 * first call will attempt to load). Returns false only after a recorded
 * hard failure (e.g. missing API key).
 */
export function isWebFallbackAvailable(): boolean {
  // If we've never tried, assume maybe-available (the next call will probe).
  // If the last init attempt failed, report false.
  return zaiInitError === null;
}

/** SHA-256 cache key derived from query + numResults. */
function searchCacheKey(query: string, numResults: number): string {
  return createHash("sha256").update(`${numResults}|${query.trim().toLowerCase()}`).digest("hex");
}

function getCachedSearch(key: string): WebSearchResult[] | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCachedSearch(key: string, results: WebSearchResult[]): void {
  searchCache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  if (searchCache.size > CACHE_MAX_ENTRIES) {
    // Prune oldest expired entries (best-effort).
    const now = Date.now();
    for (const [k, v] of searchCache) {
      if (now > v.expiresAt) searchCache.delete(k);
    }
  }
}

/** Promise wrapper with an AbortController-style timeout. Rejects on timeout. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Crude HTML → text stripper (no deps). Collapses whitespace + decodes common entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise the raw `web_search` SDK response into `WebSearchResult[]`.
 * The SDK returns an array of `{ url, name, snippet, host_name, rank, date, favicon }`.
 * Unknown shapes are tolerated and skipped.
 */
function normaliseSearchResults(raw: unknown): WebSearchResult[] {
  if (!Array.isArray(raw)) return [];
  const out: WebSearchResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const url = typeof r.url === "string" ? r.url : "";
    const title = typeof r.name === "string" ? r.name : (typeof r.title === "string" ? r.title : "");
    if (!url) continue;
    out.push({
      title: title || "(untitled)",
      url,
      snippet: typeof r.snippet === "string" ? r.snippet : "",
      source: typeof r.host_name === "string" ? r.host_name : new URL(url).hostname,
    });
  }
  return out;
}

/**
 * Normalise the raw `page_reader` SDK response into `WebReadResult`.
 * The SDK returns `{ code, status, data: { html, title, url, publishedTime?, usage } }`.
 */
function normaliseReadResult(raw: unknown, requestedUrl: string): WebReadResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const data = (obj.data ?? obj) as Record<string, unknown>;
  const html = typeof data.html === "string" ? data.html : "";
  const title =
    typeof data.title === "string" ? data.title :
    typeof obj.title === "string" ? (obj.title as string) : "";
  const url = typeof data.url === "string" ? data.url : requestedUrl;
  const publishedTime =
    typeof data.publishedTime === "string" ? data.publishedTime :
    typeof data.published_time === "string" ? (data.published_time as string) : undefined;
  const content = stripHtml(html).slice(0, READ_CONTENT_MAX_CHARS);
  if (!content && !title) return null;
  return { title: title || "(untitled)", content, url, publishedTime };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search the web for `query` using the z-ai-web-dev-sdk `web_search` function.
 *
 * Results are cached for 5 minutes per (query, numResults) tuple. A 15s
 * timeout is enforced per call. If the SDK is unavailable (missing dependency
 * or API key), an empty result with `success=false` is returned — callers
 * should treat this as a soft failure and fall through to the next layer
 * (e.g. static rules).
 *
 * @param query     Natural-language search query.
 * @param opts      Optional `{ numResults }` (default 5, clamped to [1, 20]).
 * @returns         Array of normalised search results.
 */
export async function webSearch(
  query: string,
  opts: WebSearchOptions = {},
): Promise<WebSearchResult[]> {
  const numResults = Math.min(20, Math.max(1, opts.numResults ?? 5));
  if (!query || !query.trim()) return [];

  const key = searchCacheKey(query, numResults);
  const cached = getCachedSearch(key);
  if (cached) return cached;

  let zai: ZaiClient;
  try {
    zai = await getZaiClient();
  } catch {
    return [];
  }

  let raw: unknown;
  try {
    raw = await withTimeout(
      zai.functions.invoke("web_search", { query, num: numResults }),
      SEARCH_TIMEOUT_MS,
      "web_search",
    );
  } catch {
    return [];
  }

  const results = normaliseSearchResults(raw);
  if (results.length > 0) setCachedSearch(key, results);
  return results;
}

/**
 * Read a single web page via the z-ai-web-dev-sdk `page_reader` function.
 *
 * The returned `content` is HTML-stripped and truncated to ~2500 chars. A 10s
 * timeout is enforced per call. Failures (timeout, parse error, network) are
 * swallowed and `null` is returned so that `webSearchAndRead()` can skip the
 * URL and continue with the next one.
 *
 * @param url   Absolute URL to read.
 * @returns     Normalised page contents, or `null` if the read failed.
 */
export async function webRead(url: string): Promise<WebReadResult | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  let zai: ZaiClient;
  try {
    zai = await getZaiClient();
  } catch {
    return null;
  }

  let raw: unknown;
  try {
    raw = await withTimeout(
      zai.functions.invoke("page_reader", { url }),
      READ_TIMEOUT_MS,
      "page_reader",
    );
  } catch {
    return null;
  }

  return normaliseReadResult(raw, url);
}

/**
 * Combined search + read: searches the web for `query`, then reads the top N
 * result pages, and returns a synthesised context string suitable for feeding
 * back to an AI retry or surfacing directly to the caller as a web fallback.
 *
 * Behaviour:
 *   * If the SDK is unavailable, returns `{ success: false, error }` with
 *     empty arrays and a zero-length synthesised context.
 *   * If the search returns no results, returns `{ success: true }` with
 *     empty arrays.
 *   * Each page read failure is skipped — we do not abort the whole call.
 *   * The synthesised context is built as:
 *       "[Search results]\n1. <title> — <snippet>\n...\n\n[Page contents]\n<url>\n<title>\n<content>\n..."
 *     truncated to ~4000 chars.
 *
 * @param query     Natural-language search query.
 * @param opts      Optional `{ numResults, maxPagesToRead }`.
 * @returns         A `WebFallbackResult` — always resolves, never throws.
 */
export async function webSearchAndRead(
  query: string,
  opts: WebSearchAndReadOptions = {},
): Promise<WebFallbackResult> {
  const startedAt = Date.now();
  const numResults = Math.min(20, Math.max(1, opts.numResults ?? 5));
  const maxPagesToRead = Math.min(5, Math.max(0, opts.maxPagesToRead ?? 3));

  const base: WebFallbackResult = {
    query,
    searchResults: [],
    readContents: [],
    synthesizedContext: "",
    totalLatencyMs: 0,
    success: false,
  };

  if (!query || !query.trim()) {
    base.totalLatencyMs = Date.now() - startedAt;
    base.error = "Empty query";
    return base;
  }

  // Probe SDK availability up-front so we can return a clean error flag
  // instead of letting the first search call throw.
  let zai: ZaiClient;
  try {
    zai = await getZaiClient();
  } catch (err) {
    base.totalLatencyMs = Date.now() - startedAt;
    base.error = err instanceof Error ? err.message : String(err);
    return base;
  }

  // 1) Search
  let searchResults: WebSearchResult[] = [];
  try {
    const raw = await withTimeout(
      zai.functions.invoke("web_search", { query, num: numResults }),
      SEARCH_TIMEOUT_MS,
      "web_search",
    );
    searchResults = normaliseSearchResults(raw);
    if (searchResults.length > 0) {
      setCachedSearch(searchCacheKey(query, numResults), searchResults);
    }
  } catch (err) {
    base.totalLatencyMs = Date.now() - startedAt;
    base.error = `web_search failed: ${err instanceof Error ? err.message : String(err)}`;
    return base;
  }

  base.searchResults = searchResults;

  // 2) Read top N results in parallel (best-effort — failures are skipped).
  if (maxPagesToRead > 0 && searchResults.length > 0) {
    const targets = searchResults.slice(0, maxPagesToRead);
    const reads = await Promise.allSettled(targets.map((r) => webRead(r.url)));
    for (const r of reads) {
      if (r.status === "fulfilled" && r.value) {
        base.readContents.push(r.value);
      }
    }
  }

  // 3) Synthesise context (snippets + page contents), truncated to ~4000 chars.
  base.synthesizedContext = synthesiseContext(searchResults, base.readContents);
  base.totalLatencyMs = Date.now() - startedAt;
  base.success = searchResults.length > 0;
  return base;
}

/**
 * Build the synthesised context string from search snippets + page contents.
 * Truncates to ~4000 chars; if truncated, appends a "\n…[truncated]" marker.
 */
function synthesiseContext(
  searchResults: WebSearchResult[],
  readContents: WebReadResult[],
): string {
  const parts: string[] = [];

  if (searchResults.length > 0) {
    parts.push("[Search results]");
    searchResults.slice(0, 8).forEach((r, i) => {
      parts.push(`${i + 1}. ${r.title} — ${r.snippet}`.trim());
      parts.push(`   ${r.url}`);
    });
  }

  if (readContents.length > 0) {
    parts.push("");
    parts.push("[Page contents]");
    for (const p of readContents) {
      parts.push(`--- ${p.url} ---`);
      parts.push(p.title);
      parts.push(p.content);
      parts.push("");
    }
  }

  let out = parts.join("\n");
  if (out.length > SYNTHESIZED_MAX_CHARS) {
    out = out.slice(0, SYNTHESIZED_MAX_CHARS) + "\n…[truncated]";
  }
  return out;
}

/**
 * Clear the in-memory web search cache. Exposed for tests + admin tooling.
 */
export function clearWebFallbackCache(): void {
  searchCache.clear();
}

/**
 * Return cached entry count + size estimate. Exposed for observability.
 */
export function getWebFallbackCacheStats(): { entries: number; ttlMs: number } {
  return { entries: searchCache.size, ttlMs: CACHE_TTL_MS };
}
