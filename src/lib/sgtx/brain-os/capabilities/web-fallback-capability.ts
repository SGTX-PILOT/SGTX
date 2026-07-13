// SGTX Brain OS — Web Fallback Capability Module
// =============================================================================
// Exposes the web fallback adapter (web search + web reader) as first-class
// Brain capabilities so any caller can invoke them through the Brain
// orchestrator's `brainOrchestrator.invoke(capability, input)` surface.
//
// Capabilities registered:
//   * `web.search`            — search the web for a query. Input: { query, numResults? }.
//   * `web.read`              — read a single URL.                Input: { url }.
//   * `web.search-and-read`   — combined search + read + synth.   Input: { query, numResults?, maxPagesToRead? }.
//
// All three delegate to `src/lib/sgtx/brain-os/adapters/web-fallback-adapter.ts`
// which lazily imports the z-ai-web-dev-sdk backend SDK. If the SDK is not
// available, the calls resolve with an empty / unsuccessful result rather
// than throwing, so callers can chain further fallbacks safely.
// =============================================================================

import type { BrainModule } from "../core/types";
import {
  webSearch,
  webRead,
  webSearchAndRead,
  isWebFallbackAvailable,
  getWebFallbackCacheStats,
  type WebSearchResult,
  type WebReadResult,
  type WebFallbackResult,
} from "../adapters/web-fallback-adapter";

/** Input shape accepted by the web.* capabilities. */
export interface WebCapabilityInput {
  query?: string;
  url?: string;
  numResults?: number;
  maxPagesToRead?: number;
}

/**
 * Brain capability module exposing web search + web reading as first-class
 * Brain capabilities. Used both:
 *   * Directly by callers that need real-time web data (e.g. market price
 *     refresh, sanctions news lookup).
 *   * Automatically by the Brain orchestrator's invoke() wrapper as a
 *     fallback when an AI / intelligence / logistics capability throws.
 */
export const webFallbackModule: BrainModule = {
  id: "web-fallback-brain",
  name: "Web Fallback Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description:
    "Web search + web reading fallback for when AI model providers fail or real-time web data is needed. Wraps the z-ai-web-dev-sdk backend SDK (lazy import).",
  capabilities: ["web.search", "web.read", "web.search-and-read"],

  /**
   * Lazy init: probe SDK availability so `isWebFallbackAvailable()` returns
   * an accurate value without waiting for the first call. Safe to skip —
   * the adapter self-initialises on first use.
   */
  async initialize(): Promise<void> {
    // No-op: the adapter lazily imports the SDK on first call. We deliberately
    // do NOT call getZaiClient() here because that would force a network
    // round-trip during Brain bootstrap.
  },

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    return { healthy: isWebFallbackAvailable(), latencyMs: Date.now() - start };
  },

  /**
   * Invoke a web.* capability. Resolves (does not throw) on soft failures
   * such as "SDK unavailable" — the returned object carries `success=false`
   * + an `error` field instead. Throws only on truly unknown capabilities.
   */
  async invoke(
    capability: string,
    input: WebCapabilityInput | undefined,
  ): Promise<WebSearchResult[] | WebReadResult | null | WebFallbackResult> {
    const inp = (input ?? {}) as WebCapabilityInput;
    switch (capability) {
      case "web.search":
        return webSearch(inp.query ?? "", { numResults: inp.numResults });
      case "web.read":
        return webRead(inp.url ?? "");
      case "web.search-and-read":
        return webSearchAndRead(inp.query ?? "", {
          numResults: inp.numResults,
          maxPagesToRead: inp.maxPagesToRead,
        });
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

/**
 * Convenience export: returns the current cache size + TTL for observability
 * dashboards. Wraps the adapter-level helper so callers don't need to import
 * from two locations.
 */
export function getWebFallbackStats(): { entries: number; ttlMs: number; available: boolean } {
  return { ...getWebFallbackCacheStats(), available: isWebFallbackAvailable() };
}
