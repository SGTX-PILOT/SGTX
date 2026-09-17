// SGTX Brain OS — Dynamic Pricing Capability Module
// Wraps the existing dynamic-fee logic (`@/lib/sgtx/ai/dynamic-fee`) into the
// Brain OS module pattern. Pure dispatcher — no business logic here.
//
// Capabilities exposed:
//   • pricing.dynamic-fee   → calculateDynamicFee (constitutional fee in [0.1%, 2.5%])
//   • pricing.optimize      → calculateDynamicFee (alias — semantic entry-point
//                              for the optimizer UI; same compute path)
//
// This module is INDEPENDENT and REPLACEABLE.

import type { BrainModule } from "../core/types";
import { calculateDynamicFee } from "@/lib/sgtx/ai/dynamic-fee";

class DynamicPricingCapabilityModule implements BrainModule {
  id = "dynamic-pricing-brain";
  name = "Dynamic Pricing Brain";
  version = "1.0.0";
  type = "capability" as const;
  authority = "A3" as const;
  description =
    "Constitutional dynamic fee valuation (0.1%–2.5% per side) via commodity volatility, route risk, liquidity, perishable urgency";
  capabilities = ["pricing.dynamic-fee", "pricing.optimize"];

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 1 };
  }

  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "pricing.dynamic-fee":
      case "pricing.optimize":
        // Both capabilities delegate to the same compute path. The
        // underlying calculateDynamicFee clamps the multiplier to [0.5, 2.0]
        // and the final rate to [0.001, 0.025] per the constitutional
        // fee_gate. `pricing.optimize` exists as a distinct capability so the
        // Brain's billing dashboard can route "optimise" requests without
        // coupling to the implementation name.
        return calculateDynamicFee(input);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }
}

export const dynamicPricingCapability = new DynamicPricingCapabilityModule();
export { DynamicPricingCapabilityModule };
