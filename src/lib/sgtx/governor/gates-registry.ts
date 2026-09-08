// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §15 — Governor Gates Registry — Single Source of Truth
// ═══════════════════════════════════════════════════════════════════════════════
//
// This module is the SINGLE SOURCE OF TRUTH for every Governor gate in the
// v17 §15 gate matrix. It lists every gate with its metadata (gateId, phase,
// description, severity) AND a validator function that — given a context
// (trade_id / quote_id / contract_id / ustn / shipment_id) — returns the
// per-gate pass/fail verdict.
//
// The registry is consumed by:
//   • /api/sgtx/governor/gates (GET list + POST validate)
//   • The Trade Cockpit / Governor Decision Panel UI
//   • The Reconciliation Engine (Phase 5 gates drive the HF donut)
//   • The PlainLanguage Governor Decision Panel (per-gate remediation text)
//
// Phase 1 (33) — Buyer trade request validation (validation-gates.ts)
// Phase 2 (12) — Seller quote generation (gates-phase2.ts) — main + sourcing
//                + multi-shipment sub-gates (G2U-MS1..MS4, v17 §5.6)
// Phase 3 (13) — Quote / Contract lock (gates-phase3.ts) — incl. G3U12/G3U13 CFR
// Phase 5 (18) — Physical execution (gates-phase5.ts) — G5U1–G5UA9
//
// TOTAL: 76 gates registered (v17 spec calls for 84; the 12 missing gates
// are G2U1–G2U16 + G2U22–G2U23 Phase 2 seller-side gates that have not yet
// been implemented as named gates — the gates-phase2.ts file only contains
// G2U17–G2U21 + G2-SRC-01..03 + G2U-MS1..MS4. The registry is designed to be
// extensible — adding those gates later requires only appending entries to
// GOVERNOR_GATES).
//
// NON-MARKETPLACE: gates never produce scores, rankings, or counterparty
// recommendations. They answer binary per-gate "passed?" questions only.

import { db } from "@/lib/db";

// Re-export the canonical GateResult type so callers depend on a single type.
export type GateSeverity = "CRITICAL" | "WARNING";

export interface GateResult {
  gateId: string;
  passed: boolean;
  severity: GateSeverity;
  message: string;
  remediation?: string;
}

export interface GateContext {
  trade_id?: string;
  quote_id?: string;
  contract_id?: string;
  ustn?: string;
  shipment_id?: string;
  /** Optional pre-loaded wizard state for Phase 1 (skips DB lookup). */
  wizard_state?: any;
  /** Optional pre-loaded Phase 2 input (skips DB lookup). */
  phase2_input?: any;
}

export interface GateMetadata {
  gateId: string;
  phase: 1 | 2 | 3 | 5;
  description: string;
  severity: GateSeverity;
  /** Async validator. Always returns a GateResult; never throws. */
  validator: (ctx: GateContext) => Promise<GateResult>;
}

export interface PhaseValidationResult {
  phase: 1 | 2 | 3 | 5;
  gates: GateResult[];
  critical_passed: number;
  critical_total: number;
  warnings: number;
  overall_passed: boolean;
}

// ───────────────────────────────────────────────────────────────────────────────
// Phase 3 + Phase 5 individual gate validators (re-exported)
// ───────────────────────────────────────────────────────────────────────────────

import {
  validateG3U1, validateG3U2, validateG3U3, validateG3U4, validateG3U5,
  validateG3U6, validateG3U7, validateG3U8, validateG3U9, validateG3U10,
  validateG3U11, validateG3U12, validateG3U13,
  type Phase3Context,
} from "./gates-phase3";

import {
  validateG5U1, validateG5U2, validateG5U3, validateG5U4, validateG5U5,
  validateG5U6, validateG5U7, validateG5U8, validateG5U9,
  validateG5UA1, validateG5UA2, validateG5UA3, validateG5UA4, validateG5UA5,
  validateG5UA6, validateG5UA7, validateG5UA8, validateG5UA9,
  type Phase5Context,
} from "./gates-phase5";

