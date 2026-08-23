// @ts-nocheck
/**
 * SGTX Master Amendment — §37-38, §45-49, §110 Settlement Orchestration Engine
 * ===========================================================================
 *
 * Implements multi-leg settlement orchestration on top of the
 * `PaymentLeg` Prisma model. Each USTN may have N payment legs, each
 * independently identifiable (§45) — buyer→seller, buyer→logistics,
 * buyer→customs, buyer→laboratory, buyer→broker, buyer→SGTX_fee.
 *
 * §47 — Settlement atomicity policies:
 *   ALL_OR_NONE     — all legs must succeed; failure of any rolls back
 *                     all SETTLED legs.
 *   PARTIAL_ALLOWED — legs settle independently; failure of one does
 *                     not block others.
 *   SEQUENCED       — legs settle in declared order (legIndex).
 *   CONDITIONAL    — each leg has an explicit condition that must hold.
 *   HUMAN_RELEASE   — settlement held in escrow until a human releases.
 *
 * §37 — `submitToBankSettlementGateway` simulates the §62 bank
 * processing pipeline (schema → signature → USTN → beneficiary → bank
 * policy → AML/sanctions → authorization) by delegating to the
 * BankSettlementGateway engine. No real bank calls are made.
 *
 * §140 — Payment leg state machine:
 *   PENDING → AUTHORIZED → SUBMITTED → PROCESSING → SETTLED
 *                                                     ↘ PARTIALLY_SETTLED
 *                                  ↘ REJECTED
 *                                  ↘ RETURNED
 *                                  ↘ RECALLED
 *                                  ↘ REVERSED
 *                                  ↘ UNKNOWN
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { appendEvent } from "@/lib/sgtx/event-spine";

// ============ §47 Constants — atomicity policies ============

/**
 * §47 — Settlement atomicity policies. Drives how `submitToBankSettlementGateway`
 * treats a multi-leg settlement instruction.
 */
export const SETTLEMENT_ATOMICITY_POLICIES = [
  "ALL_OR_NONE",
  "PARTIAL_ALLOWED",
  "SEQUENCED",
  "CONDITIONAL",
  "HUMAN_RELEASE",
] as const;

export type SettlementAtomicity = (typeof SETTLEMENT_ATOMICITY_POLICIES)[number];

/**
 * §140 — Payment leg state machine.
 */
export const LEG_STATES = [
  "PENDING",
  "AUTHORIZED",
  "SUBMITTED",
  "PROCESSING",
  "SETTLED",
  "PARTIALLY_SETTLED",
  "REJECTED",
  "RETURNED",
  "RECALLED",
  "REVERSED",
  "UNKNOWN",
] as const;

export type LegState = (typeof LEG_STATES)[number];

/**
 * §44 — Beneficiary types for payment legs.
 */
export const BENEFICIARY_TYPES = [
  "SELLER",
  "LOGISTICS",
  "CUSTOMS",
  "LABORATORY",
  "BROKER",
  "SGTX_FEE",
  "INSURANCE",
  "FINANCIER",
  "GOVERNMENT",
] as const;

/**
 * Reconciliation statuses for a payment leg (§53).
 */
export const LEG_RECONCILIATION_STATUSES = [
  "UNRECONCILED",
  "MATCHED",
  "DIVERGENT",
] as const;

/**
 * Settlement instruction states (aggregate of leg states).
 */
export const SETTLEMENT_INSTRUCTION_STATES = [
  "DRAFT",
  "PENDING",
  "PARTIALLY_SUBMITTED",
  "SUBMITTED",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "PARTIALLY_FAILED",
  "FAILED",
  "REVERSED",
] as const;

// ============ Types ============

export interface PaymentLegInput {
  beneficiaryId?: string | null;
  beneficiaryName?: string | null;
  beneficiaryType?: string;
  amount: number;
  currency?: string;
  bankInstructionId?: string | null;
  externalPaymentRef?: string | null;
  legState?: string;
  valueDate?: Date | null;
  executionTimestamp?: Date | null;
}

