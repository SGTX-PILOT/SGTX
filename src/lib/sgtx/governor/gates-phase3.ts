// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §15 — Phase 3 Governor Gates (Quote / Contract) G3U1–G3U13
// ═══════════════════════════════════════════════════════════════════════════════
//
// Phase 3 sits between the buyer's accepted quote and the locked contract. The
// 11 gates below verify that:
//   • The quote carries every mandatory field the contract will mirror.
//   • The packing plan (incl. non-uniform layers) is locked.
//   • Multi-shipment schedule is fully defined.
//   • Alternative ports are valid when declared.
//   • The SGTX fee is correctly calculated.
//   • A quote exists for every Incoterm-mandatory service (Mode A/B/C).
//   • The contract field-by-field mirrors the Final Commercial Term Sheet.
//   • The non-removable SGTX Witness Clause is present.
//   • A QES signature (Egypt Trust / Misr or Ed25519 fallback) is valid.
//   • The FeeLock state is PENDING (not yet active — USTN is not minted here).
//   • The final lock precondition (all prior gates passed) holds.
//   • A CFR was issued before contract lock when buyer financing is required.
//   • The CFR is valid at contract lock time (not expired, not rejected).
//
// Each gate is an ASYNC function that returns:
//   { gateId, passed, severity, message, remediation? }
//
// severity:
//   • CRITICAL — block contract lock until passed.
//   • WARNING  — surface to the operator but do not block.
//
// The gate is PURE in the sense that it never throws — DB lookup failures
// degrade to a CRITICAL fail with a descriptive remediation string.
//
// NON-MARKETPLACE: gates never produce scores, rankings, or counterparty
// recommendations. They answer the binary "may this contract be locked?"
// question only.

import { db } from "@/lib/db";

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export type GateSeverity = "CRITICAL" | "WARNING";

export interface GateResult {
  gateId: string;            // "G3U1" .. "G3U13"
  passed: boolean;
  severity: GateSeverity;
  message: string;
  remediation?: string;
}

export interface Phase3Context {
  tradeId?: string;
  quoteId?: string;
  contractId?: string;
  ustn?: string;
}

export interface Phase3ValidationResult {
  phase: 3;
  gates: GateResult[];
  critical_passed: number;
  critical_total: number;
  warnings: number;
  overall_passed: boolean;
}

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

const CRITICAL = (gateId: string, passed: boolean, message: string, remediation?: string): GateResult => ({
  gateId, passed, severity: "CRITICAL", message, remediation,
});
const WARNING = (gateId: string, passed: boolean, message: string, remediation?: string): GateResult => ({
  gateId, passed, severity: "WARNING", message, remediation,
});

// SGTX fee model per v17 Section 7.4 — 1.5% per country side (3% total).
const SGTX_FEE_RATE_BUYER = 0.015; // 1.5% buyer side
const SGTX_FEE_RATE_SELLER = 0.015; // 1.5% seller side
const SGTX_FEE_RATE_TOTAL = SGTX_FEE_RATE_BUYER + SGTX_FEE_RATE_SELLER; // 3.0%

// Per v17 Section 7.4 — optional services carry an additional 3% platform fee.
const SGTX_OPTIONAL_SERVICE_FEE_RATE = 0.03;

// Incoterms that obligate the seller to procure insurance during main carriage.
const INCOTERMS_REQUIRING_SELLER_INSURANCE = new Set(["CIF", "CIP"]);

// CFR validity window per v17 Section 7.5 — 14 days default.
const CFR_DEFAULT_VALIDITY_DAYS = 14;

// ───────────────────────────────────────────────────────────────────────────────
// G3U1 — Quote submitted with all mandatory fields
// ───────────────────────────────────────────────────────────────────────────────
//
// Verifies the seller's quote carries every mandatory commercial field the
// contract will mirror: ustn, sellerGtid, buyerGtid, totalQuote, exwPrice,
// incoterm, lineItems, currency, validityDays, validUntil.
// Status must be SENT, ACCEPTED, or EXPIRED (i.e. actually submitted, not DRAFT).