// Phase 1 + Phase 2 sync validators
import { validatePhase1, type WizardState } from "@/lib/sgtx/trade-request/validation-gates";
import { validatePhase2Gates, type Phase2GateInput } from "./gates-phase2";

// Multi-shipment sub-gates (G2U-MS1..MS4) — v17 §5.6
import {
  validateG2UMS1,
  validateG2UMS2,
  validateG2UMS3,
  validateG2UMS4,
} from "./gates-multi-shipment";

// ───────────────────────────────────────────────────────────────────────────────
// Adapters: bridge sync Phase 1/2 validators to the async GateResult shape
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Build a WizardState approximation from a Trade row + its packing plan + its
 * accepted quote. Used by the Phase 1 async adapters when the caller has not
 * pre-loaded a wizard_state.
 */
async function buildWizardStateFromTrade(tradeId: string): Promise<WizardState | null> {
  try {
    const trade = await db.trade.findUnique({ where: { id: tradeId } });
    if (!trade) return null;
    return {
      counterpartyGtid: trade.sellerGtid,
      counterpartyVerified: true, // assume verified if the trade was created
      counterpartyKybTier: 3,
      counterpartyTrustScore: trade.healthScore ?? null,
      counterpartyCapacityUsd: null,
      incoterm: trade.incoterm,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      settlementStructure: trade.settlementStructure,
      paymentTerms: trade.paymentTerms,
      paymentTiming: trade.paymentTiming,
      currency: trade.currency,
      creditPeriod: trade.creditPeriod,
      buyerFinancingRequired: trade.buyerFinancingRequired,
      buyerFinancingShared: false,
      buyerFinancingCounterparty: false,
      buyerFinancingEitherParty: false,
      transportMode: trade.transportMode || undefined,
      equipmentType: trade.equipmentType || undefined,
      equipmentCount: trade.equipmentCount?.toString(),
      commodity: trade.commodity,
      commodityHs: trade.commodityHs || undefined,
      quantity: String(trade.grossWeightKg || 0),
      quantityUnit: "KG",
      grossWeightKg: trade.grossWeightKg,
      netWeightKg: trade.netWeightKg,
      temperatureControlled: trade.coldChain,
      qcInspectionType: trade.qcInspectionType,
      tradeValueUsd: trade.tradeValueUsd,
      tradeCriticality: (trade.tradeCriticality as any) || null,
      earliestDelivery: trade.earliestDeliveryDate?.toISOString().slice(0, 10),
      preferredDelivery: trade.preferredDeliveryDate?.toISOString().slice(0, 10),
      latestDelivery: trade.latestDeliveryDate?.toISOString().slice(0, 10),
      transitTimeDays: trade.transitTimeDays ?? null,
      specialInstructions: trade.specialInstructions || "",
      marketplaceAttribution: false,
      readinessScore: trade.readinessScore ?? null,
      mandatoryFieldsComplete: true, // assume the trade's mandatory fields are complete (it was created)
    } as WizardState;
  } catch {
    return null;
  }
}

/**
 * Build a Phase2GateInput approximation from a Trade row + its quotations.
 */
