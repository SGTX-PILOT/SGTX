// SGTX Seller Delta 3 — Contract Readiness (CCL-005)
// =============================================================================
// A consolidated seller-facing summary of pre-lock contract conditions.
// This is NOT a new score — it's a checklist with states:
//   READY / ACTION_REQUIRED / BLOCKED
//
// Extends the existing contract generation + logistics addenda + Governor
// consistency validation. Does NOT create a new contract-validation engine.
//
// Blueprint Part 3.12 — Seller Quote § "Contract Readiness View"

export type ContractReadinessItemState = "READY" | "ACTION_REQUIRED" | "BLOCKED" | "NOT_APPLICABLE";
export type ContractReadinessOverallState = "READY" | "ACTION_REQUIRED" | "BLOCKED";

export interface ContractReadinessItem {
  key: string;
  label: string;
  state: ContractReadinessItemState;
  detail?: string;
  actionUrl?: string;  // deep-link to the responsible workflow
  actionLabel?: string;
  category: "commercial" | "logistics" | "compliance" | "financial" | "operational";
}

export interface ContractReadinessResult {
  items: ContractReadinessItem[];
  overallState: ContractReadinessOverallState;
  readyCount: number;
  actionRequiredCount: number;
  blockedCount: number;
  summary: string;
  governorBlocking?: string;
}

export interface ContractReadinessInput {
  ustn: string;
  // Commercial
  exwLocked?: boolean;
  commercialTermsAgreed?: boolean;
  // Packing
  packingLocked?: boolean;
  // Logistics
  logisticsConfigured?: boolean;
  capacityConfirmed?: boolean;
  // Addenda
  addendaSigned?: number;
  addendaTotal?: number;
  // Documents
  documentsReady?: boolean;
  mandatoryDocsComplete?: boolean;
  // QC
  qcBooked?: boolean;
  qcRequired?: boolean;
  // LAB
  labTestsRequired?: boolean;
  labBooked?: boolean;
  // Customs
  customsBrokerAssigned?: boolean;
  customsRequired?: boolean;
  // Insurance
  insuranceConfigured?: boolean;
  insuranceRequired?: boolean;
  // Settlement
  feePaid?: boolean;
  settlementAgreed?: boolean;
  // Signatures
  buyerSigned?: boolean;
  sellerSigned?: boolean;
  releaseAcknowledged?: boolean;
  // Governor
  governorAllowed?: boolean;
  governorConditions?: any[];
}

/**
 * Calculate the Contract Readiness for a trade approaching lock.
 * Pure function — composes existing data into a structured checklist.
 */
