// SGTX Seller Deltas — Lifecycle Helper (CCL-005)
// =============================================================================
// Derives the seller-side lifecycle stage for a trade. Used by the
// Build→Execute lifecycle transition (Delta 4) and the Seller Control Tower.
//
// Blueprint Part 3.12 — Seller lifecycle: Quote Building → Contract Ready →
// Contract Locked → Execution → Settlement.

export type SellerLifecycleStage =
  | "QUOTE_BUILDING"      // trade INITIATED, seller preparing quote
  | "QUOTED"             // quote submitted, awaiting buyer review
  | "NEGOTIATION"         // buyer sent counter-offer / amendment
  | "CONTRACT_READY"     // quote accepted, pre-lock checklist complete
  | "CONTRACT_LOCKED"    // contract signed + locked
  | "EXECUTION"          // shipment in transit / milestones
  | "DELIVERED"          // delivery confirmed
  | "SETTLED"            // payment settled
  | "CANCELLED"          // trade cancelled
  | "DISPUTED";          // dispute filed

export interface LifecycleStageInfo {
  stage: SellerLifecycleStage;
  phase: "PRE_CONTRACT" | "POST_CONTRACT" | "COMPLETED" | "CANCELLED";
  label: string;
  description: string;
  primaryEmphasis: string[]; // what the seller should focus on
  nextAction?: string;
}

const STAGE_INFO: Record<SellerLifecycleStage, Omit<LifecycleStageInfo, "stage">> = {
  QUOTE_BUILDING: {
    phase: "PRE_CONTRACT",
    label: "Quote Building",
    description: "Seller is preparing the quote: EXW price, packing, logistics, compliance.",
    primaryEmphasis: ["buyer request", "EXW", "packing", "logistics", "alternatives", "quote", "negotiation", "contract readiness"],
    nextAction: "Submit Quote",
  },
  QUOTED: {
    phase: "PRE_CONTRACT",
    label: "Quote Submitted",
    description: "Quote submitted to buyer. Awaiting buyer review.",
    primaryEmphasis: ["negotiation", "buyer response", "offer expiry"],
    nextAction: "Await Buyer Response",
  },
  NEGOTIATION: {
    phase: "PRE_CONTRACT",
    label: "Negotiation",
    description: "Buyer sent a counter-offer or amendment. Review buyer-change impact.",
    primaryEmphasis: ["buyer-change impact", "amendment", "re-quote if needed", "negotiation"],
    nextAction: "Review Buyer Amendment",
  },
  CONTRACT_READY: {
    phase: "PRE_CONTRACT",
    label: "Contract Ready",
    description: "Quote accepted. Pre-lock checklist complete. Ready to sign.",
    primaryEmphasis: ["contract readiness", "addenda", "sign contract"],
    nextAction: "Sign Contract",
  },
  CONTRACT_LOCKED: {
    phase: "POST_CONTRACT",
    label: "Contract Locked",
    description: "Contract signed and locked. Transitioning to execution.",
    primaryEmphasis: ["shipment execution", "shipment readiness", "exceptions", "commitments"],
    nextAction: "Acknowledge Release",
  },
  EXECUTION: {
    phase: "POST_CONTRACT",
    label: "Execution",
    description: "Shipment in transit. Monitor milestones, exceptions, last-safe actions.",
    primaryEmphasis: ["shipment execution", "milestones", "last-safe actions", "document state", "QC/LAB/customs", "release", "loading", "payment"],
    nextAction: "Monitor Milestones",
  },
  DELIVERED: {
    phase: "POST_CONTRACT",
    label: "Delivered",
    description: "Delivery confirmed. Awaiting settlement.",
    primaryEmphasis: ["settlement", "payment", "final documents"],
    nextAction: "Confirm Settlement",
  },
  SETTLED: {
    phase: "COMPLETED",
    label: "Settled",
    description: "Trade completed. Payment settled.",
    primaryEmphasis: [],
  },
  CANCELLED: {
    phase: "CANCELLED",
    label: "Cancelled",
    description: "Trade was cancelled.",
    primaryEmphasis: [],
  },
  DISPUTED: {
    phase: "POST_CONTRACT",
    label: "Disputed",
    description: "A dispute has been filed. Mediation/arbitration in progress.",
    primaryEmphasis: ["dispute resolution", "evidence", "mediation"],
    nextAction: "Respond to Dispute",
  },
};

/**
 * Derive the seller lifecycle stage from a trade's status + phase.
 * Pure function — no DB calls.
 */
export function deriveSellerLifecycleStage(trade: {
  status?: string;
  phase?: number;
}): LifecycleStageInfo {
  const status = trade?.status || "INITIATED";
  const phase = trade?.phase || 0;

  let stage: SellerLifecycleStage;
  switch (status) {
    case "INITIATED":
      stage = "QUOTE_BUILDING";
      break;
    case "QUOTED":
      stage = "QUOTED";
      break;
    case "BUYER_AMENDED":
    case "COUNTER_OFFERED":
      stage = "NEGOTIATION";
      break;
    case "QUOTE_ACCEPTED":
    case "BUYER_SUBMITTED":
      stage = "CONTRACT_READY";
      break;
    case "CONTRACT_SIGNED":
    case "CONTRACT_LOCKED":
      stage = phase >= 4 ? "EXECUTION" : "CONTRACT_LOCKED";
      break;
    case "IN_EXECUTION":
      stage = "EXECUTION";
      break;
    case "DELIVERED":
      stage = "DELIVERED";
      break;
    case "SETTLED":
      stage = "SETTLED";
      break;
    case "CANCELLED":
      stage = "CANCELLED";
      break;
    case "DISPUTED":
      stage = "DISPUTED";
      break;
    default:
      stage = "QUOTE_BUILDING";
  }

  return { stage, ...STAGE_INFO[stage] };
}

/**
 * Returns true if the trade is in a pre-contract stage (quote building, negotiation).
 */
export function isPreContract(trade: { status?: string; phase?: number }): boolean {
  return deriveSellerLifecycleStage(trade).phase === "PRE_CONTRACT";
}

/**
 * Returns true if the trade is in a post-contract stage (execution, delivery, settlement).
 */
export function isPostContract(trade: { status?: string; phase?: number }): boolean {
  const info = deriveSellerLifecycleStage(trade);
  return info.phase === "POST_CONTRACT" || info.phase === "COMPLETED";
}
