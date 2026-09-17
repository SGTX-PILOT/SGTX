// SGTX Seller Delta 1 — Quote Viability (CCL-005)
// =============================================================================
// A consolidated assessment shown BEFORE the seller finalizes the quote.
// This is NOT a numerical score — it's a structured summary with states:
//   VIABLE / VIABLE WITH CONDITIONS / BLOCKED
//
// Reuses existing systems:
//   - Trade Request Readiness (tenant-level, not duplicated here)
//   - EXW calculations (from QuoteBuilderScreen)
//   - Packing feasibility (from QuoteBuilderScreen layers)
//   - Logistics Builder (modeA/modeB/modeC costs)
//   - calculateMarginAtRisk (logistics/index.ts)
//   - calculateCostCertainty (logistics/index.ts)
//   - priceDeviationCheck (ai/orchestrator.ts) — called by the UI
//   - Document readiness (doc-rules.ts)
//   - Governor conditions
//
// Blueprint Part 3.12 — Seller Quote § "Quote Viability"

export type ViabilityCategoryState = "FIT" | "CONDITION" | "MISSING" | "BLOCKED" | "NOT_APPLICABLE";
export type ViabilityOverallState = "VIABLE" | "VIABLE_WITH_CONDITIONS" | "BLOCKED";

export interface ViabilityCategory {
  key: string;
  label: string;
  state: ViabilityCategoryState;
  detail?: string;
  actionUrl?: string; // deep-link to the responsible workflow
  actionLabel?: string;
}

export interface QuoteViabilityResult {
  categories: ViabilityCategory[];
  overallState: ViabilityOverallState;
  blockingIssues: string[];
  conditions: string[];
  summary: string;
  marginAtRisk?: number;
  expectedMargin?: number;
}

export interface QuoteViabilityInput {
  ustn?: string;
  // Commercial
  exwPrice?: number;
  totalQuote?: number;
  salePrice?: number;
  currency?: string;
  // Packing
  packingLocked?: boolean;
  totalCartons?: number;
  netWeightKg?: number;
  grossWeightKg?: number;
  // Logistics
  logisticsModeSelected?: boolean; // at least one of A/B/C configured
  logisticsTotal?: number;
  modeACosts?: Record<string, number>;
  selectedQuotes?: any[];
  // Compliance
  incoterm?: string;
  hsCode?: string;
  destCountry?: string;
  transportMode?: string;
  // Documents
  documentRequirements?: any[];
  // Deviation
  deviationPct?: number; // from priceDeviationCheck
  requiresJustification?: boolean;
  justificationProvided?: boolean;
  // Margin
  sgtxFee?: number;
  expectedMargin?: number;
  marginAtRisk?: number;
  // Governor
  governorAllowed?: boolean;
  governorConditions?: any[];
}

/**
 * Calculate the Quote Viability for a seller's in-progress quote.
 * Pure function — composes existing data into a structured summary.
 */