export function calculateContractReadiness(input: ContractReadinessInput): ContractReadinessResult {
  const items: ContractReadinessItem[] = [];
  let governorBlocking: string | undefined;

  // ── Commercial Terms ──────────────────────────────────────────────────
  items.push({
    key: "commercialTerms",
    label: "Commercial Terms",
    state: input.commercialTermsAgreed ? "READY" : "ACTION_REQUIRED",
    detail: input.commercialTermsAgreed ? "Agreed" : "Not yet agreed",
    actionLabel: input.commercialTermsAgreed ? undefined : "Review Terms",
    category: "commercial",
  });

  // ── EXW Price ─────────────────────────────────────────────────────────
  items.push({
    key: "exwPrice",
    label: "EXW Price",
    state: input.exwLocked ? "READY" : "ACTION_REQUIRED",
    detail: input.exwLocked ? "Locked" : "Not locked",
    actionLabel: input.exwLocked ? undefined : "Lock EXW Price",
    category: "commercial",
  });

  // ── Packing ──────────────────────────────────────────────────────────
  items.push({
    key: "packing",
    label: "Packing",
    state: input.packingLocked ? "READY" : "ACTION_REQUIRED",
    detail: input.packingLocked ? "Locked" : "Not locked",
    actionLabel: input.packingLocked ? undefined : "Lock Packing",
    category: "operational",
  });

  // ── Logistics ─────────────────────────────────────────────────────────
  items.push({
    key: "logistics",
    label: "Logistics",
    state: !input.logisticsConfigured ? "ACTION_REQUIRED" : "READY",
    detail: input.logisticsConfigured ? "Configured" : "Not configured",
    actionLabel: !input.logisticsConfigured ? "Open Logistics Builder" : undefined,
    category: "logistics",
  });

  // ── Capacity ──────────────────────────────────────────────────────────
  items.push({
    key: "capacity",
    label: "Capacity",
    state: !input.capacityConfirmed ? "ACTION_REQUIRED" : "READY",
    detail: input.capacityConfirmed ? "Confirmed" : "Not confirmed",
    actionLabel: !input.capacityConfirmed ? "Confirm Capacity" : undefined,
    category: "logistics",
  });

  // ── Required Addenda ──────────────────────────────────────────────────
  const addendaTotal = input.addendaTotal || 0;
  const addendaSigned = input.addendaSigned || 0;
  items.push({
    key: "addenda",
    label: "Required Addenda",
    state: addendaTotal === 0 ? "NOT_APPLICABLE" : addendaSigned >= addendaTotal ? "READY" : "ACTION_REQUIRED",
    detail: addendaTotal === 0 ? "N/A — no addenda required" : `${addendaSigned}/${addendaTotal} signed`,
    actionLabel: addendaTotal > 0 && addendaSigned < addendaTotal ? "Sign Addenda" : undefined,
    category: "logistics",
  });

  // ── Documents ─────────────────────────────────────────────────────────
  items.push({
    key: "documents",
    label: "Documents",
    state: !input.mandatoryDocsComplete ? "ACTION_REQUIRED" : "READY",
    detail: input.mandatoryDocsComplete ? "Complete" : "Mandatory docs pending",
    actionLabel: !input.mandatoryDocsComplete ? "Finalise Documents" : undefined,
    category: "compliance",
  });

  // ── QC ────────────────────────────────────────────────────────────────
  const qcState: ContractReadinessItemState = !input.qcRequired ? "NOT_APPLICABLE" : input.qcBooked ? "READY" : "ACTION_REQUIRED";
  items.push({
    key: "qc",
    label: "QC",
    state: qcState,
    detail: !input.qcRequired ? "N/A — not required" : input.qcBooked ? "Booked" : "Not booked",
    actionLabel: input.qcRequired && !input.qcBooked ? "Book QC" : undefined,
    category: "compliance",
  });

  // ── LAB ───────────────────────────────────────────────────────────────
  const labState: ContractReadinessItemState = !input.labTestsRequired ? "NOT_APPLICABLE" : input.labBooked ? "READY" : "ACTION_REQUIRED";
  items.push({
    key: "lab",
    label: "LAB",
    state: labState,
    detail: !input.labTestsRequired ? "N/A — not required" : input.labBooked ? "Booked" : "Not booked",
    actionLabel: input.labTestsRequired && !input.labBooked ? "Book LAB" : undefined,
    category: "compliance",
  });

  // ── Customs ──────────────────────────────────────────────────────────
  const customsState: ContractReadinessItemState = !input.customsRequired ? "NOT_APPLICABLE" : input.customsBrokerAssigned ? "READY" : "ACTION_REQUIRED";
  items.push({
    key: "customs",
    label: "Customs",
    state: customsState,
    detail: !input.customsRequired ? "N/A — not required" : input.customsBrokerAssigned ? "Broker assigned" : "Broker not assigned",
    actionLabel: input.customsRequired && !input.customsBrokerAssigned ? "Assign Customs Broker" : undefined,
    category: "compliance",
  });

  // ── Insurance ─────────────────────────────────────────────────────────
  const insState: ContractReadinessItemState = !input.insuranceRequired ? "NOT_APPLICABLE" : input.insuranceConfigured ? "READY" : "ACTION_REQUIRED";
  items.push({
    key: "insurance",
    label: "Insurance",
    state: insState,
    detail: !input.insuranceRequired ? "N/A — not required" : input.insuranceConfigured ? "Configured" : "Not configured",
    actionLabel: input.insuranceRequired && !input.insuranceConfigured ? "Configure Insurance" : undefined,
    category: "financial",
  });

  // ── Settlement ────────────────────────────────────────────────────────
  items.push({
    key: "settlement",
    label: "Settlement",
    state: !input.settlementAgreed ? "ACTION_REQUIRED" : input.feePaid ? "READY" : "ACTION_REQUIRED",
    detail: !input.settlementAgreed ? "Not agreed" : input.feePaid ? "Fee paid" : "Fee not paid",
    actionLabel: !input.settlementAgreed ? "Agree Settlement" : !input.feePaid ? "Pay SGTX Fee" : undefined,
    category: "financial",
  });

  // ── Governor ──────────────────────────────────────────────────────────
  if (input.governorAllowed === false) {
    items.push({
      key: "governor",
      label: "Governor",
      state: "BLOCKED",
      detail: "Governor has not approved contract lock",
      actionLabel: "View Governor Decision",
      category: "compliance",
    });
    governorBlocking = "Contract lock blocked by Governor — resolve conditions first";
  }

  // ── Derive overall state ──────────────────────────────────────────────
  const readyCount = items.filter((i) => i.state === "READY").length;
  const actionRequiredCount = items.filter((i) => i.state === "ACTION_REQUIRED").length;
  const blockedCount = items.filter((i) => i.state === "BLOCKED").length;

  let overallState: ContractReadinessOverallState;
  if (blockedCount > 0) {
    overallState = "BLOCKED";
  } else if (actionRequiredCount > 0) {
    overallState = "ACTION_REQUIRED";
  } else {
    overallState = "READY";
  }

  const summary = buildSummary(overallState, readyCount, actionRequiredCount, blockedCount, items.length);

  return { items, overallState, readyCount, actionRequiredCount, blockedCount, summary, governorBlocking };
}

function buildSummary(
  state: ContractReadinessOverallState,
  ready: number,
  actionRequired: number,
  blocked: number,
  total: number
): string {
  switch (state) {
    case "READY":
      return `CONTRACT READY — ${ready}/${total} conditions satisfied`;
    case "ACTION_REQUIRED":
      return `ACTION REQUIRED — ${actionRequired} item(s) need attention (${ready}/${total} ready)`;
    case "BLOCKED":
      return `BLOCKED BY GOVERNOR — ${blocked} blocking issue(s) must be resolved`;
    default:
      return "INCOMPLETE";
  }
}
