// SGTX Seller Delta 2 — Buyer-Change Impact (CCL-005)
// =============================================================================
// When a buyer changes a material field (quantity, destination, incoterm, etc.),
// calculate the downstream impact BEFORE the seller accepts the amendment.
//
// Uses states: UNCHANGED / RECALCULATED / INVALIDATED / RECONFIRM_REQUIRED /
// REQUOTE_REQUIRED / REGENERATE_REQUIRED
//
// Extends the existing negotiation/amendment workflow — does NOT create a
// second negotiation engine. Uses the existing parsed_specs / Trade source of truth.
//
// Blueprint Part 3.12 — Seller Quote § "Buyer-Change Impact"

export type ChangeImpactState =
  | "UNCHANGED"
  | "RECALCULATED"
  | "INVALIDATED"
  | "RECONFIRM_REQUIRED"
  | "REQUOTE_REQUIRED"
  | "REGENERATE_REQUIRED";

export interface FieldChange {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
  category: "commercial" | "logistics" | "compliance" | "financial" | "schedule";
}

export interface ImpactItem {
  area: string;
  state: ChangeImpactState;
  detail: string;
  actionUrl?: string;
  actionLabel?: string;
  governorBlocking?: boolean;
}

export interface BuyerChangeImpactResult {
  changes: FieldChange[];
  impacts: ImpactItem[];
  deltaMargin: number;
  deltaMarginPct: number;
  requiresGovernorApproval: boolean;
  requiresResign: boolean;
  advisory: string;
  blockingIssues: string[];
}

export interface BuyerChangeImpactInput {
  ustn: string;
  original: {
    quantity?: number;
    quantityUnit?: string;
    containerCount?: number;
    destCountry?: string;
    destPort?: string;
    deliveryWindow?: { earliest?: string; preferred?: string; latest?: string };
    incoterm?: string;
    settlementStructure?: string;
    paymentTiming?: string;
    partialShipment?: boolean;
    transshipment?: boolean;
    acceptanceCriteria?: any[];
    specialInstructions?: string;
    insuranceRequirement?: string;
    multiShipmentSchedule?: any[];
  };
  proposed: {
    quantity?: number;
    quantityUnit?: string;
    containerCount?: number;
    destCountry?: string;
    destPort?: string;
    deliveryWindow?: { earliest?: string; preferred?: string; latest?: string };
    incoterm?: string;
    settlementStructure?: string;
    paymentTiming?: string;
    partialShipment?: boolean;
    transshipment?: boolean;
    acceptanceCriteria?: any[];
    specialInstructions?: string;
    insuranceRequirement?: string;
    multiShipmentSchedule?: any[];
  };
  // Existing quote data (for margin recalculation)
  originalExw?: number;
  originalLogisticsTotal?: number;
  originalSgtxFee?: number;
  originalSalePrice?: number;
  estimatedNewExw?: number;
  estimatedNewLogistics?: number;
}

/**
 * Calculate the downstream impact of a buyer's amendment.
 * Pure function — composes existing data into an impact summary.
 */
