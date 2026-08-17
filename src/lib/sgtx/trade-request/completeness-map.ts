// SGTX Buyer Request Completeness Map (CCL-004)
// =============================================================================
// Exposes the underlying completeness structure of a buyer trade request.
// This is NOT a score — it's a category-level checklist showing what's
// COMPLETE / MISSING / OPTIONAL / NOT_APPLICABLE / BLOCKED.
//
// The existing Trade Request Readiness score remains as an advisory summary;
// this completeness map is the primary actionable explanation.
//
// Blueprint Part 4 — Buyer Trade Request § "Completeness Map"

export type CompletenessState =
  | "COMPLETE"
  | "MISSING"
  | "OPTIONAL"
  | "NOT_APPLICABLE"
  | "BLOCKED";

export type OverallReadinessState =
  | "READY"
  | "READY_WITH_OPTIONAL"
  | "INCOMPLETE"
  | "CONDITIONALLY_READY"
  | "BLOCKED";

export interface CompletenessCategory {
  key: string;
  label: string;
  state: CompletenessState;
  missingItems?: string[];
  blockingReasons?: string[];
  responsibleSection?: string;
}

export interface CompletenessMapResult {
  categories: CompletenessCategory[];
  overallState: OverallReadinessState;
  missingCount: number;
  blockingCount: number;
  summary: string;
}

// Canonical category list (per blueprint §4 + §15 canonical order)
export const COMPLETENESS_CATEGORIES = [
  "commercial",
  "seller",
  "product",
  "quantity",
  "acceptanceCriteria",
  "transport",
  "destination",
  "documentation",
  "insurance",
  "settlement",
  "specialInstructions",
  "shipmentSchedule",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  commercial: "Commercial",
  seller: "Seller / Counterparty",
  product: "Product",
  quantity: "Quantity",
  acceptanceCriteria: "Acceptance Criteria",
  transport: "Transport",
  destination: "Destination",
  documentation: "Documentation",
  insurance: "Insurance",
  settlement: "Settlement",
  specialInstructions: "Special Trade Instructions",
  shipmentSchedule: "Shipment Schedule",
};

export interface TradeRequestFormState {
  // Step 1: Parties & Incoterm
  sellerGtid?: string;
  incoterm?: string;
  // Step 2: Commodity & Spec
  commodityType?: string;
  productName?: string;
  hsCode?: string;
  // Step 3: Containers & Cargo
  containers?: any[];
  // Step 4: Documentation
  documentRequirements?: any[];
  // Step 5: Transport & Logistics
  transportMode?: string;
  equipmentType?: string;
  originCountry?: string;
  destCountry?: string;
  destPort?: string;
  earliestDeliveryDate?: string;
  preferredDeliveryDate?: string;
  latestDeliveryDate?: string;
  // Step 6: Insurance
  insuranceRequirement?: string;
  insuranceResponsibleParty?: string;
  // Step 7: Settlement
  settlementStructure?: string;
  paymentTiming?: string;
  currency?: string;
  // Step 8: Criticality
  tradeCriticality?: string;
  // Step 9: Shipments & Notes
  multiShipmentSchedule?: any[];
  specialInstructions?: string;
  // Acceptance criteria (from product form agent)
  acceptanceCriteria?: any[];
}

/**
 * Calculate the completeness map for a buyer trade request form state.
 * Pure function — no side effects, no DB calls.
 *
 * Each category is evaluated independently. The overall state is derived
 * from the worst blocking category:
 *   - any BLOCKED → BLOCKED
 *   - any MISSING → INCOMPLETE (or CONDITIONALLY_READY if only optional missing)
 *   - all COMPLETE → READY (or READY_WITH_OPTIONAL if any OPTIONAL)
 */
