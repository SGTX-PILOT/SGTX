// SGTX Brain OS — Bootstrap
// Registers all capability modules with the module registry and starts the
// orchestrator (which wires adapters, the event bus, the health monitor, and
// the feedback auto-collector). Idempotent — safe to call from every entry
// point (API routes, cron jobs, server actions).
//
// Usage:
//   import { bootstrapBrainOS } from "@/lib/sgtx/brain-os/bootstrap";
//   await bootstrapBrainOS();
//
// After bootstrap, capabilities are dispatched via:
//   brainOrchestrator.invokeCapability("compliance.precheck", { ... })

import { moduleRegistry } from "./core/module-registry";
import { brainOrchestrator } from "./core/orchestrator";
import { complianceCapability } from "./capabilities/compliance-capability";
import { marketIntelligenceCapability } from "./capabilities/market-intelligence-capability";
import { disputeRiskCapability } from "./capabilities/dispute-risk-capability";
import { tradeReadinessCapability } from "./capabilities/trade-readiness-capability";
import { dynamicPricingCapability } from "./capabilities/dynamic-pricing-capability";
import { distressedCargoCapability } from "./capabilities/distressed-cargo-capability";
import { workflowOrchestrationCapability } from "./capabilities/workflow-orchestration-capability";

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

/** All capability modules registered by the bootstrap (in registration order). */
export const CAPABILITY_MODULES = [
  complianceCapability,
  marketIntelligenceCapability,
  disputeRiskCapability,
  tradeReadinessCapability,
  dynamicPricingCapability,
  distressedCargoCapability,
  workflowOrchestrationCapability,
] as const;

/**
 * Bootstrap the Brain OS. Idempotent + concurrency-safe — multiple parallel
 * callers will await the same bootstrap promise.
 *
 * Steps:
 *   1. Initialize the orchestrator (registers AI adapters, starts the
 *      self-healing health monitor, starts the feedback auto-collector,
 *      subscribes to trade lifecycle events for autonomous orchestration).
 *   2. Register every capability module with the module registry (each
 *      module's `initialize()` runs, capabilities are indexed, events are
 *      published).
 */
export async function bootstrapBrainOS(): Promise<void> {
  if (bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    // 1. Orchestrator first — adapters must exist before capabilities are
    //    invoked (some capabilities may delegate to AI providers via the
    //    orchestrator's `infer` method).
    await brainOrchestrator.initialize();

    // 2. Register every capability module. Registration is sequential so the
    //    capability index is deterministic and module-init errors propagate
    //    to the caller (do not swallow — a failed bootstrap must surface).
    for (const brainModule of CAPABILITY_MODULES) {
      // Skip if already registered (e.g. hot-reload scenario). The registry
      // itself also guards against duplicates, but checking here lets the
      // bootstrap proceed without try/catch noise.
      if (moduleRegistry.getModule(brainModule.id)) continue;
      await moduleRegistry.register(brainModule);
    }

    bootstrapped = true;
  })();

  try {
    await bootstrapPromise;
  } finally {
    // Allow a retry after a failed bootstrap — but only clear if we did NOT
    // set `bootstrapped`. On success, `bootstrapped` is true and we leave the
    // promise cached so concurrent callers resolve correctly.
    if (!bootstrapped) bootstrapPromise = null;
  }
}

/** Test-only: reset the bootstrap flag (does NOT unregister modules). */
export function _resetBootstrapFlagForTests(): void {
  bootstrapped = false;
  bootstrapPromise = null;
}

/** Has bootstrap completed successfully? */
export function isBrainOSBootstrapped(): boolean {
  return bootstrapped;
}
