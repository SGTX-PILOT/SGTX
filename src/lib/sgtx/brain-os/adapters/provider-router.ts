// SGTX Brain OS — Provider Router
// =============================================================================
// Routes inference requests through the adapter fallback chain:
//
//     Gemini (primary) → OpenAI (secondary) → Groq (fast) → Static (rule-based)
//                         ↓ (all fail)
//                   Web Search + Read fallback (z-ai-web-dev-sdk)
//                         ↓ (web also fails)
//                   AggregateError
//
// Behaviour:
//   * `route()` walks the chain in order, skipping adapters whose `available`
//     flag is false or whose `healthCheck()` fails (short-circuited).
//   * On the first adapter that returns a result, the response is tagged with
//     `fallbackUsed` = true if any earlier adapter was attempted but failed.
//     `source` is "model" for cloud adapters, "static_fallback" for the
//     rule-based adapter, and "web_search" when the web fallback layer
//     produced the response.
//   * If every model adapter fails AND `input.fallbackToWeb !== false`, the
//     router tries the web fallback: a single `webSearchAndRead(input.userPrompt)`
//     call. If it returns a non-empty synthesised context, that becomes the
//     inference result with `provider="web-fallback"`, `model="web-search"`,
//     `source="web_search"`.
//   * If web fallback also fails (or is disabled), `route()` throws an
//     AggregateError with `source="failed"` attached.
//   * A per-adapter cooldown (60s) prevents thrashing after a hard failure.
//
// The router is intentionally side-effect free on import: adapter
// initialisation happens lazily on the first `route()` call.
//
// CRITICAL: The model-adapter chain MUST NEVER include a ZAI / z-ai-web-dev-sdk
// adapter. The SDK is used ONLY by the web fallback step (lazy import inside
// web-fallback-adapter.ts).
// =============================================================================

import type { InferenceRequest, InferenceResult } from "../core/types";
import {
  geminiAdapter,
  openaiAdapter,
  groqAdapter,
  staticFallbackAdapter,
  type ModelAdapter,
} from "./model-adapters";
import { webSearchAndRead, isWebFallbackAvailable } from "./web-fallback-adapter";

/** Where the returned `RouteResult` came from. */
export type RouteSource = "model" | "web_search" | "web_read" | "static_fallback" | "failed";

export interface RouteDecision {
  adapterId: string;
  provider: string;
  model: string;
  source: RouteSource;
  attempts: { adapterId: string; ok: boolean; error?: string; latencyMs: number }[];
  /** Present only when the web fallback was attempted. */
  webFallbackAttempted?: boolean;
  webFallbackSuccess?: boolean;
  webFallbackError?: string;
}

export interface RouteResult extends InferenceResult {
  decision: RouteDecision;
}

const COOLDOWN_MS = 60_000;

class ProviderRouterImpl {
  private readonly adapters: ModelAdapter[];
  private readonly cooldowns = new Map<string, number>(); // adapterId → unix-ms until eligible
  private initialized = false;

  constructor(adapters?: ModelAdapter[]) {
    // Default chain: Gemini → OpenAI → Groq → Static.
    this.adapters = adapters ?? [geminiAdapter, openaiAdapter, groqAdapter, staticFallbackAdapter];
  }

