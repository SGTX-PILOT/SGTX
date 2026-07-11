// SGTX Brain OS — Provider Router
// =============================================================================
// Routes inference requests through the adapter fallback chain:
//
//     ZAI (primary) → Local (Ollama) → Static (rule-based)
//
// Behaviour:
//   * `route()` walks the chain in order, skipping adapters whose `available`
//     flag is false or whose `healthCheck()` fails (short-circuited).
//   * On the first adapter that returns a result, the response is tagged with
//     `fallbackUsed` = true if any earlier adapter was attempted but failed.
//   * If every adapter fails (including the static one, which should be
//     impossible), `route()` throws an AggregateError.
//   * A per-adapter cooldown (60s) prevents thrashing after a hard failure.
//
// The router is intentionally side-effect free on import: adapter
// initialisation happens lazily on the first `route()` call.
// =============================================================================

import type { InferenceRequest, InferenceResult } from "../core/types";
import {
  zaiAdapter,
  localAdapter,
  staticFallbackAdapter,
  type ModelAdapter,
} from "./model-adapters";

export interface RouteDecision {
  adapterId: string;
  provider: string;
  model: string;
  attempts: { adapterId: string; ok: boolean; error?: string; latencyMs: number }[];
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
    this.adapters = adapters ?? [zaiAdapter, localAdapter, staticFallbackAdapter];
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
        return {
          ...result,
          fallbackUsed: result.fallbackUsed || fallbackUsed,
          decision: {
            adapterId: adapter.id,
            provider: adapter.provider,
            model: adapter.model,
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

    // Should be unreachable because StaticFallbackAdapter never fails.
    throw new Error(
      `ProviderRouter: all ${this.adapters.length} adapters failed: ` +
        attempts.map((a) => `${a.adapterId}=${a.error ?? "ok"}`).join(", "),
    );
  }

  /** Return a snapshot of every adapter's current availability. */
  async health(): Promise<{ id: string; available: boolean; provider: string; model: string }[]> {
    if (!this.initialized) await this.initialize();
    const out: { id: string; available: boolean; provider: string; model: string }[] = [];
    for (const a of this.adapters) {
      out.push({ id: a.id, available: a.available && !this.inCooldown(a.id), provider: a.provider, model: a.model });
    }
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