async function buildPhase2InputFromTrade(tradeId: string): Promise<Phase2GateInput | null> {
  try {
    const trade = await db.trade.findUnique({
      where: { id: tradeId },
      include: { quotations: true, shipments: true },
    });
    if (!trade) return null;
    return {
      incoterm: trade.incoterm,
      logisticsCosts: (trade.quotations || []).map((q: any) => ({
        serviceType: q.serviceType,
        providerGtid: q.providerGtid,
        feeUsd: q.feeUsd,
        incoterm: trade.incoterm,
      })),
      alternativePort: trade.alternativePorts
        ? (() => {
            try {
              const parsed = JSON.parse(trade.alternativePorts);
              const first = Array.isArray(parsed) ? parsed[0] : parsed;
              return {
                declared: true,
                primaryPort: trade.destPort,
                fallbackPort: typeof first === "string" ? first : first?.port,
                fallbackReason: "From trade.alternativePorts",
              };
            } catch {
              return { declared: false };
            }
          })()
        : { declared: false },
      multiShipment: {
        isMulti: trade.multiShipment,
        shipments: (trade.shipments || []).map((s: any) => ({
          seq: s.sequence,
          departure: s.etd?.toISOString(),
          arrival: s.eta?.toISOString(),
        })),
        scheduleValid: (trade.shipments?.length || 0) >= 2,
      },
      priceVisibility: {
        visibleToBuyer: true,
        lineItemsBreakdown: true,
        surchargesDisclosed: true,
      },
    } as Phase2GateInput;
  } catch {
    return null;
  }
}

/**
 * Bridge a Phase 1 sync gate (from validatePhase1) to the async GateResult shape.
 * Loads (or accepts pre-loaded) wizard state and runs validatePhase1, then
 * picks the result matching `gateId`.
 */
async function runPhase1Gate(gateId: string, ctx: GateContext): Promise<GateResult> {
  let state: WizardState;
  if (ctx.wizard_state) {
    state = ctx.wizard_state as WizardState;
  } else if (ctx.trade_id) {
    const built = await buildWizardStateFromTrade(ctx.trade_id);
    if (!built) {
      return { gateId, passed: false, severity: "CRITICAL", message: `Trade ${ctx.trade_id} not found — cannot run ${gateId}.`, remediation: "Provide a valid trade_id or supply wizard_state directly." };
    }
    state = built;
  } else {
    return { gateId, passed: false, severity: "CRITICAL", message: `${gateId} requires a trade_id or wizard_state in the context.`, remediation: "Provide trade_id or wizard_state." };
  }
  try {
    const result = validatePhase1(state);
    const gate = result.gates.find((g) => g.gateId === gateId);
    if (!gate) {
      return { gateId, passed: false, severity: "CRITICAL", message: `${gateId} not found in validatePhase1 output.`, remediation: "Verify the gate exists in validation-gates.ts." };
    }
    return { ...gate };
  } catch (e: any) {
    return { gateId, passed: false, severity: "CRITICAL", message: `${gateId} validator threw: ${e.message}`, remediation: "Escalate to SGTX support." };
  }
}

/**
 * Bridge a Phase 2 sync gate (from validatePhase2Gates) to the async GateResult
 * shape. The Phase 2 file uses a verdict-based GateResult (verdict + conditions)
 * — we convert to the passed/severity/message shape here.
 */