export function calculateCompletenessMap(
  form: TradeRequestFormState
): CompletenessMapResult {
  const categories: CompletenessCategory[] = [];

  // ── Seller / Counterparty ────────────────────────────────────────────
  categories.push({
    key: "seller",
    label: CATEGORY_LABELS.seller,
    state: form.sellerGtid ? "COMPLETE" : "MISSING",
    missingItems: form.sellerGtid ? [] : ["Seller GTID not selected"],
    responsibleSection: "Parties & Incoterm",
  });

  // ── Commercial (incoterm + currency + settlement) ─────────────────────
  const commercialMissing: string[] = [];
  if (!form.incoterm) commercialMissing.push("Incoterm not selected");
  if (!form.currency) commercialMissing.push("Currency not set");
  if (!form.settlementStructure) commercialMissing.push("Settlement structure not chosen");
  categories.push({
    key: "commercial",
    label: CATEGORY_LABELS.commercial,
    state: commercialMissing.length === 0 ? "COMPLETE" : "MISSING",
    missingItems: commercialMissing,
    responsibleSection: "Parties & Incoterm · Commercial Settlement",
  });

  // ── Product ───────────────────────────────────────────────────────────
  const productMissing: string[] = [];
  if (!form.commodityType) productMissing.push("Commodity type not selected");
  if (!form.productName) productMissing.push("Product name not entered");
  if (!form.hsCode) productMissing.push("HS code not entered");
  categories.push({
    key: "product",
    label: CATEGORY_LABELS.product,
    state: productMissing.length === 0 ? "COMPLETE" : "MISSING",
    missingItems: productMissing,
    responsibleSection: "Commodity & Spec",
  });

  // ── Quantity (derived from containers/commodities) ────────────────────
  const hasContainers = form.containers && form.containers.length > 0;
  const hasCommodityWithWeight = form.containers?.some(
    (c: any) => c.commodities && c.commodities.length > 0
  );
  categories.push({
    key: "quantity",
    label: CATEGORY_LABELS.quantity,
    state: !hasContainers ? "MISSING" : !hasCommodityWithWeight ? "MISSING" : "COMPLETE",
    missingItems: !hasContainers
      ? ["No containers configured"]
      : !hasCommodityWithWeight
      ? ["Containers have no commodities with weights"]
      : [],
    responsibleSection: "Containers & Cargo",
  });

  // ── Acceptance Criteria ───────────────────────────────────────────────
  const hasAcceptance = form.acceptanceCriteria && form.acceptanceCriteria.length > 0;
  categories.push({
    key: "acceptanceCriteria",
    label: CATEGORY_LABELS.acceptanceCriteria,
    state: hasAcceptance ? "COMPLETE" : "OPTIONAL",
    missingItems: hasAcceptance ? [] : ["No acceptance criteria specified — optional but recommended for QC"],
    responsibleSection: "Commodity & Spec · Acceptance Criteria",
  });

  // ── Transport ─────────────────────────────────────────────────────────
  const transportMissing: string[] = [];
  if (!form.transportMode) transportMissing.push("Transport mode not selected");
  if (form.transportMode && !form.equipmentType) transportMissing.push("Equipment type not selected");
  categories.push({
    key: "transport",
    label: CATEGORY_LABELS.transport,
    state: transportMissing.length === 0 ? "COMPLETE" : "MISSING",
    missingItems: transportMissing,
    responsibleSection: "Transport & Logistics",
  });

  // ── Destination ───────────────────────────────────────────────────────
  const destMissing: string[] = [];
  if (!form.destCountry) destMissing.push("Destination country not selected");
  if (!form.destPort) destMissing.push("Destination port not selected");
  categories.push({
    key: "destination",
    label: CATEGORY_LABELS.destination,
    state: destMissing.length === 0 ? "COMPLETE" : "MISSING",
    missingItems: destMissing,
    responsibleSection: "Transport & Logistics · Destination",
  });

  // ── Documentation ─────────────────────────────────────────────────────
  const docs = form.documentRequirements || [];
  const mandatoryDocs = docs.filter((d: any) => d.mandatory);
  const missingMandatoryDocs = mandatoryDocs.filter((d: any) => !d.attached && !d.waived);
  categories.push({
    key: "documentation",
    label: CATEGORY_LABELS.documentation,
    state: docs.length === 0
      ? "MISSING"
      : missingMandatoryDocs.length > 0
      ? "MISSING"
      : "COMPLETE",
    missingItems: missingMandatoryDocs.map((d: any) => `${d.docName || d.docType} (mandatory)`),
    responsibleSection: "Documentation",
  });

  // ── Insurance ─────────────────────────────────────────────────────────
  // CIF/CIP require insurance; others make it optional
  const requiresInsurance = form.incoterm === "CIF" || form.incoterm === "CIP";
  const insuranceMissing =
    !form.insuranceRequirement || form.insuranceRequirement === "NONE";
  categories.push({
    key: "insurance",
    label: CATEGORY_LABELS.insurance,
    state: requiresInsurance
      ? insuranceMissing
        ? "BLOCKED"
        : "COMPLETE"
      : insuranceMissing
      ? "OPTIONAL"
      : "COMPLETE",
    missingItems: requiresInsurance && insuranceMissing
      ? ["Insurance required for CIF/CIP incoterms"]
      : [],
    blockingReasons: requiresInsurance && insuranceMissing
      ? ["Governor: CIF/CIP mandate insurance coverage"]
      : [],
    responsibleSection: "Insurance",
  });

  // ── Settlement ────────────────────────────────────────────────────────
  categories.push({
    key: "settlement",
    label: CATEGORY_LABELS.settlement,
    state: form.settlementStructure ? "COMPLETE" : "MISSING",
    missingItems: form.settlementStructure ? [] : ["Settlement structure not chosen"],
    responsibleSection: "Commercial Settlement",
  });

  // ── Special Trade Instructions ───────────────────────────────────────
  categories.push({
    key: "specialInstructions",
    label: CATEGORY_LABELS.specialInstructions,
    state: form.specialInstructions ? "COMPLETE" : "OPTIONAL",
    missingItems: form.specialInstructions ? [] : ["No special instructions — optional"],
    responsibleSection: "Shipments & Notes",
  });

  // ── Shipment Schedule ────────────────────────────────────────────────
  // Multi-shipment is optional unless tradeCriticality requires scheduling
  const hasSchedule = form.multiShipmentSchedule && form.multiShipmentSchedule.length > 0;
  categories.push({
    key: "shipmentSchedule",
    label: CATEGORY_LABELS.shipmentSchedule,
    state: hasSchedule ? "COMPLETE" : "OPTIONAL",
    missingItems: hasSchedule ? [] : ["No multi-shipment schedule — not applicable for single shipment"],
    responsibleSection: "Shipments & Notes",
  });

  // ── Derive overall state ──────────────────────────────────────────────
  const blockingCount = categories.filter((c) => c.state === "BLOCKED").length;
  const missingCount = categories.filter((c) => c.state === "MISSING").length;
  const optionalCount = categories.filter((c) => c.state === "OPTIONAL").length;

  let overallState: OverallReadinessState;
  if (blockingCount > 0) {
    overallState = "BLOCKED";
  } else if (missingCount > 0) {
    overallState = "INCOMPLETE";
  } else if (optionalCount > 0) {
    overallState = "READY_WITH_OPTIONAL";
  } else {
    overallState = "READY";
  }

  // CONDITIONALLY_READY: missing only optional items that could be completed later
  if (missingCount === 0 && optionalCount > 0 && blockingCount === 0) {
    overallState = "CONDITIONALLY_READY";
  }

  const summary = buildSummary(overallState, missingCount, blockingCount);

  return { categories, overallState, missingCount, blockingCount, summary };
}

function buildSummary(
  state: OverallReadinessState,
  missing: number,
  blocking: number
): string {
  switch (state) {
    case "READY":
      return "READY — all required items complete";
    case "READY_WITH_OPTIONAL":
      return `READY WITH ${missing} OPTIONAL ITEM${missing === 1 ? "" : "S"}`;
    case "CONDITIONALLY_READY":
      return "CONDITIONALLY READY — optional items can be completed later";
    case "INCOMPLETE":
      return `INCOMPLETE — ${missing} required item${missing === 1 ? "" : "s"} missing`;
    case "BLOCKED":
      return `BLOCKED — ${blocking} blocking issue${blocking === 1 ? "" : "s"} must be resolved`;
    default:
      return "INCOMPLETE";
  }
}
