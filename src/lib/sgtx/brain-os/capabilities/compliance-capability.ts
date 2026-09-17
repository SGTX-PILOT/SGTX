// SGTX Brain OS — Compliance Capability Module
// Wraps the existing compliance logic (sanctions + force-majeure + EUDR + CBAM +
// UCP600 pre-contract gate) into the Brain OS module pattern. The capability
// module itself contains NO business logic — it is a thin dispatcher that
// imports the proven implementations from `@/lib/sgtx/ai/compliance-gate` and
// `@/lib/sgtx/compliance/*`.
//
// Capabilities exposed:
//   • compliance.precheck   → autoCheckCompliance (aggregated pre-contract gate)
//   • compliance.eudr       → assessEudr (Regulation (EU) 2023/1115)
//   • compliance.fm         → assessTradeForceMajeure (corridor FM assessment)
//   • compliance.sanctions  → screenForSanctions (OFAC/EU/UK/UN)
//   • compliance.ucp600     → validateLcDocuments (letter-of-credit doc check)
//
// This module is INDEPENDENT and REPLACEABLE: drop in another BrainModule with
// the same `id` via `moduleRegistry.hotReload` to swap implementations.

import type { BrainModule } from "../core/types";
import { autoCheckCompliance } from "@/lib/sgtx/ai/compliance-gate";
import { assessEudr } from "@/lib/sgtx/compliance/eudr";
import { assessTradeForceMajeure } from "@/lib/sgtx/compliance/force-majeure";
import { screenForSanctions } from "@/lib/sgtx/compliance/sanctions";
import { validateLcDocuments } from "@/lib/sgtx/compliance/ucp600";

class ComplianceCapabilityModule implements BrainModule {
  id = "compliance-brain";
  name = "Compliance Brain";
  version = "1.0.0";
  type = "capability" as const;
  authority = "A3" as const;
  description =
    "Unified compliance: sanctions + FM + EUDR + CBAM + UCP600 pre-contract gate";
  capabilities = [
    "compliance.precheck",
    "compliance.eudr",
    "compliance.fm",
    "compliance.sanctions",
    "compliance.ucp600",
  ];

  async initialize(): Promise<void> {
    /* stateless — no setup required */
  }
  async shutdown(): Promise<void> {
    /* stateless — no teardown required */
  }
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 1 };
  }

  /** Dispatch a capability invocation to the underlying logic. */
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "compliance.precheck":
        return autoCheckCompliance(input);
      case "compliance.eudr":
        return assessEudr(input);
      case "compliance.fm":
        return assessTradeForceMajeure(input);
      case "compliance.sanctions":
        return screenForSanctions(input);
      case "compliance.ucp600":
        return validateLcDocuments(input?.terms, input?.documents ?? []);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }
}

export const complianceCapability = new ComplianceCapabilityModule();
export { ComplianceCapabilityModule };