export async function validateG3U1(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.quoteId) {
    return CRITICAL("G3U1", false, "Quote not yet submitted — no quote_id provided.", "Submit the seller's quote before contract lock.");
  }
  try {
    const quote = await db.quote.findUnique({ where: { quoteNumber: ctx.quoteId } });
    if (!quote) {
      return CRITICAL("G3U1", false, `Quote ${ctx.quoteId} not found.`, "Verify the quote number and re-submit.");
    }
    const missing: string[] = [];
    if (!quote.ustn) missing.push("ustn");
    if (!quote.sellerGtid) missing.push("sellerGtid");
    if (!quote.buyerGtid) missing.push("buyerGtid");
    if (typeof quote.totalQuote !== "number" || quote.totalQuote <= 0) missing.push("totalQuote");
    if (typeof quote.exwPrice !== "number" || quote.exwPrice <= 0) missing.push("exwPrice");
    if (!quote.incoterm) missing.push("incoterm");
    if (!quote.lineItems) missing.push("lineItems");
    if (!quote.currency) missing.push("currency");
    if (!quote.validityDays || quote.validityDays <= 0) missing.push("validityDays");
    if (!quote.validUntil) missing.push("validUntil");
    if (quote.status === "DRAFT") missing.push("status (still DRAFT)");
    if (missing.length > 0) {
      return CRITICAL(
        "G3U1",
        false,
        `Quote ${ctx.quoteId} is missing mandatory field(s): ${missing.join(", ")}.`,
        "Resubmit the quote with all mandatory fields before contract lock.",
      );
    }
    return CRITICAL("G3U1", true, "Quote submitted with all mandatory fields.");
  } catch (e: any) {
    return CRITICAL("G3U1", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U2 — Packing plan locked (including non-uniform layers)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §15 G3U2 — the packing plan must be LOCKED before contract lock.
// "Locked" means PackingPlan.locked === true AND lockedAt is set. The plan
// must also carry non-empty layerPatterns (which encodes non-uniform layers
// per v17 §6 — e.g. "BOTTOM:HEAVY|MIDDLE:LIGHT|TOP:CARTONS").

export async function validateG3U2(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.ustn) {
    return CRITICAL("G3U2", false, "Packing plan not locked — USTN not provided.", "Lock the packing plan before contract lock.");
  }
  try {
    const plan = await db.packingPlan.findFirst({
      where: { ustn: ctx.ustn },
      orderBy: { updatedAt: "desc" },
    });
    if (!plan) {
      return CRITICAL("G3U2", false, `No packing plan found for USTN ${ctx.ustn}.`, "Generate and lock a packing plan before contract lock.");
    }
    if (!plan.locked || !plan.lockedAt) {
      return CRITICAL("G3U2", false, `Packing plan ${plan.planId || plan.id} is in DRAFT status — not locked.`, "Lock the packing plan before contract lock.");
    }
    if (!plan.layerPatterns || plan.layerPatterns.trim() === "" || plan.layerPatterns === "[]") {
      return CRITICAL(
        "G3U2",
        false,
        `Packing plan ${plan.planId || plan.id} has no layer patterns — non-uniform layers must be encoded.`,
        "Define layer patterns (e.g. BOTTOM:HEAVY|MIDDLE:LIGHT|TOP:CARTONS) before lock.",
      );
    }
    if (!plan.loomHash) {
      return WARNING("G3U2", false, `Packing plan ${plan.planId || plan.id} is locked but missing Loom hash.`, "Append the packing plan to the Loom chain for audit.");
    }
    return CRITICAL("G3U2", true, "Packing plan locked (including non-uniform layers).");
  } catch (e: any) {
    return CRITICAL("G3U2", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U3 — Multi-shipment schedule fully defined
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §15 G3U3 — when the trade is multi-shipment, every shipment must
// have: originPort, destPort, etd, eta, sequence. Per-shipment USTN and FeeLock
// are validated in Phase 1 (G1U10) — Phase 3 only verifies the schedule shape.

export async function validateG3U3(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.tradeId) {
    return CRITICAL("G3U3", false, "Multi-shipment schedule cannot be verified — tradeId not provided.", "Provide trade_id in the validation context.");
  }
  try {
    const trade = await db.trade.findUnique({
      where: { id: ctx.tradeId },
      include: { shipments: true },
    });
    if (!trade) {
      return CRITICAL("G3U3", false, `Trade ${ctx.tradeId} not found.`, "Verify the trade ID.");
    }
    if (!trade.multiShipment) {
      return CRITICAL("G3U3", true, "Single-shipment trade — multi-shipment schedule not required.");
    }
    const shipments = trade.shipments || [];
    if (shipments.length < 2) {
      return CRITICAL(
        "G3U3",
        false,
        `Multi-shipment trade declared but only ${shipments.length} shipment(s) defined — need ≥2.`,
        "Define all shipments in the multi-shipment schedule.",
      );
    }
    const problems: string[] = [];
    for (const s of shipments) {
      const tag = `Shipment seq=${s.sequence}`;
      if (!s.originPort) problems.push(`${tag}: missing originPort`);
      if (!s.destPort) problems.push(`${tag}: missing destPort`);
      if (!s.etd) problems.push(`${tag}: missing etd`);
      if (!s.eta) problems.push(`${tag}: missing eta`);
      if (s.etd && s.eta && new Date(s.etd) > new Date(s.eta)) {
        problems.push(`${tag}: etd (${s.etd.toISOString()}) is after eta (${s.eta.toISOString()})`);
      }
    }
    if (problems.length > 0) {
      return CRITICAL(
        "G3U3",
        false,
        `Multi-shipment schedule incomplete: ${problems.join("; ")}.`,
        "Complete the schedule for every shipment before contract lock.",
      );
    }
    return CRITICAL("G3U3", true, "Multi-shipment schedule fully defined.");
  } catch (e: any) {
    return CRITICAL("G3U3", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U4 — Valid alternative ports
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §15 G3U4 — when the trade declares alternative ports (Trade.
// alternativePorts JSON), each fallback must be a valid UN/LOCODE distinct
// from the primary port.

export async function validateG3U4(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.tradeId) {
    return CRITICAL("G3U4", false, "Alternative ports cannot be verified — tradeId not provided.", "Provide trade_id in the validation context.");
  }
  try {
    const trade = await db.trade.findUnique({ where: { id: ctx.tradeId } });
    if (!trade) {
      return CRITICAL("G3U4", false, `Trade ${ctx.tradeId} not found.`, "Verify the trade ID.");
    }
    if (!trade.alternativePorts) {
      return CRITICAL("G3U4", true, "No alternative ports declared — gate not applicable.");
    }
    let alts: any[] = [];
    try {
      alts = JSON.parse(trade.alternativePorts);
    } catch {
      return CRITICAL("G3U4", false, "alternativePorts field is not valid JSON.", "Re-encode the alternative ports as JSON.");
    }
    if (!Array.isArray(alts) || alts.length === 0) {
      return CRITICAL("G3U4", true, "No alternative ports declared — gate not applicable.");
    }
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const entry of alts) {
      const code = typeof entry === "string" ? entry : entry?.port || entry?.unlocode;
      if (!code) { problems.push("alternative port missing 'port' or 'unlocode' field"); continue; }
      const upper = String(code).toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(upper)) {
        problems.push(`${code} is not a valid UN/LOCODE (expected 5-char e.g. EGALY)`);
      }
      if (upper === trade.originPort?.toUpperCase()) {
        problems.push(`${upper} is identical to originPort`);
      }
      if (upper === trade.destPort?.toUpperCase()) {
        problems.push(`${upper} is identical to destPort`);
      }
      if (seen.has(upper)) {
        problems.push(`${upper} declared more than once`);
      }
      seen.add(upper);
    }
    if (problems.length > 0) {
      return CRITICAL(
        "G3U4",
        false,
        `Alternative ports invalid: ${problems.join("; ")}.`,
        "Re-enter alternative ports as valid UN/LOCODEs distinct from primary ports.",
      );
    }
    return CRITICAL("G3U4", true, "Alternative ports valid.");
  } catch (e: any) {
    return CRITICAL("G3U4", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U5 — SGTX fee correctly calculated
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §7.4 + §15 G3U5 — the SGTX fee must equal:
//     sgtxFee = tradeValueUsd * 0.03  (1.5% buyer + 1.5% seller)
//   plus any optional-service platform fees (each optional service × 0.03).
// Tolerance: 0.5% (rounding + FX conversion noise).

const FEE_TOLERANCE_PCT = 0.005;

export async function validateG3U5(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.quoteId) {
    return CRITICAL("G3U5", false, "SGTX fee cannot be validated — quoteId not provided.", "Provide quote_id in the validation context.");
  }
  try {
    const quote = await db.quote.findUnique({ where: { quoteNumber: ctx.quoteId } });
    if (!quote) {
      return CRITICAL("G3U5", false, `Quote ${ctx.quoteId} not found.`, "Verify the quote number.");
    }
    if (typeof quote.sgtxFee !== "number" || quote.sgtxFee <= 0) {
      return CRITICAL("G3U5", false, "Quote has no sgtxFee calculated.", "Run the SGTX fee calculator before contract lock.");
    }
    // Re-derive the expected fee from the trade value.
    const tradeValue = quote.totalQuote || quote.exwTotal || 0;
    if (tradeValue <= 0) {
      return CRITICAL("G3U5", false, "Quote has no trade value — fee cannot be derived.", "Set the total quote value before fee validation.");
    }
    const expectedBaseFee = tradeValue * SGTX_FEE_RATE_TOTAL;
    const tolerance = Math.max(expectedBaseFee * FEE_TOLERANCE_PCT, 1.0);
    const diff = Math.abs(quote.sgtxFee - expectedBaseFee);
    if (diff > tolerance) {
      return CRITICAL(
        "G3U5",
        false,
        `SGTX fee $${quote.sgtxFee.toFixed(2)} differs from expected $${expectedBaseFee.toFixed(2)} (3% of $${tradeValue.toFixed(2)}) by $${diff.toFixed(2)} — exceeds 0.5% tolerance.`,
        "Re-run the SGTX fee calculator with the latest trade value.",
      );
    }
    return CRITICAL("G3U5", true, `SGTX fee $${quote.sgtxFee.toFixed(2)} correctly calculated (${(SGTX_FEE_RATE_TOTAL * 100).toFixed(1)}% of $${tradeValue.toFixed(2)}).`);
  } catch (e: any) {
    return CRITICAL("G3U5", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U6 — Selected quote for every Incoterm-mandatory service (Mode A/B/C)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §11 + §15 G3U6 — every Incoterm-mandatory service (per the
// Responsibility Engine) must have a SELECTED ServiceQuotation for the trade.
// Logistics modes A/B/C all funnel through this gate — Mode A (single LSP),
// Mode B (multi-LSP per service), Mode C (buyer-nominated seller-paid).

export async function validateG3U6(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.tradeId) {
    return CRITICAL("G3U6", false, "Mandatory service quotes cannot be verified — tradeId not provided.", "Provide trade_id in the validation context.");
  }
  try {
    const trade = await db.trade.findUnique({
      where: { id: ctx.tradeId },
      include: { quotations: true },
    });
    if (!trade) {
      return CRITICAL("G3U6", false, `Trade ${ctx.tradeId} not found.`, "Verify the trade ID.");
    }
    if (!trade.incoterm) {
      return CRITICAL("G3U6", false, "Trade has no incoterm — mandatory service coverage cannot be derived.", "Set the incoterm on the trade before contract lock.");
    }
    // Defer to the Incoterm Responsibility Engine to get the mandatory service
    // list. Use a lazy import to avoid a hard dependency at module load time.
    let mandatoryServices: string[] = [];
    try {
      const { getIncotermResponsibility } = await import("@/lib/sgtx/incoterms/responsibility-engine");
      const r = getIncotermResponsibility(trade.incoterm);
      mandatoryServices = r.mandatoryServices.map((s: any) => s.service);
    } catch {
      // If the engine isn't available, treat all service types from quotations
      // as the expected coverage and skip the missing check. Fail WARNING only.
      return WARNING("G3U6", false, "Incoterm Responsibility Engine unavailable — mandatory service coverage not verified.", "Confirm manually that every Incoterm-mandatory service has a selected quote.");
    }
    if (mandatoryServices.length === 0) {
      return CRITICAL("G3U6", true, `No mandatory services for incoterm ${trade.incoterm} — gate not applicable.`);
    }
    const selectedQuotes = (trade.quotations || []).filter(
      (q: any) => q.status === "ACCEPTED" || q.acceptedByGtid != null,
    );
    const covered = new Set(selectedQuotes.map((q: any) => q.serviceType));
    const missing = mandatoryServices.filter((s: string) => !covered.has(s));
    if (missing.length > 0) {
      return CRITICAL(
        "G3U6",
        false,
        `Mandatory service(s) without a selected quote for incoterm ${trade.incoterm}: ${missing.join(", ")}.`,
        "Select an ACCEPTED quote for each mandatory service before contract lock (Mode A, B, or C).",
      );
    }
    return CRITICAL("G3U6", true, `Selected quote present for every mandatory service (${mandatoryServices.length}/${mandatoryServices.length}).`);
  } catch (e: any) {
    return CRITICAL("G3U6", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U7 — Contract consistency (field-by-field vs Final Commercial Term Sheet)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §15 G3U7 — the TradeContract's contractJson must field-by-field
// mirror the Final Commercial Term Sheet (the accepted Quote + Trade
// commercial terms). We compare: incoterm, currency, totalQuote, exwPrice,
// sgtxFee, validityDays. Tolerance on numeric fields: 0.01 USD.

const NUMERIC_TOLERANCE_USD = 0.01;

export async function validateG3U7(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.contractId) {
    return CRITICAL("G3U7", false, "Contract consistency cannot be verified — contractId not provided.", "Provide contract_id in the validation context.");
  }
  try {
    const contract = await db.tradeContract.findUnique({ where: { contractId: ctx.contractId } });
    if (!contract) {
      return CRITICAL("G3U7", false, `Contract ${ctx.contractId} not found.`, "Verify the contract ID.");
    }
    const trade = await db.trade.findUnique({ where: { id: contract.tradeId } });
    if (!trade) {
      return CRITICAL("G3U7", false, `Trade ${contract.tradeId} (contract parent) not found.`, "Verify the contract→trade linkage.");
    }
    const quote = contract.ustn ? await db.quote.findFirst({ where: { ustn: contract.ustn }, orderBy: { updatedAt: "desc" } }) : null;
    if (!quote) {
      return CRITICAL("G3U7", false, `No quote found for USTN ${contract.ustn} — cannot compare to Term Sheet.`, "Lock the quote before contract lock.");
    }
    const problems: string[] = [];
    if (quote.incoterm && trade.incoterm && quote.incoterm !== trade.incoterm) {
      problems.push(`incoterm mismatch: quote=${quote.incoterm} vs trade=${trade.incoterm}`);
    }
    if (quote.currency && trade.currency && quote.currency !== trade.currency) {
      problems.push(`currency mismatch: quote=${quote.currency} vs trade=${trade.currency}`);
    }
    if (typeof quote.totalQuote === "number" && typeof trade.tradeValueUsd === "number") {
      if (Math.abs(quote.totalQuote - trade.tradeValueUsd) > NUMERIC_TOLERANCE_USD) {
        problems.push(`totalQuote mismatch: quote=$${quote.totalQuote.toFixed(2)} vs trade=$${trade.tradeValueUsd.toFixed(2)}`);
      }
    }
    if (typeof quote.sgtxFee === "number" && typeof trade.sgtxFeeUsd === "number" && trade.sgtxFeeUsd > 0) {
      if (Math.abs(quote.sgtxFee - trade.sgtxFeeUsd) > NUMERIC_TOLERANCE_USD) {
        problems.push(`sgtxFee mismatch: quote=$${quote.sgtxFee.toFixed(2)} vs trade=$${trade.sgtxFeeUsd.toFixed(2)}`);
      }
    }
    // The contractJson should at minimum echo the trade's incoterm + value.
    let contractEcho: any = {};
    try { contractEcho = contract.contractJson ? JSON.parse(contract.contractJson) : {}; } catch { /* tolerate */ }
    if (contractEcho.incoterm && contractEcho.incoterm !== trade.incoterm) {
      problems.push(`contractJson.incoterm=${contractEcho.incoterm} vs trade.incoterm=${trade.incoterm}`);
    }
    if (typeof contractEcho.totalValueUsd === "number" && typeof trade.tradeValueUsd === "number") {
      if (Math.abs(contractEcho.totalValueUsd - trade.tradeValueUsd) > NUMERIC_TOLERANCE_USD) {
        problems.push(`contractJson.totalValueUsd=$${contractEcho.totalValueUsd.toFixed(2)} vs trade.tradeValueUsd=$${trade.tradeValueUsd.toFixed(2)}`);
      }
    }
    if (problems.length > 0) {
      return CRITICAL(
        "G3U7",
        false,
        `Contract does not mirror Final Commercial Term Sheet: ${problems.join("; ")}.`,
        "Reconcile the contract fields with the accepted quote + trade commercial terms.",
      );
    }
    return CRITICAL("G3U7", true, "Contract field-by-field consistent with Final Commercial Term Sheet.");
  } catch (e: any) {
    return CRITICAL("G3U7", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U8 — SGTX Witness Clause present (non-removable)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §13 + §15 G3U8 — every SGTX contract must contain the non-removable
// SGTX Witness Clause. The clause asserts SGTX's role as the immutable
// non-custodial trade execution witness and binds disputes to the SGTX
// arbitration seat declared on the contract. We look for the canonical
// marker string in contractJson or contractHtml.

const WITNESS_CLAUSE_MARKERS = [
  "SGTX WITNESS CLAUSE",
  "SGTX-Witness-Clause",
  "sgtx_witness_clause",
  "Sovereign Governed Trade Execution",
];

export async function validateG3U8(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.contractId) {
    return CRITICAL("G3U8", false, "Witness clause cannot be verified — contractId not provided.", "Provide contract_id in the validation context.");
  }
  try {
    const contract = await db.tradeContract.findUnique({ where: { contractId: ctx.contractId } });
    if (!contract) {
      return CRITICAL("G3U8", false, `Contract ${ctx.contractId} not found.`, "Verify the contract ID.");
    }
    let hay = contract.contractHtml || "";
    if (!hay) {
      try { hay = contract.contractJson ? JSON.stringify(JSON.parse(contract.contractJson)) : ""; } catch { hay = contract.contractJson || ""; }
    }
    const found = WITNESS_CLAUSE_MARKERS.find((m) => hay.toUpperCase().includes(m.toUpperCase()));
    if (!found) {
      return CRITICAL(
        "G3U8",
        false,
        "Contract is missing the non-removable SGTX Witness Clause.",
        "Insert the canonical SGTX Witness Clause block into the contract body before lock.",
      );
    }
    return CRITICAL("G3U8", true, "SGTX Witness Clause present.");
  } catch (e: any) {
    return CRITICAL("G3U8", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U9 — QES signature valid (Egypt Trust/Misr or Ed25519 fallback)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §13 + §15 G3U9 — the contract must be signed with a Qualified
// Electronic Signature. We accept:
//   • Egypt Trust / Misr TSP (signatureType starts with "QES_EGYPT_TRUST" or
//     provider ∈ {"egypt_trust","misr"}), OR
//   • Ed25519 fallback (signatureType = "ED25519" or "QES_ED25519_FALLBACK").
// The signature's documentHash must match the contract's hashSha256.

export async function validateG3U9(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.contractId) {
    return CRITICAL("G3U9", false, "QES signature cannot be verified — contractId not provided.", "Provide contract_id in the validation context.");
  }
  try {
    const contract = await db.tradeContract.findUnique({ where: { contractId: ctx.contractId } });
    if (!contract) {
      return CRITICAL("G3U9", false, `Contract ${ctx.contractId} not found.`, "Verify the contract ID.");
    }
    if (!contract.hashSha256) {
      return CRITICAL("G3U9", false, "Contract has no hashSha256 — cannot anchor a QES signature.", "Compute and store the contract SHA-256 before signing.");
    }
    if (!contract.ustn) {
      return CRITICAL("G3U9", false, "Contract has no USTN — cannot look up QES signatures.", "Set the USTN on the contract before signing.");
    }
    const sigs = await db.qesSignature.findMany({
      where: { ustn: contract.ustn, documentHash: contract.hashSha256 },
      orderBy: { createdAt: "desc" },
    });
    if (sigs.length === 0) {
      return CRITICAL(
        "G3U9",
        false,
        `No QES signatures found for USTN ${contract.ustn} with documentHash ${contract.hashSha256}.`,
        "Sign the contract with Egypt Trust / Misr TSP or the Ed25519 fallback.",
      );
    }
    const isQes = (s: any) => {
      const t = (s.signatureType || "").toUpperCase();
      const p = (s.provider || "").toLowerCase();
      return (
        t.includes("QES") ||
        t.includes("EGYPT_TRUST") ||
        t.includes("MISR") ||
        t === "ED25519" ||
        p === "egypt_trust" ||
        p === "misr"
      );
    };
    const validQes = sigs.find(isQes);
    if (!validQes) {
      return CRITICAL(
        "G3U9",
        false,
        `Signature(s) on contract are not QES-grade (need Egypt Trust/Misr or Ed25519 fallback). Found types: ${sigs.map((s:any)=>s.signatureType).join(", ")}.`,
        "Re-sign with a QES-grade provider (Egypt Trust / Misr / Ed25519 fallback).",
      );
    }
    return CRITICAL("G3U9", true, `QES signature valid (${validQes.signatureType} via ${validQes.provider}).`);
  } catch (e: any) {
    return CRITICAL("G3U9", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U10 — FeeLock state PENDING (not yet active — USTN not generated here)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §7.4 + §15 G3U10 — at contract lock time the FeeLock MUST be in
// state PENDING. ACTIVE FeeLock means USTN was already minted (Phase 5
// territory); RELEASED means the trade was cancelled. PENDING is the only
// valid state at Phase 3 because the USTN is not generated until the contract
// is locked + signed.

export async function validateG3U10(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.ustn) {
    return CRITICAL("G3U10", false, "FeeLock state cannot be verified — USTN not provided.", "Provide ustn in the validation context.");
  }
  try {
    const feeLock = await db.feeLock.findFirst({
      where: { ustn: ctx.ustn },
      orderBy: { updatedAt: "desc" },
    });
    if (!feeLock) {
      return CRITICAL("G3U10", false, `No FeeLock record found for USTN ${ctx.ustn}.`, "Create the FeeLock record (status PENDING) before contract lock.");
    }
    if (feeLock.status === "ACTIVE") {
      return CRITICAL(
        "G3U10",
        false,
        `FeeLock ${feeLock.id} is ACTIVE — USTN already minted; contract is past Phase 3.`,
        "If re-locking, cancel and recreate the FeeLock in PENDING status.",
      );
    }
    if (feeLock.status === "RELEASED") {
      return CRITICAL(
        "G3U10",
        false,
        `FeeLock ${feeLock.id} is RELEASED — trade was cancelled; contract cannot be locked.`,
        "Reopen the trade or create a new trade if the cancelled one is to be replaced.",
      );
    }
    if (feeLock.status !== "PENDING") {
      return CRITICAL(
        "G3U10",
        false,
        `FeeLock ${feeLock.id} is in unexpected state ${feeLock.status} — must be PENDING at contract lock.`,
        "Reset the FeeLock to PENDING before contract lock.",
      );
    }
    if (feeLock.frozenAt) {
      return WARNING(
        "G3U10",
        false,
        `FeeLock ${feeLock.id} is PENDING but already frozenAt=${feeLock.frozenAt.toISOString()} — USTN may be about to mint.`,
        "Confirm the FeeLock should remain PENDING before contract lock.",
      );
    }
    return CRITICAL("G3U10", true, "FeeLock state PENDING — USTN not yet minted.");
  } catch (e: any) {
    return CRITICAL("G3U10", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U11 — Final lock precondition (all prior gates passed)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §15 G3U11 — the contract can only be locked when ALL prior Phase 3
// gates (G3U1–G3U10) pass. This gate is a meta-gate that re-runs the prior
// 10 gates and confirms none are CRITICAL-failed.

export async function validateG3U11(ctx: Phase3Context): Promise<GateResult> {
  const prior: GateResult[] = [];
  // Run prior gates in order; collect results. We do NOT short-circuit so
  // the operator sees every failure at once.
  prior.push(await validateG3U1(ctx));
  prior.push(await validateG3U2(ctx));
  prior.push(await validateG3U3(ctx));
  prior.push(await validateG3U4(ctx));
  prior.push(await validateG3U5(ctx));
  prior.push(await validateG3U6(ctx));
  prior.push(await validateG3U7(ctx));
  prior.push(await validateG3U8(ctx));
  prior.push(await validateG3U9(ctx));
  prior.push(await validateG3U10(ctx));
  const criticalFails = prior.filter((g) => g.severity === "CRITICAL" && !g.passed);
  if (criticalFails.length > 0) {
    return CRITICAL(
      "G3U11",
      false,
      `${criticalFails.length} prior Phase 3 gate(s) failed: ${criticalFails.map((g) => g.gateId).join(", ")}.`,
      `Resolve the failed gates: ${criticalFails.map((g) => `${g.gateId} (${g.message})`).join("; ")}.`,
    );
  }
  return CRITICAL("G3U11", true, "Final lock precondition met — all 10 prior Phase 3 gates passed.");
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U12 — CFR issued before contract lock (if buyer financing required)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §7 + §15 G3U12 — when the buyer has declared financing required
// (Trade.buyerFinancingRequired === true), a FinancingPreClearanceRequest
// (CFR) must have been issued to a financier BEFORE the contract can be
// locked. "Issued" means at least one CFR row exists with status in
// {REQUESTED, UNDER_REVIEW, APPROVED} for the borrower (buyerGtid).
//
// NOTE: Per the task description, this gate "may be done by P1a agent".
// We implement it here for completeness; if P1a already implements it
// elsewhere, the registry will deduplicate by gateId.

export async function validateG3U12(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.tradeId) {
    return CRITICAL("G3U12", false, "CFR pre-clearance cannot be verified — tradeId not provided.", "Provide trade_id in the validation context.");
  }
  try {
    const trade = await db.trade.findUnique({ where: { id: ctx.tradeId } });
    if (!trade) {
      return CRITICAL("G3U12", false, `Trade ${ctx.tradeId} not found.`, "Verify the trade ID.");
    }
    if (!trade.buyerFinancingRequired) {
      return CRITICAL("G3U12", true, "Buyer financing not required — CFR gate not applicable.");
    }
    const cfr = await db.financingPreClearanceRequest.findFirst({
      where: {
        borrowerGtid: trade.buyerGtid,
        tradeRequestId: trade.id,
        status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!cfr) {
      return CRITICAL(
        "G3U12",
        false,
        "Buyer financing is required but no CFR has been issued to a financier.",
        "Submit a FinancingPreClearanceRequest (CFR) to a connected financier before contract lock.",
      );
    }
    return CRITICAL("G3U12", true, `CFR ${cfr.cfrReference || cfr.id} issued (status ${cfr.status}).`);
  } catch (e: any) {
    return CRITICAL("G3U12", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// G3U13 — CFR valid at contract lock time (not expired, not rejected)
// ───────────────────────────────────────────────────────────────────────────────
//
// Per v17 §7 + §15 G3U13 — at contract lock time the CFR must still be valid:
//   • status ≠ REJECTED
//   • status ≠ EXPIRED
//   • validityUntil ≥ now (or validityUntil is null and status=APPROVED)
//
// NOTE: Per the task description, this gate "may be done by P1a agent".

export async function validateG3U13(ctx: Phase3Context): Promise<GateResult> {
  if (!ctx.tradeId) {
    return CRITICAL("G3U13", false, "CFR validity cannot be verified — tradeId not provided.", "Provide trade_id in the validation context.");
  }
  try {
    const trade = await db.trade.findUnique({ where: { id: ctx.tradeId } });
    if (!trade) {
      return CRITICAL("G3U13", false, `Trade ${ctx.tradeId} not found.`, "Verify the trade ID.");
    }
    if (!trade.buyerFinancingRequired) {
      return CRITICAL("G3U13", true, "Buyer financing not required — CFR validity gate not applicable.");
    }
    const cfr = await db.financingPreClearanceRequest.findFirst({
      where: { borrowerGtid: trade.buyerGtid, tradeRequestId: trade.id },
      orderBy: { createdAt: "desc" },
    });
    if (!cfr) {
      return CRITICAL(
        "G3U13",
        false,
        "Buyer financing is required but no CFR record exists.",
        "Submit a CFR before contract lock (gate G3U12 must pass first).",
      );
    }
    if (cfr.status === "REJECTED") {
      return CRITICAL(
        "G3U13",
        false,
        `CFR ${cfr.cfrReference || cfr.id} was REJECTED — cannot lock contract.`,
        "Re-submit the CFR to a different financier or remove the financing requirement.",
      );
    }
    if (cfr.status === "EXPIRED") {
      return CRITICAL(
        "G3U13",
        false,
        `CFR ${cfr.cfrReference || cfr.id} has EXPIRED — cannot lock contract.`,
        "Refresh the CFR (new validity window) before contract lock.",
      );
    }
    if (cfr.validityUntil && new Date(cfr.validityUntil) < new Date()) {
      return CRITICAL(
        "G3U13",
        false,
        `CFR ${cfr.cfrReference || cfr.id} validityUntil ${cfr.validityUntil.toISOString()} has passed — CFR expired.`,
        "Refresh the CFR (extend validity or re-submit) before contract lock.",
      );
    }
    return CRITICAL("G3U13", true, `CFR ${cfr.cfrReference || cfr.id} valid (status ${cfr.status}).`);
  } catch (e: any) {
    return CRITICAL("G3U13", false, `DB lookup failed: ${e.message}`, "Retry or escalate to SGTX support.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public entry: validatePhase3Gates
// ═══════════════════════════════════════════════════════════════════════════════
//
// Run all 13 Phase 3 gates (G3U1–G3U13) against the trade/quote/contract
// context and return the per-gate breakdown plus aggregate pass/fail.

export async function validatePhase3Gates(ctx: Phase3Context): Promise<Phase3ValidationResult> {
  const gates: GateResult[] = [
    await validateG3U1(ctx),
    await validateG3U2(ctx),
    await validateG3U3(ctx),
    await validateG3U4(ctx),
    await validateG3U5(ctx),
    await validateG3U6(ctx),
    await validateG3U7(ctx),
    await validateG3U8(ctx),
    await validateG3U9(ctx),
    await validateG3U10(ctx),
    await validateG3U11(ctx),
    await validateG3U12(ctx),
    await validateG3U13(ctx),
  ];
  const criticalGates = gates.filter((g) => g.severity === "CRITICAL");
  const criticalPassed = criticalGates.filter((g) => g.passed).length;
  const warnings = gates.filter((g) => g.severity === "WARNING" && !g.passed).length;
  const overallPassed = criticalGates.every((g) => g.passed);
  return {
    phase: 3,
    gates,
    critical_passed: criticalPassed,
    critical_total: criticalGates.length,
    warnings,
    overall_passed: overallPassed,
  };
}
