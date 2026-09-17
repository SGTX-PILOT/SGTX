// SGTX Brain OS — Market Intelligence Capability Module
// Wraps the existing Brain price-monitoring + quote-validation logic
// (`@/lib/sgtx/ai/brain`) into the Brain OS module pattern. Pure dispatcher —
// no business logic here.
//
// Capabilities exposed:
//   • market.validate-price   → validateQuotePrice (deviation vs market avg)
//   • market.analyze          → analyzeMarket (bullish/bearish + forecast)
//   • market.check-deviation  → searchCommodityPrices + monitorPortPrices
//
// This module is INDEPENDENT and REPLACEABLE.

import type { BrainModule } from "../core/types";
import {
  searchCommodityPrices,
  monitorPortPrices,
  validateQuotePrice,
  analyzeMarket,
} from "@/lib/sgtx/ai/brain";

class MarketIntelligenceCapabilityModule implements BrainModule {
  id = "market-intelligence-brain";
  name = "Market Intelligence Brain";
  version = "1.0.0";
  type = "capability" as const;
  authority = "A2" as const;
  description =
    "Commodity price intelligence: market analysis, quote validation, deviation monitoring";
  capabilities = [
    "market.validate-price",
    "market.analyze",
    "market.check-deviation",
  ];

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 1 };
  }

  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "market.validate-price":
        return validateQuotePrice(input);
      case "market.analyze":
        return analyzeMarket(input?.commodity, input?.hsCode);
      case "market.check-deviation":
        // If `commodities` is supplied, run the multi-port monitor sweep;
        // otherwise run a single-shot search for the given commodity/port.
        if (Array.isArray(input?.commodities) || input?.mode === "monitor") {
          return monitorPortPrices(input?.commodities);
        }
        return searchCommodityPrices(
          input?.commodity,
          input?.port,
          input?.country,
        );
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }
}

export const marketIntelligenceCapability =
  new MarketIntelligenceCapabilityModule();
export { MarketIntelligenceCapabilityModule };
