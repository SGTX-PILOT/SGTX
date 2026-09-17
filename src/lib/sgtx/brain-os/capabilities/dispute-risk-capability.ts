// SGTX Brain OS — Dispute Risk Capability Module
// Wraps the existing dispute-risk prediction + root-cause analysis logic into
// the Brain OS module pattern. Pure dispatcher — no business logic here.
//
// Capabilities exposed:
//   • dispute.predict     → predictDisputeRisk (milestone-time risk assessment)
//   • dispute.root-cause  → disputeRootCause (A3 causal inference)
//
// This module is INDEPENDENT and REPLACEABLE.

import type { BrainModule } from "../core/types";
import { predictDisputeRisk } from "@/lib/sgtx/ai/dispute-risk";
import { disputeRootCause } from "@/lib/sgtx/ai/orchestrator";

class DisputeRiskCapabilityModule implements BrainModule {
  id = "dispute-risk-brain";
  name = "Dispute Risk Brain";
  version = "1.0.0";
  type = "capability" as const;
  authority = "A3" as const;
  description =
    "Pre-emptive dispute risk prediction + causal root-cause analysis";
  capabilities = ["dispute.predict", "dispute.root-cause"];

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 1 };
  }

  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "dispute.predict":
        return predictDisputeRisk(input);
      case "dispute.root-cause":
        // disputeRootCause expects { type, description, trade }
        return disputeRootCause(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }
}

export const disputeRiskCapability = new DisputeRiskCapabilityModule();
export { DisputeRiskCapabilityModule };