  /** Initialise all adapters in parallel (best-effort). */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await Promise.allSettled(this.adapters.map((a) => a.initialize()));
  }

  /**
   * Route an inference request through the fallback chain.
   *
   * Returns the first successful InferenceResult. If a fallback was used,
   * `fallbackUsed` is set to true on the returned result and the decision
   * object records every adapter that was attempted.
   *
   * Web fallback step: if every model adapter fails AND
   * `input.fallbackToWeb !== false`, the router attempts a single
   * `webSearchAndRead(input.userPrompt)` call. If it returns a non-empty
   * synthesised context, that becomes the inference result.
   *
   * @throws Error with `source="failed"` if every layer (including web) fails.
   */
  async route(input: InferenceRequest): Promise<RouteResult> {
    if (!this.initialized) await this.initialize();

    const attempts: RouteDecision["attempts"] = [];
    let fallbackUsed = false;

    for (const adapter of this.adapters) {
      if (this.inCooldown(adapter.id)) {
        attempts.push({ adapterId: adapter.id, ok: false, error: "cooldown", latencyMs: 0 });
        fallbackUsed = true;
        continue;
      }

      // Refresh availability cheaply: skip adapters that already report false.
      if (!adapter.available) {
        try {
          const probe = await adapter.healthCheck();
          if (!probe.healthy) {
            attempts.push({ adapterId: adapter.id, ok: false, error: "unavailable", latencyMs: probe.latencyMs });
            fallbackUsed = true;
            continue;
          }
        } catch (err) {
          attempts.push({ adapterId: adapter.id, ok: false, error: (err as Error).message, latencyMs: 0 });
          fallbackUsed = true;
          continue;
        }
      }

      const start = Date.now();
      try {
        const result = await adapter.infer(input);
        attempts.push({ adapterId: adapter.id, ok: true, latencyMs: result.latencyMs });
        const source: RouteSource = adapter.id === "static" ? "static_fallback" : "model";
        return {
          ...result,
          fallbackUsed: result.fallbackUsed || fallbackUsed,
          decision: {
            adapterId: adapter.id,
            provider: adapter.provider,
            model: adapter.model,
            source,
            attempts,
          },
        };
      } catch (err) {
        const msg = (err as Error).message;
        attempts.push({ adapterId: adapter.id, ok: false, error: msg, latencyMs: Date.now() - start });
        this.enterCooldown(adapter.id);
        fallbackUsed = true;
      }
    }

    // All model adapters (including Static) failed — fall through to web.
    const webEnabled = input.fallbackToWeb !== false;
    if (webEnabled) {
      const webResult = await this.tryWebFallback(input);
      if (webResult) return webResult;

      // Web fallback was attempted but returned nothing usable.
      const err = new Error(
        `ProviderRouter: all ${this.adapters.length} adapters failed and web fallback returned no results: ` +
          attempts.map((a) => `${a.adapterId}=${a.error ?? "ok"}`).join(", "),
      );
      (err as Error & { source?: RouteSource }).source = "failed";
      throw err;
    }

    // Web fallback disabled — surface the aggregate failure directly.
    // Should be unreachable in practice because StaticFallbackAdapter never fails.
    const err = new Error(
      `ProviderRouter: all ${this.adapters.length} adapters failed (web fallback disabled): ` +
        attempts.map((a) => `${a.adapterId}=${a.error ?? "ok"}`).join(", "),
    );
    (err as Error & { source?: RouteSource }).source = "failed";
    throw err;
  }

  /**
   * Attempt the web fallback step. Returns a fully-formed `RouteResult` if
   * the web search + read produced a non-empty synthesised context, or
   * `null` if the web fallback was unavailable / returned nothing.
   */
  private async tryWebFallback(input: InferenceRequest): Promise<RouteResult | null> {
    // Cheap short-circuit: if the SDK has already failed to initialise on a
    // prior call, don't pay the import cost again.
    if (!isWebFallbackAvailable()) {
      return null;
    }

    const query = input.userPrompt || input.systemPrompt;
    if (!query || !query.trim()) return null;

    const start = Date.now();
    let webFallbackSuccess = false;
    let webFallbackError: string | undefined;
    let synthesisedContext = "";

    try {
      const result = await webSearchAndRead(query, { numResults: 5, maxPagesToRead: 3 });
      webFallbackSuccess = result.success;
      if (!result.success) {
        webFallbackError = result.error;
      }
      synthesisedContext = result.synthesizedContext;
    } catch (err) {
      webFallbackError = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = Date.now() - start;

    if (!webFallbackSuccess || !synthesisedContext.trim()) {
      // Attach the web attempt details to the decision on the throw path via
      // a side-channel — but since `route()` constructs the final error, we
      // stash on the router instance for the next throw to read.
      this.lastWebFallbackAttempt = {
        attempted: true,
        success: false,
        error: webFallbackError,
        latencyMs,
      };
      return null;
    }

    this.lastWebFallbackAttempt = undefined;

    return {
      content: synthesisedContext,
      provider: "web-fallback",
      model: "web-search",
      latencyMs,
      costUsd: 0,
      fallbackUsed: true,
      correlationId: input.correlationId,
      decision: {
        adapterId: "web-fallback",
        provider: "web-fallback",
        model: "web-search",
        source: "web_search",
        attempts: [],
        webFallbackAttempted: true,
        webFallbackSuccess: true,
      },
    };
  }

  private lastWebFallbackAttempt?: {
    attempted: boolean;
    success: boolean;
    error?: string;
    latencyMs: number;
  };

  /** Return a snapshot of every adapter's current availability. */
  async health(): Promise<{ id: string; available: boolean; provider: string; model: string }[]> {
    if (!this.initialized) await this.initialize();
    const out: { id: string; available: boolean; provider: string; model: string }[] = [];
    for (const a of this.adapters) {
      out.push({ id: a.id, available: a.available && !this.inCooldown(a.id), provider: a.provider, model: a.model });
    }
    // Also surface the web fallback availability (advisory — not an adapter).
    out.push({ id: "web-fallback", available: isWebFallbackAvailable(), provider: "web-fallback", model: "web-search" });
    return out;
  }

  /** Force a fresh health probe on every adapter in parallel. */
  async probeAll(): Promise<{ id: string; healthy: boolean; latencyMs: number }[]> {
    if (!this.initialized) await this.initialize();
    const results = await Promise.allSettled(
      this.adapters.map(async (a) => {
        const r = await a.healthCheck();
        return { id: a.id, healthy: r.healthy, latencyMs: r.latencyMs };
      }),
    );
    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { id: this.adapters[i]!.id, healthy: false, latencyMs: 0 },
    );
  }

  private inCooldown(id: string): boolean {
    const until = this.cooldowns.get(id);
    return Boolean(until) && Date.now() < until!;
  }

  private enterCooldown(id: string): void {
    this.cooldowns.set(id, Date.now() + COOLDOWN_MS);
  }
}

export const providerRouter = new ProviderRouterImpl();
export { ProviderRouterImpl as ProviderRouter };