export function calculateQuoteViability(input: QuoteViabilityInput): QuoteViabilityResult {
  const categories: ViabilityCategory[] = [];
  const blockingIssues: string[] = [];
  const conditions: string[] = [];

  // ── Commercial Fit ────────────────────────────────────────────────────
  const hasExw = input.exwPrice !== undefined && input.exwPrice > 0;
  const hasTotal = input.totalQuote !== undefined && input.totalQuote > 0;
  const hasMargin = input.expectedMargin !== undefined && input.expectedMargin > 0;
  const commercialState = !hasExw ? "MISSING" : !hasMargin ? "CONDITION" : "FIT";
  categories.push({
    key: "commercial",
    label: "Commercial Fit",
    state: commercialState,
    detail: !hasExw ? "EXW price not set" : !hasMargin ? "Margin not yet calculated" : `EXW $${input.exwPrice} · Margin $${input.expectedMargin?.toFixed(0)}`,
    actionUrl: undefined,
    actionLabel: !hasExw ? "Set EXW Price" : undefined,
  });
  if (commercialState === "MISSING") blockingIssues.push("EXW price not set");
  if (commercialState === "CONDITION") conditions.push("Margin calculation pending");

  // ── Operational Fit (packing + logistics) ────────────────────────────
  const packingOk = input.packingLocked === true && (input.totalCartons || 0) > 0;
  const logisticsOk = input.logisticsModeSelected === true;
  const operationalState = !packingOk ? "MISSING" : !logisticsOk ? "CONDITION" : "FIT";
  categories.push({
    key: "operational",
    label: "Operational Fit",
    state: operationalState,
    detail: !packingOk ? "Packing not locked" : !logisticsOk ? "Logistics mode not selected" : `${input.totalCartons} cartons · logistics configured`,
    actionLabel: !packingOk ? "Lock Packing" : !logisticsOk ? "Configure Logistics" : undefined,
  });
  if (operationalState === "MISSING") blockingIssues.push("Packing not locked");
  if (operationalState === "CONDITION") conditions.push("Logistics mode selection pending");

  // ── Logistics Fit ─────────────────────────────────────────────────────
  const logisticsTotal = input.logisticsTotal || 0;
  const logisticsState = !logisticsOk ? "MISSING" : logisticsTotal === 0 ? "CONDITION" : "FIT";
  categories.push({
    key: "logistics",
    label: "Logistics Fit",
    state: logisticsState,
    detail: !logisticsOk ? "No logistics configured" : logisticsTotal === 0 ? "Logistics costs pending (RFQs sent)" : `Total logistics $${logisticsTotal.toFixed(0)}`,
    actionLabel: !logisticsOk ? "Open Logistics Builder" : undefined,
  });
  if (logisticsState === "MISSING") blockingIssues.push("No logistics configured");

  // ── Capacity ──────────────────────────────────────────────────────────
  // Capacity is confirmed when at least one Mode B/C quote is selected
  const hasCapacityConfirmed = (input.selectedQuotes || []).length > 0;
  const capacityState = !logisticsOk ? "NOT_APPLICABLE" : !hasCapacityConfirmed ? "CONDITION" : "FIT";
  categories.push({
    key: "capacity",
    label: "Capacity",
    state: capacityState,
    detail: !logisticsOk ? "N/A — no logistics" : !hasCapacityConfirmed ? "RFQs sent, no capacity confirmed yet" : `${input.selectedQuotes!.length} quote(s) selected`,
    actionLabel: logisticsOk && !hasCapacityConfirmed ? "Review RFQ Responses" : undefined,
  });
  if (capacityState === "CONDITION") conditions.push("Capacity not yet confirmed");

  // ── Compliance ───────────────────────────────────────────────────────
  const hasIncoterm = !!input.incoterm;
  const hasHsCode = !!input.hsCode;
  const hasDest = !!input.destCountry;
  const complianceState = !hasIncoterm || !hasHsCode ? "MISSING" : !hasDest ? "CONDITION" : "FIT";
  categories.push({
    key: "compliance",
    label: "Compliance",
    state: complianceState,
    detail: !hasIncoterm ? "Incoterm not set" : !hasHsCode ? "HS code not set" : !hasDest ? "Destination not set" : `${input.incoterm} · ${input.hsCode} → ${input.destCountry}`,
    actionLabel: !hasIncoterm ? "Set Incoterm" : undefined,
  });
  if (complianceState === "MISSING") blockingIssues.push("Compliance data incomplete");

  // ── Documents ─────────────────────────────────────────────────────────
  const docs = input.documentRequirements || [];
  const mandatoryDocs = docs.filter((d: any) => d.mandatory);
  const docsState = docs.length === 0 ? "MISSING" : mandatoryDocs.length === 0 ? "FIT" : "FIT";
  categories.push({
    key: "documents",
    label: "Documents",
    state: docsState,
    detail: docs.length === 0 ? "Document requirements not resolved" : `${docs.length} docs (${mandatoryDocs.length} mandatory)`,
    actionLabel: docs.length === 0 ? "Resolve Documents" : undefined,
  });
  if (docsState === "MISSING") conditions.push("Document requirements not resolved");

  // ── Margin ───────────────────────────────────────────────────────────
  const marginState = !hasMargin ? "MISSING" : (input.marginAtRisk || 0) > (input.expectedMargin || 0) * 0.5 ? "CONDITION" : "FIT";
  categories.push({
    key: "margin",
    label: "Margin",
    state: marginState,
    detail: !hasMargin ? "Margin not calculated" : `Expected $${input.expectedMargin?.toFixed(0)} · At-risk $${input.marginAtRisk?.toFixed(0)}`,
    actionLabel: !hasMargin ? "Calculate Margin" : undefined,
  });
  if (marginState === "CONDITION") conditions.push("Margin at risk exceeds 50% of expected margin");

  // ── Price Deviation (from AI band) ────────────────────────────────────
  if (input.deviationPct !== undefined && input.deviationPct > 15) {
    if (!input.justificationProvided && input.requiresJustification) {
      categories.push({
        key: "deviation",
        label: "Price Justification",
        state: "BLOCKED",
        detail: `Price deviates ${input.deviationPct.toFixed(1)}% from market band — justification required`,
        actionLabel: "Add Justification",
      });
      blockingIssues.push("Price deviation requires justification");
    }
  }

  // ── Governor ──────────────────────────────────────────────────────────
  if (input.governorAllowed === false) {
    categories.push({
      key: "governor",
      label: "Governor",
      state: "BLOCKED",
      detail: "Governor has not approved this quote submission",
      actionLabel: "View Governor Decision",
    });
    blockingIssues.push("Governor approval required");
  }

  // ── Derive overall state ──────────────────────────────────────────────
  let overallState: ViabilityOverallState;
  if (blockingIssues.length > 0) {
    overallState = "BLOCKED";
  } else if (conditions.length > 0) {
    overallState = "VIABLE_WITH_CONDITIONS";
  } else {
    overallState = "VIABLE";
  }

  const summary = buildSummary(overallState, blockingIssues.length, conditions.length);

  return {
    categories,
    overallState,
    blockingIssues,
    conditions,
    summary,
    marginAtRisk: input.marginAtRisk,
    expectedMargin: input.expectedMargin,
  };
}

function buildSummary(state: ViabilityOverallState, blocking: number, conditions: number): string {
  switch (state) {
    case "VIABLE":
      return "VIABLE — all checks pass";
    case "VIABLE_WITH_CONDITIONS":
      return `VIABLE WITH CONDITIONS — ${conditions} item(s) need attention`;
    case "BLOCKED":
      return `BLOCKED — ${blocking} blocking issue(s) must be resolved`;
    default:
      return "INCOMPLETE";
  }
}