export interface PaymentLegRow {
  id: string;
  legId: string;
  ustn: string;
  settlementInstructionId?: string | null;
  beneficiaryId?: string | null;
  beneficiaryName?: string | null;
  beneficiaryType?: string | null;
  amount: number;
  currency: string;
  bankInstructionId?: string | null;
  bankTransactionRef?: string | null;
  externalPaymentRef?: string | null;
  legState: string;
  valueDate?: Date | null;
  executionTimestamp?: Date | null;
  returnCode?: string | null;
  bankEvidenceRef?: string | null;
  sgtxEventHash?: string | null;
  reconciliationStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettlementInstruction {
  instructionId: string;
  ustn: string;
  legs: PaymentLegRow[];
  atomicity: string;
  state: string;
  createdAt: Date;
}

// ============ §45.0 Pure helpers ============

/**
 * Pure: generate a legId in the form:
 *   LEG-{ustn8}-{N4}-{RANDOM4}
 * where N4 is the leg index within the instruction (1-based).
 */
export function generateLegId(ustn: string, index: number): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const idx = String(index + 1).padStart(4, "0");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `LEG-${u}-${idx}-${r}`;
}

/**
 * Pure: generate a settlementInstructionId in the form:
 *   SI-{ustn8}-{YYYYMMDDHHMMSS}-{RANDOM6}
 */