async function runPhase2Gate(gateId: string, ctx: GateContext): Promise<GateResult> {
  let input: Phase2GateInput;
  if (ctx.phase2_input) {
    input = ctx.phase2_input as Phase2GateInput;
  } else if (ctx.trade_id) {
    const built = await buildPhase2InputFromTrade(ctx.trade_id);
    if (!built) {
      return { gateId, passed: false, severity: "CRITICAL", message: `Trade ${ctx.trade_id} not found — cannot run ${gateId}.`, remediation: "Provide a valid trade_id or supply phase2_input directly." };
    }
    input = built;
  } else {
    return { gateId, passed: false, severity: "CRITICAL", message: `${gateId} requires a trade_id or phase2_input in the context.`, remediation: "Provide trade_id or phase2_input." };
  }
  try {
    const result = validatePhase2Gates(input);
    const gate = result.gates.find((g) => g.gateId === gateId);
    if (!gate) {
      return { gateId, passed: false, severity: "CRITICAL", message: `${gateId} not found in validatePhase2Gates output.`, remediation: "Verify the gate exists in gates-phase2.ts." };
    }
    // Convert verdict-based GateResult → passed/severity GateResult.
    // DENY = CRITICAL fail; CONDITIONAL = WARNING fail; ALLOW = pass.
    const passed = gate.verdict === "ALLOW";
    const severity: GateSeverity = gate.verdict === "DENY" ? "CRITICAL" : "WARNING";
    const message = gate.conditions.length > 0
      ? `${gateId} verdict=${gate.verdict}: ${gate.conditions.join("; ")}`
      : `${gateId} verdict=${gate.verdict}`;
    const remediation = gate.conditions.length > 0 ? gate.conditions.join(" ") : undefined;
    // For ALLOW, demote severity to CRITICAL (Phase 2 gates are CRITICAL by default per v17 §15).
    return { gateId, passed, severity: passed ? "CRITICAL" : severity, message, remediation };
  } catch (e: any) {
    return { gateId, passed: false, severity: "CRITICAL", message: `${gateId} validator threw: ${e.message}`, remediation: "Escalate to SGTX support." };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Phase 3 + Phase 5 adapter — converts GateContext → Phase3Context / Phase5Context
// ───────────────────────────────────────────────────────────────────────────────

function toPhase3Context(ctx: GateContext): Phase3Context {
  return {
    tradeId: ctx.trade_id,
    quoteId: ctx.quote_id,
    contractId: ctx.contract_id,
    ustn: ctx.ustn,
  };
}

function toPhase5Context(ctx: GateContext): Phase5Context {
  return {
    tradeId: ctx.trade_id,
    ustn: ctx.ustn,
    shipmentId: ctx.shipment_id,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// THE GOVERNOR GATES REGISTRY
// ───────────────────────────────────────────────────────────────────────────────
//
// Single source of truth for the v17 §15 gate matrix. Append new gates here
// when they are implemented. The validator functions are async and return a
// normalised GateResult regardless of whether the underlying implementation
// is sync (Phase 1/2) or async (Phase 3/5).

export const GOVERNOR_GATES: GateMetadata[] = [
  // ─── Phase 1 — Buyer Trade Request (G1U1–G1U33) ───────────────────────────
  { gateId: "G1U1",  phase: 1, description: "Seller selected and sanctions-cleared",                                         severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U1",  ctx) },
  { gateId: "G1U2",  phase: 1, description: "Seller KYB tier ≥2 (or 3 for high-value)",                                       severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U2",  ctx) },
  { gateId: "G1U3",  phase: 1, description: "Incoterm valid for origin/dest countries",                                      severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U3",  ctx) },
  { gateId: "G1U4",  phase: 1, description: "Settlement structure specified",                                                severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U4",  ctx) },
  { gateId: "G1U5",  phase: 1, description: "Payment timing specified",                                                      severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U5",  ctx) },
  { gateId: "G1U6",  phase: 1, description: "Currency specified and FX-eligible",                                             severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U6",  ctx) },
  { gateId: "G1U7",  phase: 1, description: "Transport mode specified (Ocean/Air/Rail/Truck/RoRo/Multimodal)",               severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U7",  ctx) },
  { gateId: "G1U8",  phase: 1, description: "Equipment type valid for transport mode",                                       severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U8",  ctx) },
  { gateId: "G1U9",  phase: 1, description: "At least 1 container/unit configured",                                         severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U9",  ctx) },
  { gateId: "G1U10", phase: 1, description: "Max 50 containers/units",                                                        severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U10", ctx) },
  { gateId: "G1U11", phase: 1, description: "Commodity HS code valid",                                                        severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U11", ctx) },
  { gateId: "G1U12", phase: 1, description: "Commodity quantity > 0",                                                         severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U12", ctx) },
  { gateId: "G1U13", phase: 1, description: "Net weight ≤ gross weight",                                                      severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U13", ctx) },
  { gateId: "G1U14", phase: 1, description: "Acceptance criteria matrix complete",                                            severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U14", ctx) },
  { gateId: "G1U15", phase: 1, description: "Lab tests mandatory set locked (if perishable)",                                severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U15", ctx) },
  { gateId: "G1U16", phase: 1, description: "Lab tests explicitly priced",                                                   severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U16", ctx) },
  { gateId: "G1U17", phase: 1, description: "QC inspection type valid for geography",                                        severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U17", ctx) },
  { gateId: "G1U18", phase: 1, description: "QC provider has coverage in destination country",                               severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U18", ctx) },
  { gateId: "G1U19", phase: 1, description: "AI Container Advisor run (if mode-dependent)",                                  severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U19", ctx) },
  { gateId: "G1U20", phase: 1, description: "Documentation requirements trigger-resolved",                                   severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U20", ctx) },
  { gateId: "G1U21", phase: 1, description: "Insurance requirements specified (if Incoterm requires)",                       severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U21", ctx) },
  { gateId: "G1U22", phase: 1, description: "Insurance type valid",                                                           severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U22", ctx) },
  { gateId: "G1U23", phase: 1, description: "Earliest delivery date < preferred < latest",                                    severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U23", ctx) },
  { gateId: "G1U24", phase: 1, description: "Delivery window within carrier transit time",                                    severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U24", ctx) },
  { gateId: "G1U25", phase: 1, description: "Special instructions length ≤ 2000 chars",                                      severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U25", ctx) },
  { gateId: "G1U26", phase: 1, description: "Trade criticality set (Routine/Priority/Critical)",                             severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U26", ctx) },
  { gateId: "G1U27", phase: 1, description: "Trade value > 0",                                                               severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U27", ctx) },
  { gateId: "G1U28", phase: 1, description: "Trade value within seller capacity (if known)",                                 severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U28", ctx) },
  { gateId: "G1U29", phase: 1, description: "Buyer Financing Toggle is data-sovereign",                                      severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U29", ctx) },
  { gateId: "G1U30", phase: 1, description: "Draft auto-saved (if session > 30s)",                                            severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U30", ctx) },
  { gateId: "G1U31", phase: 1, description: "All mandatory fields present",                                                  severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U31", ctx) },
  { gateId: "G1U32", phase: 1, description: "Readiness score ≥ 70 (warning only — not blocking)",                             severity: "WARNING",  validator: (ctx) => runPhase1Gate("G1U32", ctx) },
  { gateId: "G1U33", phase: 1, description: "Marketplace attribution acknowledged (if attributed, 72h dispute window)",       severity: "CRITICAL", validator: (ctx) => runPhase1Gate("G1U33", ctx) },

  // ─── Phase 2 — Seller Quote Generation (G2U17–G2U21 + G2-SRC-01..03) ──────
  // NOTE: v17 §15 calls for 23 Phase 2 gates (G2U1–G2U23). Only 8 are currently
  // implemented (gates-phase2.ts). The remaining 15 gates (G2U1–G2U16 + G2U22–
  // G2U23) are placeholders for future Phase 2 work — they are NOT registered
  // here so the registry stays an accurate reflection of what's implemented.
  { gateId: "G2U17",     phase: 2, description: "Loading origin (port/facility + cargo-ready date)",                          severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2U17",     ctx) },
  { gateId: "G2U18",     phase: 2, description: "Mandatory logistics costs priced (per Incoterm Responsibility Engine)",      severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2U18",     ctx) },
  { gateId: "G2U19",     phase: 2, description: "Alternative delivery port valid (if declared)",                              severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2U19",     ctx) },
  { gateId: "G2U20",     phase: 2, description: "Multi-shipment schedule defined",                                            severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2U20",     ctx) },
  { gateId: "G2U21",     phase: 2, description: "Price visibility (line items + surcharges disclosed to buyer)",              severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2U21",     ctx) },
  { gateId: "G2-SRC-01", phase: 2, description: "Provider holds valid credentials in jurisdiction",                           severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2-SRC-01", ctx) },
  { gateId: "G2-SRC-02", phase: 2, description: "Provider has no active sanctions",                                            severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2-SRC-02", ctx) },
  { gateId: "G2-SRC-03", phase: 2, description: "Provider capacity available for service/corridor",                             severity: "CRITICAL", validator: (ctx) => runPhase2Gate("G2-SRC-03", ctx) },

  // ─── Phase 2 — Multi-Shipment Sub-Gates (G2U-MS1..MS4) — v17 §5.6 ──────────
  // These gates enforce the multi-shipment contract invariants on top of the
  // multi-shipment lib functions. They are scoped to a master contract
  // (via contract_id / master_contract_id) or a single shipment (via shipment_id).
  { gateId: "G2U-MS1", phase: 2, description: "Multi-shipment schedule fully defined (delivery_date + port + container_count for every shipment)", severity: "CRITICAL", validator: (ctx) => validateG2UMS1(ctx) },
  { gateId: "G2U-MS2", phase: 2, description: "Per-shipment SGTX fee calculated correctly (1.5% × shipmentValue per shipment)",                severity: "CRITICAL", validator: (ctx) => validateG2UMS2(ctx) },
  { gateId: "G2U-MS3", phase: 2, description: "Schedule modification only on unlocked shipments (no out-of-band mods of locked shipments)",    severity: "CRITICAL", validator: (ctx) => validateG2UMS3(ctx) },
  { gateId: "G2U-MS4", phase: 2, description: "Schedule modification reason ≥20 chars (every addendum has a documented rationale)",            severity: "CRITICAL", validator: (ctx) => validateG2UMS4(ctx) },

  // ─── Phase 3 — Quote / Contract Lock (G3U1–G3U13) ─────────────────────────
  { gateId: "G3U1",  phase: 3, description: "Quote submitted with all mandatory fields",                                    severity: "CRITICAL", validator: (ctx) => validateG3U1(toPhase3Context(ctx)) },
  { gateId: "G3U2",  phase: 3, description: "Packing plan locked (including non-uniform layers)",                             severity: "CRITICAL", validator: (ctx) => validateG3U2(toPhase3Context(ctx)) },
  { gateId: "G3U3",  phase: 3, description: "Multi-shipment schedule fully defined",                                          severity: "CRITICAL", validator: (ctx) => validateG3U3(toPhase3Context(ctx)) },
  { gateId: "G3U4",  phase: 3, description: "Valid alternative ports",                                                        severity: "CRITICAL", validator: (ctx) => validateG3U4(toPhase3Context(ctx)) },
  { gateId: "G3U5",  phase: 3, description: "SGTX fee correctly calculated (3% of trade value)",                               severity: "CRITICAL", validator: (ctx) => validateG3U5(toPhase3Context(ctx)) },
  { gateId: "G3U6",  phase: 3, description: "Selected quote for every Incoterm-mandatory service (Mode A/B/C)",               severity: "CRITICAL", validator: (ctx) => validateG3U6(toPhase3Context(ctx)) },
  { gateId: "G3U7",  phase: 3, description: "Contract consistency (field-by-field vs Final Commercial Term Sheet)",          severity: "CRITICAL", validator: (ctx) => validateG3U7(toPhase3Context(ctx)) },
  { gateId: "G3U8",  phase: 3, description: "SGTX Witness Clause present (non-removable)",                                    severity: "CRITICAL", validator: (ctx) => validateG3U8(toPhase3Context(ctx)) },
  { gateId: "G3U9",  phase: 3, description: "QES signature valid (Egypt Trust/Misr or Ed25519 fallback)",                    severity: "CRITICAL", validator: (ctx) => validateG3U9(toPhase3Context(ctx)) },
  { gateId: "G3U10", phase: 3, description: "FeeLock state PENDING (not yet active — USTN not generated here)",              severity: "CRITICAL", validator: (ctx) => validateG3U10(toPhase3Context(ctx)) },
  { gateId: "G3U11", phase: 3, description: "Final lock precondition (all prior gates passed)",                              severity: "CRITICAL", validator: (ctx) => validateG3U11(toPhase3Context(ctx)) },
  { gateId: "G3U12", phase: 3, description: "CFR issued before contract lock (if buyer financing required)",                  severity: "CRITICAL", validator: (ctx) => validateG3U12(toPhase3Context(ctx)) },
  { gateId: "G3U13", phase: 3, description: "CFR valid at contract lock time (not expired, not rejected)",                     severity: "CRITICAL", validator: (ctx) => validateG3U13(toPhase3Context(ctx)) },

  // ─── Phase 5 — Physical Execution (G5U1–G5UA9) ────────────────────────────
  { gateId: "G5U1",  phase: 5, description: "Milestone confirmation multisensor consensus (≥2 sensors)",                     severity: "CRITICAL", validator: (ctx) => validateG5U1(toPhase5Context(ctx)) },
  { gateId: "G5U2",  phase: 5, description: "IoT sensor data within acceptable range (cold chain temp, humidity)",            severity: "CRITICAL", validator: (ctx) => validateG5U2(toPhase5Context(ctx)) },
  { gateId: "G5U3",  phase: 5, description: "Customs hold released (if applicable)",                                          severity: "CRITICAL", validator: (ctx) => validateG5U3(toPhase5Context(ctx)) },
  { gateId: "G5U4",  phase: 5, description: "QC hold released (if applicable) — conditional QC action plan complete",          severity: "CRITICAL", validator: (ctx) => validateG5U4(toPhase5Context(ctx)) },
  { gateId: "G5U5",  phase: 5, description: "Container Release Authorisation valid (mTLS, HSM-signed)",                        severity: "CRITICAL", validator: (ctx) => validateG5U5(toPhase5Context(ctx)) },
  { gateId: "G5U6",  phase: 5, description: "Vessel/voyage confirmed (AIS digital twin)",                                       severity: "CRITICAL", validator: (ctx) => validateG5U6(toPhase5Context(ctx)) },
  { gateId: "G5U7",  phase: 5, description: "Loading confirmed (weight matches packing plan, ±2%)",                           severity: "CRITICAL", validator: (ctx) => validateG5U7(toPhase5Context(ctx)) },
  { gateId: "G5U8",  phase: 5, description: "Departure confirmed (gate-out timestamp, cross-validated by DCSA)",              severity: "CRITICAL", validator: (ctx) => validateG5U8(toPhase5Context(ctx)) },
  { gateId: "G5U9",  phase: 5, description: "In-transit tracking active (AIS + IoT in last 24h)",                              severity: "CRITICAL", validator: (ctx) => validateG5U9(toPhase5Context(ctx)) },
  { gateId: "G5UA1", phase: 5, description: "Arrival confirmed (gate-in timestamp, cross-validated by DCSA)",                severity: "CRITICAL", validator: (ctx) => validateG5UA1(toPhase5Context(ctx)) },
  { gateId: "G5UA2", phase: 5, description: "Customs import clearance complete",                                              severity: "CRITICAL", validator: (ctx) => validateG5UA2(toPhase5Context(ctx)) },
  { gateId: "G5UA3", phase: 5, description: "Delivery accepted (POD evidence signed)",                                          severity: "CRITICAL", validator: (ctx) => validateG5UA3(toPhase5Context(ctx)) },
  { gateId: "G5UA4", phase: 5, description: "Settlement complete (all payment legs SETTLED)",                                  severity: "CRITICAL", validator: (ctx) => validateG5UA4(toPhase5Context(ctx)) },
  { gateId: "G5UA5", phase: 5, description: "Financial reconciliation complete (95% HF donut threshold)",                      severity: "CRITICAL", validator: (ctx) => validateG5UA5(toPhase5Context(ctx)) },
  { gateId: "G5UA6", phase: 5, description: "Customs complete (Nafeza clearance for EG-routed trades)",                        severity: "CRITICAL", validator: (ctx) => validateG5UA6(toPhase5Context(ctx)) },
  { gateId: "G5UA7", phase: 5, description: "Post-clearance complete (all PCA actions in terminal status)",                    severity: "CRITICAL", validator: (ctx) => validateG5UA7(toPhase5Context(ctx)) },
  { gateId: "G5UA8", phase: 5, description: "Disputes/claims satisfied (all in terminal status)",                              severity: "CRITICAL", validator: (ctx) => validateG5UA8(toPhase5Context(ctx)) },
  { gateId: "G5UA9", phase: 5, description: "Evidence sealed (26 categories — FinalEvidencePackage SEALED)",                   severity: "CRITICAL", validator: (ctx) => validateG5UA9(toPhase5Context(ctx)) },
];

// ───────────────────────────────────────────────────────────────────────────────
// Registry query helpers
// ───────────────────────────────────────────────────────────────────────────────

const GATE_INDEX: Map<string, GateMetadata> = (() => {
  const m = new Map<string, GateMetadata>();
  for (const g of GOVERNOR_GATES) m.set(g.gateId, g);
  return m;
})();

/**
 * Look up a single gate by its gateId. Returns undefined if not found.
 */
export function getGateById(gateId: string): GateMetadata | undefined {
  return GATE_INDEX.get(gateId);
}

/**
 * List all gates for a given phase (1, 2, 3, or 5). Returns an empty array
 * for unknown phases.
 */
export function getGatesByPhase(phase: 1 | 2 | 3 | 5): GateMetadata[] {
  return GOVERNOR_GATES.filter((g) => g.phase === phase);
}

/**
 * Total count of registered gates.
 */
export function getGateCount(): number {
  return GOVERNOR_GATES.length;
}

/**
 * Per-phase gate counts — useful for the gates API summary.
 */
export function getPhaseGateCounts(): Record<1 | 2 | 3 | 5, number> {
  return {
    1: GOVERNOR_GATES.filter((g) => g.phase === 1).length,
    2: GOVERNOR_GATES.filter((g) => g.phase === 2).length,
    3: GOVERNOR_GATES.filter((g) => g.phase === 3).length,
    5: GOVERNOR_GATES.filter((g) => g.phase === 5).length,
  };
}

/**
 * Run a single gate's validator against the supplied context.
 */
export async function validateGate(gateId: string, ctx: GateContext): Promise<GateResult> {
  const gate = getGateById(gateId);
  if (!gate) {
    return {
      gateId,
      passed: false,
      severity: "CRITICAL",
      message: `Unknown gate: ${gateId}`,
      remediation: "Verify the gateId against the GOVERNOR_GATES registry.",
    };
  }
  try {
    return await gate.validator(ctx);
  } catch (e: any) {
    return {
      gateId,
      passed: false,
      severity: gate.severity,
      message: `${gateId} validator threw: ${e.message}`,
      remediation: "Escalate to SGTX support.",
    };
  }
}

/**
 * Validate ALL gates for a given phase against the supplied context.
 * Returns the per-gate breakdown plus the aggregate pass/fail counts.
 */
export async function validateAllGatesForPhase(
  phase: 1 | 2 | 3 | 5,
  ctx: GateContext,
): Promise<PhaseValidationResult> {
  const gates = getGatesByPhase(phase);
  const results: GateResult[] = [];
  for (const g of gates) {
    results.push(await validateGate(g.gateId, ctx));
  }
  const criticalGates = results.filter((g) => g.severity === "CRITICAL");
  const criticalPassed = criticalGates.filter((g) => g.passed).length;
  const warnings = results.filter((g) => g.severity === "WARNING" && !g.passed).length;
  const overallPassed = criticalGates.every((g) => g.passed);
  return {
    phase,
    gates: results,
    critical_passed: criticalPassed,
    critical_total: criticalGates.length,
    warnings,
    overall_passed: overallPassed,
  };
}
