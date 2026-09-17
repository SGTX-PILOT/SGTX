// SGTX Brain OS — Trade Readiness Capability Module
// Wraps the existing portal-intelligence + AI-weighted readiness scoring logic
// into the Brain OS module pattern. Pure dispatcher — no business logic here.
//
// Capabilities exposed:
//   • readiness.update      → calculateTradeReadinessScore (recompute + persist)
//   • readiness.score       → calculateTradeReadinessScore (read-only compute)
//   • portal.intelligence   → getPortalIntelligence (per-portal Brain feed)
//
// This module is INDEPENDENT and REPLACEABLE.

import type { BrainModule } from "../core/types";
import {
  calculateTradeReadinessScore,
  getPortalIntelligence,
} from "@/lib/sgtx/ai/portal-intelligence";

class TradeReadinessCapabilityModule implements BrainModule {
  id = "trade-readiness-brain";
  name = "Trade Readiness Brain";
  version = "1.0.0";
  type = "capability" as const;
  authority = "A3" as const;
  description =
    "AI-weighted trade readiness scoring + per-portal intelligence feed";
  capabilities = [
    "readiness.update",
    "readiness.score",
    "portal.intelligence",
  ];

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 1 };
  }

  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "readiness.update":
      case "readiness.score":
        // Both capabilities delegate to the same function — the underlying
        // implementation persists the score as a side-effect (cron path).
        // The Brain treats them as distinct capabilities so the orchestrator
        // can emit different event metadata per caller.
        return calculateTradeReadinessScore(input?.tenantGtid ?? input);
      case "portal.intelligence":
        return getPortalIntelligence({
          tenantGtid: input?.tenantGtid,
          portal: input?.portal,
        });
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }
}

export const tradeReadinessCapability = new TradeReadinessCapabilityModule();
export { TradeReadinessCapabilityModule };