export function calculateBuyerChangeImpact(input: BuyerChangeImpactInput): BuyerChangeImpactResult {
  const changes: FieldChange[] = [];
  const impacts: ImpactItem[] = [];
  const blockingIssues: string[] = [];
  let requiresGovernorApproval = false;
  let requiresResign = false;

  const o = input.original;
  const p = input.proposed;

  // ── Detect changes ────────────────────────────────────────────────────
  if (o.quantity !== p.quantity && p.quantity !== undefined) {
    changes.push({ field: "quantity", label: "Quantity", oldValue: o.quantity, newValue: p.quantity, category: "commercial" });
  }
  if (o.containerCount !== p.containerCount && p.containerCount !== undefined) {
    changes.push({ field: "containerCount", label: "Container Count", oldValue: o.containerCount, newValue: p.containerCount, category: "logistics" });
  }
  if (o.destCountry !== p.destCountry && p.destCountry !== undefined) {
    changes.push({ field: "destCountry", label: "Destination Country", oldValue: o.destCountry, newValue: p.destCountry, category: "logistics" });
  }
  if (o.destPort !== p.destPort && p.destPort !== undefined) {
    changes.push({ field: "destPort", label: "Destination Port", oldValue: o.destPort, newValue: p.destPort, category: "logistics" });
  }
  if (o.incoterm !== p.incoterm && p.incoterm !== undefined) {
    changes.push({ field: "incoterm", label: "Incoterm", oldValue: o.incoterm, newValue: p.incoterm, category: "commercial" });
  }
  if (o.settlementStructure !== p.settlementStructure && p.settlementStructure !== undefined) {
    changes.push({ field: "settlementStructure", label: "Settlement Structure", oldValue: o.settlementStructure, newValue: p.settlementStructure, category: "financial" });
  }
  if (o.paymentTiming !== p.paymentTiming && p.paymentTiming !== undefined) {
    changes.push({ field: "paymentTiming", label: "Payment Timing", oldValue: o.paymentTiming, newValue: p.paymentTiming, category: "financial" });
  }
  if (o.partialShipment !== p.partialShipment && p.partialShipment !== undefined) {
    changes.push({ field: "partialShipment", label: "Partial Shipment", oldValue: o.partialShipment, newValue: p.partialShipment, category: "logistics" });
  }
  if (o.transshipment !== p.transshipment && p.transshipment !== undefined) {
    changes.push({ field: "transshipment", label: "Transshipment", oldValue: o.transshipment, newValue: p.transshipment, category: "logistics" });
  }
  if (o.specialInstructions !== p.specialInstructions && p.specialInstructions !== undefined) {
    changes.push({ field: "specialInstructions", label: "Special Instructions", oldValue: o.specialInstructions, newValue: p.specialInstructions, category: "compliance" });
  }
  if (o.insuranceRequirement !== p.insuranceRequirement && p.insuranceRequirement !== undefined) {
    changes.push({ field: "insuranceRequirement", label: "Insurance Requirement", oldValue: o.insuranceRequirement, newValue: p.insuranceRequirement, category: "financial" });
  }
  if (o.deliveryWindow?.preferred !== p.deliveryWindow?.preferred && p.deliveryWindow?.preferred !== undefined) {
    changes.push({ field: "deliveryWindow", label: "Delivery Window", oldValue: o.deliveryWindow?.preferred, newValue: p.deliveryWindow?.preferred, category: "schedule" });
  }

  // ── Calculate impacts ──────────────────────────────────────────────────
  const hasQuantityChange = changes.some((c) => c.field === "quantity");
  const hasContainerChange = changes.some((c) => c.field === "containerCount");
  const hasDestChange = changes.some((c) => c.field === "destCountry" || c.field === "destPort");
  const hasIncotermChange = changes.some((c) => c.field === "incoterm");
  const hasSettlementChange = changes.some((c) => c.field === "settlementStructure" || c.field === "paymentTiming");
  const hasScheduleChange = changes.some((c) => c.field === "deliveryWindow");
  const hasAcceptanceChange = JSON.stringify(o.acceptanceCriteria) !== JSON.stringify(p.acceptanceCriteria);

  // EXW
  if (hasQuantityChange) {
    impacts.push({ area: "EXW", state: "RECALCULATED", detail: "Quantity changed — EXW price must be recalculated", actionLabel: "Recalculate EXW" });
  }

  // Packing
  if (hasQuantityChange || hasContainerChange) {
    impacts.push({ area: "Packing", state: "RECALCULATED", detail: "Quantity/container count changed — packing must be recalculated", actionLabel: "Recalculate Packing" });
  }

  // Trucking / Ocean Freight
  if (hasDestChange || hasContainerChange) {
    impacts.push({ area: "Trucking", state: "REQUOTE_REQUIRED", detail: "Destination or containers changed — trucking must be re-quoted", actionLabel: "Re-quote Trucking" });
    impacts.push({ area: "Ocean Freight", state: hasDestChange ? "REQUOTE_REQUIRED" : "RECONFIRM_REQUIRED", detail: hasDestChange ? "Destination changed — ocean freight must be re-quoted" : "Container count changed — capacity must be reconfirmed", actionLabel: hasDestChange ? "Re-quote Ocean" : "Reconfirm Capacity" });
  } else if (hasQuantityChange) {
    impacts.push({ area: "Ocean Freight", state: "UNCHANGED", detail: "No logistics change — ocean freight quote remains valid" });
  }

  // Capacity
  if (hasContainerChange || hasDestChange) {
    impacts.push({ area: "Capacity", state: "RECONFIRM_REQUIRED", detail: "Logistics parameters changed — capacity must be reconfirmed", actionLabel: "Reconfirm Capacity", governorBlocking: true });
    requiresGovernorApproval = true;
  }

  // Documents
  if (hasDestChange || hasIncotermChange) {
    impacts.push({ area: "Documents", state: "REGENERATE_REQUIRED", detail: "Destination/incoterm changed — document requirements must be regenerated", actionLabel: "Regenerate Documents" });
  }

  // Margin
  const deltaExw = (input.estimatedNewExw || input.originalExw || 0) - (input.originalExw || 0);
  const deltaLogistics = (input.estimatedNewLogistics || input.originalLogisticsTotal || 0) - (input.originalLogisticsTotal || 0);
  const deltaMargin = deltaExw + deltaLogistics; // simplified: if costs go up, margin goes down
  if (hasQuantityChange || hasDestChange) {
    impacts.push({
      area: "Margin",
      state: "RECALCULATED",
      detail: `Margin impact: ${deltaMargin >= 0 ? "+" : ""}$${deltaMargin.toFixed(0)}`,
    });
  } else {
    impacts.push({ area: "Margin", state: "UNCHANGED", detail: "No margin impact" });
  }

  // Schedule
  if (hasScheduleChange) {
    impacts.push({ area: "Schedule", state: "RECONFIRM_REQUIRED", detail: "Delivery window changed — schedule must be reconfirmed", actionLabel: "Reconfirm Schedule" });
  } else {
    impacts.push({ area: "Schedule", state: "UNCHANGED", detail: "No schedule change" });
  }

  // Contract
  if (hasIncotermChange || hasSettlementChange) {
    impacts.push({ area: "Contract", state: "INVALIDATED", detail: "Incoterm/settlement changed — contract terms must be re-drafted", actionLabel: "Re-draft Contract" });
    requiresResign = true;
    requiresGovernorApproval = true;
  } else {
    impacts.push({ area: "Contract", state: "UNCHANGED", detail: "Contract not yet affected (pre-lock)" });
  }

  // Acceptance Criteria
  if (hasAcceptanceChange) {
    impacts.push({ area: "Acceptance Criteria", state: "RECALCULATED", detail: "Acceptance criteria changed — QC inspection scope updated", actionLabel: "Review QC Scope" });
  }

  // ── Governor blocking ──────────────────────────────────────────────────
  if (requiresGovernorApproval) {
    blockingIssues.push("Buyer amendment requires Governor approval before acceptance");
  }

  const deltaMarginPct = input.originalSalePrice ? (deltaMargin / input.originalSalePrice) * 100 : 0;

  const advisory = buildAdvisory(changes, impacts, deltaMargin);

  return {
    changes,
    impacts,
    deltaMargin,
    deltaMarginPct,
    requiresGovernorApproval,
    requiresResign,
    advisory,
    blockingIssues,
  };
}

function buildAdvisory(changes: FieldChange[], impacts: ImpactItem[], deltaMargin: number): string {
  if (changes.length === 0) return "No changes detected.";
  const criticalImpacts = impacts.filter((i) => i.state === "REQUOTE_REQUIRED" || i.state === "INVALIDATED" || i.state === "REGENERATE_REQUIRED");
  const marginNote = deltaMargin !== 0 ? ` Margin impact: ${deltaMargin >= 0 ? "+" : ""}$${deltaMargin.toFixed(0)}.` : "";
  if (criticalImpacts.length > 0) {
    return `Buyer amended ${changes.length} field(s).${criticalImpacts.length} critical impact(s) require action before acceptance.${marginNote} Review the impact summary and re-quote/reconfirm as needed.`;
  }
  return `Buyer amended ${changes.length} field(s).${marginNote} Some items need recalculation. Review the impact summary before accepting.`;
}