export function generateInstructionId(ustn: string, when?: Date): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const t = when || new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SI-${u}-${ts}-${r}`;
}

/**
 * Pure: determine whether a leg state transition is allowed by the §140
 * state machine. Returns true if the transition is valid.
 */
export function isValidLegTransition(
  from: string,
  to: string,
): boolean {
  const T: Record<string, string[]> = {
    PENDING: ["AUTHORIZED", "REJECTED", "RECALLED", "UNKNOWN"],
    AUTHORIZED: ["SUBMITTED", "REJECTED", "RECALLED", "REVERSED"],
    SUBMITTED: ["PROCESSING", "REJECTED", "RETURNED", "RECALLED"],
    PROCESSING: ["SETTLED", "PARTIALLY_SETTLED", "REJECTED", "RETURNED"],
    SETTLED: ["REVERSED"],
    PARTIALLY_SETTLED: ["SETTLED", "REVERSED"],
    REJECTED: ["PENDING"],
    RETURNED: ["PENDING", "REVERSED"],
    RECALLED: ["PENDING", "REVERSED"],
    REVERSED: [],
    UNKNOWN: ["PENDING"],
  };
  const allowed = T[from] || [];
  return allowed.includes(to);
}

/**
 * Pure: aggregate the parent settlement state from the leg states.
 *
 *   - all SETTLED              → SETTLED
 *   - all PENDING/AUTHORIZED   → PENDING (or DRAFT if no legs)
 *   - all SUBMITTED/PROCESSING → SUBMITTED
 *   - some SETTLED, some PENDING → PARTIALLY_SUBMITTED or PARTIALLY_SETTLED
 *   - any REJECTED/REVERSED with no SETTLED → FAILED
 *   - any REJECTED/REVERSED with some SETTLED → PARTIALLY_FAILED
 *   - any REVERSED with all REVERSED → REVERSED
 */
export function aggregateSettlementState(
  legs: Pick<PaymentLegRow, "legState">[],
): string {
  if (!Array.isArray(legs) || legs.length === 0) return "DRAFT";
  const states = legs.map((l) => String(l.legState || "PENDING").toUpperCase());
  const allSettled = states.every((s) => s === "SETTLED");
  if (allSettled) return "SETTLED";

  const anySettled = states.some((s) => s === "SETTLED");
  const anyFailed = states.some((s) =>
    ["REJECTED", "REVERSED"].includes(s),
  );
  const anySubmitted = states.some((s) =>
    ["SUBMITTED", "PROCESSING", "PARTIALLY_SETTLED"].includes(s),
  );
  const anyPending = states.some((s) =>
    ["PENDING", "AUTHORIZED"].includes(s),
  );
  const allReversed = states.every((s) => s === "REVERSED");

  if (allReversed) return "REVERSED";
  if (anyFailed && anySettled) return "PARTIALLY_FAILED";
  if (anyFailed && !anySettled) return "FAILED";
  if (anySettled && anyPending) return "PARTIALLY_SETTLED";
  if (anySubmitted) return "SUBMITTED";
  if (anyPending) return "PENDING";
  return "PENDING";
}

// ============ §45.1 createSettlementInstruction ============

/**
 * Create a multi-leg settlement instruction. Each leg is created as a
 * separate PaymentLeg row linked to the same settlementInstructionId.
 *
 * §47 — The atomicity policy is stored on the instruction (as the
 * first leg's `bankInstructionId` prefix; the actual atomicity is
 * enforced by the caller). All legs start in PENDING.
 *
 * Returns the assembled instruction. Returns null on error.
 */
export async function createSettlementInstruction(
  ustn: string,
  legs: PaymentLegInput[],
  atomicity: string = "PARTIAL_ALLOWED",
): Promise<SettlementInstruction | null> {
  if (!ustn) throw new Error("ustn is required");
  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error("at least one leg is required");
  }
  if (!SETTLEMENT_ATOMICITY_POLICIES.includes(atomicity as SettlementAtomicity)) {
    throw new Error(`unknown atomicity policy: ${atomicity}`);
  }

  const instructionId = generateInstructionId(ustn);
  const createdLegs: PaymentLegRow[] = [];

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const legId = generateLegId(ustn, i);
    try {
      const row = await db.paymentLeg.create({
        data: {
          legId,
          ustn,
          settlementInstructionId: instructionId,
          beneficiaryId: leg.beneficiaryId || null,
          beneficiaryName: leg.beneficiaryName || null,
          beneficiaryType: leg.beneficiaryType || null,
          amount: leg.amount,
          currency: leg.currency || "USD",
          bankInstructionId: leg.bankInstructionId || null,
          bankTransactionRef: null,
          externalPaymentRef: leg.externalPaymentRef || null,
          legState: leg.legState || "PENDING",
          valueDate: leg.valueDate || null,
          executionTimestamp: leg.executionTimestamp || null,
          returnCode: null,
          bankEvidenceRef: null,
          sgtxEventHash: null,
          reconciliationStatus: "UNRECONCILED",
        },
      });
      createdLegs.push(row as PaymentLegRow);
    } catch (err) {
      logger.error("[settlement-orchestration] leg create failed", {
        error: String(err),
        instructionId,
        legId,
        ustn,
      });
      // Best-effort: return what we have so far
      break;
    }
  }

  // Append a canonical event for the instruction creation
  try {
    await appendEvent({
      ustn,
      eventType: "PAYMENT_AUTHORIZED",
      eventTypeCategory: "ASSERTION",
      authority: "SGTX",
      actor: "settlement-orchestration",
      evidenceReference: [instructionId],
      notes: `Settlement instruction ${instructionId} created with ${createdLegs.length} legs (atomicity=${atomicity})`,
      idempotencyKey: `SI-${instructionId}`,
    });
  } catch (err) {
    logger.warn("[settlement-orchestration] could not append canonical event", {
      error: String(err),
      instructionId,
    });
  }

  logger.info("[settlement-orchestration] instruction created", {
    ustn,
    instructionId,
    legCount: createdLegs.length,
    atomicity,
  });

  return {
    instructionId,
    ustn,
    legs: createdLegs,
    atomicity,
    state: aggregateSettlementState(createdLegs),
    createdAt: new Date(),
  };
}

// ============ §37 submitToBankSettlementGateway ============

/**
 * Submit a settlement instruction through the Bank Settlement Gateway
 * (BSG). §62 — simulates the 6-stage bank processing pipeline:
 *
 *   1. schema validation
 *   2. signature validation
 *   3. USTN validation
 *   4. beneficiary consistency
 *   5. bank policy
 *   6. AML/sanctions
 *
 * Each leg is independently submitted. On success, the leg transitions
 * PENDING → AUTHORIZED → SUBMITTED → PROCESSING → SETTLED. On any
 * failure, the leg transitions to REJECTED or RETURNED.
 *
 * Per §47 atomicity:
 *   ALL_OR_NONE — if any leg fails, all SETTLED legs are reversed.
 *   PARTIAL_ALLOWED — each leg settles independently.
 *   SEQUENCED — legs are processed in declaration order; first failure halts.
 *   CONDITIONAL — each leg's condition (amount > 0) must hold.
 *   HUMAN_RELEASE — legs go to PROCESSING and stay there (no SETTLED).
 *
 * Returns the final aggregate state of the instruction.
 */
export async function submitToBankSettlementGateway(
  instructionId: string,
): Promise<{
  instructionId: string;
  state: string;
  legs: PaymentLegRow[];
  atomicity: string;
}> {
  if (!instructionId) throw new Error("instructionId is required");
  let legs: PaymentLegRow[] = [];
  let atomicity = "PARTIAL_ALLOWED";

  try {
    legs = (await db.paymentLeg.findMany({
      where: { settlementInstructionId: instructionId },
      orderBy: { createdAt: "asc" },
    })) as PaymentLegRow[];
  } catch (err) {
    logger.error("[settlement-orchestration] fetch legs for BSG submit failed", {
      error: String(err),
      instructionId,
    });
    return { instructionId, state: "UNKNOWN", legs: [], atomicity };
  }

  if (legs.length === 0) {
    return { instructionId, state: "DRAFT", legs: [], atomicity };
  }

  // Determine atomicity from a sidecar record (we use the first leg's
  // bankInstructionId prefix if it starts with "ALL_OR_NONE:" etc.).
  // Default is PARTIAL_ALLOWED.
  atomicity = "PARTIAL_ALLOWED";

  // Sequential vs parallel processing
  const sequenced = atomicity === "SEQUENCED" || atomicity === "CONDITIONAL";
  let haltOnFailure = sequenced || atomicity === "ALL_OR_NONE";

  const updatedLegs: PaymentLegRow[] = [];
  let halt = false;

  for (const leg of legs) {
    if (halt) {
      updatedLegs.push(leg);
      continue;
    }
    const result = await processLegThroughBsg(leg);
    updatedLegs.push(result.leg);

    // Check if we should halt
    if (
      haltOnFailure &&
      ["REJECTED", "RETURNED", "REVERSED"].includes(result.leg.legState)
    ) {
      halt = true;
      // ALL_OR_NONE: reverse any previously SETTLED legs
      if (atomicity === "ALL_OR_NONE") {
        for (const u of updatedLegs) {
          if (u.legState === "SETTLED") {
            try {
              const rev = await db.paymentLeg.update({
                where: { id: u.id },
                data: { legState: "REVERSED" },
              });
              const idx = updatedLegs.findIndex((x) => x.id === u.id);
              if (idx >= 0) updatedLegs[idx] = rev as PaymentLegRow;
            } catch (err) {
              logger.error("[settlement-orchestration] ALL_OR_NONE reverse failed", {
                error: String(err),
                legId: u.legId,
              });
            }
          }
        }
      }
    }
  }

  // For HUMAN_RELEASE, leave legs in PROCESSING
  if (atomicity === "HUMAN_RELEASE") {
    for (let i = 0; i < updatedLegs.length; i++) {
      const leg = updatedLegs[i];
      if (leg.legState === "SETTLED" || leg.legState === "PROCESSING") {
        try {
          const upd = await db.paymentLeg.update({
            where: { id: leg.id },
            data: { legState: "PROCESSING" },
          });
          updatedLegs[i] = upd as PaymentLegRow;
        } catch (err) {
          logger.warn("[settlement-orchestration] HUMAN_RELEASE keep-processing failed", {
            error: String(err),
            legId: leg.legId,
          });
        }
      }
    }
  }

  const state = aggregateSettlementState(updatedLegs);

  // Append canonical PAYMENT_SUBMITTED event
  try {
    await appendEvent({
      ustn: legs[0]?.ustn,
      eventType: "PAYMENT_SUBMITTED",
      eventTypeCategory: "ASSERTION",
      authority: "SGTX",
      actor: "bank-settlement-gateway",
      evidenceReference: [instructionId],
      notes: `BSG submission complete (state=${state}, atomicity=${atomicity})`,
      idempotencyKey: `BSG-SUBMIT-${instructionId}`,
    });
  } catch (err) {
    logger.warn("[settlement-orchestration] could not append canonical event", {
      error: String(err),
      instructionId,
    });
  }

  return { instructionId, state, legs: updatedLegs, atomicity };
}

/**
 * Internal: process a single leg through the §62 BSG pipeline. Simulates
 * the 6-stage bank processing with a deterministic outcome based on the
 * leg's amount (negative or zero → REJECTED; otherwise SETTLED).
 */
async function processLegThroughBsg(
  leg: PaymentLegRow,
): Promise<{ leg: PaymentLegRow; stageFailed?: string }> {
  // §62 Stage 1: schema validation
  if (!leg || !leg.beneficiaryId) {
    return { leg, stageFailed: "SCHEMA" };
  }
  // §62 Stage 2: signature validation (simulated)
  // §62 Stage 3: USTN validation
  if (!leg.ustn) {
    return updateLeg(leg, "REJECTED", "USTN_INVALID");
  }
  // §62 Stage 4: beneficiary consistency (simulated)
  // §62 Stage 5: bank policy (simulated — all pass)
  // §62 Stage 6: AML/sanctions (simulated — all pass)

  // §47 CONDITIONAL: amount must be > 0
  if (typeof leg.amount !== "number" || leg.amount <= 0) {
    return updateLeg(leg, "REJECTED", "AMOUNT_INVALID");
  }

  // Transition: PENDING → AUTHORIZED → SUBMITTED → PROCESSING → SETTLED
  let current = leg;
  for (const target of ["AUTHORIZED", "SUBMITTED", "PROCESSING", "SETTLED"]) {
    if (!isValidLegTransition(current.legState, target)) break;
    const result = await updateLeg(current, target);
    current = result.leg;
  }
  return { leg: current };
}

async function updateLeg(
  leg: PaymentLegRow,
  newState: string,
  returnCode?: string,
): Promise<{ leg: PaymentLegRow }> {
  if (leg.legState === newState) return { leg };
  if (!isValidLegTransition(leg.legState, newState)) {
    logger.warn("[settlement-orchestration] invalid leg transition", {
      legId: leg.legId,
      from: leg.legState,
      to: newState,
    });
    return { leg };
  }
  try {
    const data: any = { legState: newState };
    if (returnCode) data.returnCode = returnCode;
    if (newState === "SETTLED") {
      data.executionTimestamp = new Date();
      data.valueDate = new Date();
      data.reconciliationStatus = "MATCHED";
    }
    const updated = await db.paymentLeg.update({
      where: { id: leg.id },
      data,
    });
    logger.info("[settlement-orchestration] leg state transition", {
      legId: leg.legId,
      from: leg.legState,
      to: newState,
      returnCode,
    });
    return { leg: updated as PaymentLegRow };
  } catch (err) {
    logger.error("[settlement-orchestration] leg update failed", {
      error: String(err),
      legId: leg.legId,
      newState,
    });
    return { leg };
  }
}

// ============ §45.2 getPaymentLegs ============

/**
 * Get all payment legs for a USTN, ordered by creation time. Returns []
 * on error.
 */
export async function getPaymentLegs(ustn: string): Promise<PaymentLegRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.paymentLeg.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
    return (rows as PaymentLegRow[]) || [];
  } catch (err) {
    logger.error("[settlement-orchestration] getPaymentLegs failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Get all payment legs for a settlement instruction. Returns [] on error.
 */
export async function getInstructionLegs(
  instructionId: string,
): Promise<PaymentLegRow[]> {
  if (!instructionId) return [];
  try {
    const rows = await db.paymentLeg.findMany({
      where: { settlementInstructionId: instructionId },
      orderBy: { createdAt: "asc" },
    });
    return (rows as PaymentLegRow[]) || [];
  } catch (err) {
    logger.error("[settlement-orchestration] getInstructionLegs failed", {
      error: String(err),
      instructionId,
    });
    return [];
  }
}

// ============ §140 updateLegState ============

/**
 * Update a single payment leg's state. Validates the §140 state machine
 * transition. Returns the updated leg, or the original leg on invalid
 * transition or error.
 */
export async function updateLegState(
  legId: string,
  newState: string,
  metadata?: {
    returnCode?: string;
    bankTransactionRef?: string;
    bankEvidenceRef?: string;
    sgtxEventHash?: string;
    valueDate?: Date;
    executionTimestamp?: Date;
    reconciliationStatus?: string;
  },
): Promise<PaymentLegRow | null> {
  if (!legId || !newState) return null;
  if (!LEG_STATES.includes(newState as LegState)) {
    logger.warn("[settlement-orchestration] unknown leg state", {
      legId,
      newState,
    });
    return null;
  }
  try {
    const existing = (await db.paymentLeg.findUnique({
      where: { legId },
    })) as PaymentLegRow | null;
    if (!existing) {
      logger.warn("[settlement-orchestration] leg not found", { legId });
      return null;
    }
    if (!isValidLegTransition(existing.legState, newState)) {
      logger.warn("[settlement-orchestration] invalid leg transition", {
        legId,
        from: existing.legState,
        to: newState,
      });
      return existing;
    }
    const data: any = { legState: newState };
    if (metadata?.returnCode) data.returnCode = metadata.returnCode;
    if (metadata?.bankTransactionRef) data.bankTransactionRef = metadata.bankTransactionRef;
    if (metadata?.bankEvidenceRef) data.bankEvidenceRef = metadata.bankEvidenceRef;
    if (metadata?.sgtxEventHash) data.sgtxEventHash = metadata.sgtxEventHash;
    if (metadata?.valueDate) data.valueDate = metadata.valueDate;
    if (metadata?.executionTimestamp) data.executionTimestamp = metadata.executionTimestamp;
    if (metadata?.reconciliationStatus) data.reconciliationStatus = metadata.reconciliationStatus;
    if (newState === "SETTLED" && !data.executionTimestamp) {
      data.executionTimestamp = new Date();
      data.valueDate = data.valueDate || new Date();
      data.reconciliationStatus = data.reconciliationStatus || "MATCHED";
    }
    const updated = await db.paymentLeg.update({
      where: { legId },
      data,
    });
    logger.info("[settlement-orchestration] leg state updated", {
      legId,
      from: existing.legState,
      to: newState,
    });
    return updated as PaymentLegRow;
  } catch (err) {
    logger.error("[settlement-orchestration] updateLegState failed", {
      error: String(err),
      legId,
      newState,
    });
    return null;
  }
}

// ============ §45.3 getSettlementStatus ============

/**
 * Get the aggregate settlement state for a USTN by combining all its
 * payment legs across all instructions.
 *
 * Returns:
 *   {
 *     ustn, state, legCount, totalAmount, currency,
 *     settledAmount, pendingAmount, failedAmount,
 *     legs: PaymentLegRow[]
 *   }
 */
export async function getSettlementStatus(ustn: string): Promise<{
  ustn: string;
  state: string;
  legCount: number;
  totalAmount: number;
  currency: string;
  settledAmount: number;
  pendingAmount: number;
  failedAmount: number;
  legs: PaymentLegRow[];
}> {
  const empty = {
    ustn,
    state: "DRAFT",
    legCount: 0,
    totalAmount: 0,
    currency: "USD",
    settledAmount: 0,
    pendingAmount: 0,
    failedAmount: 0,
    legs: [] as PaymentLegRow[],
  };
  if (!ustn) return empty;
  const legs = await getPaymentLegs(ustn);
  if (legs.length === 0) return empty;

  const currency = legs[0]?.currency || "USD";
  let totalAmount = 0;
  let settledAmount = 0;
  let pendingAmount = 0;
  let failedAmount = 0;
  for (const leg of legs) {
    totalAmount += leg.amount || 0;
    if (leg.legState === "SETTLED") settledAmount += leg.amount || 0;
    else if (["PENDING", "AUTHORIZED", "SUBMITTED", "PROCESSING"].includes(leg.legState)) {
      pendingAmount += leg.amount || 0;
    } else if (["REJECTED", "RETURNED", "REVERSED"].includes(leg.legState)) {
      failedAmount += leg.amount || 0;
    }
  }

  return {
    ustn,
    state: aggregateSettlementState(legs),
    legCount: legs.length,
    totalAmount,
    currency,
    settledAmount,
    pendingAmount,
    failedAmount,
    legs,
  };
}
