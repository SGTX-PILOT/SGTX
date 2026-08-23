// @ts-nocheck
/**
 * SGTX Master Amendment — §63-65 Financial Exposure Engine
 * ===========================================================================
 *
 * Implements the §63 Financial Exposure subledger — the running record
 * of how much money is at risk on a USTN at any point in time.
 *
 * §63 — Exposure dimensions tracked:
 *
 *   grossCommercialValue  — the original trade value
 *   expectedSettlement    — what we expect to settle (post-fees, post-FX)
 *   actualSettlement      — what has actually settled
 *   returnedAmount        — amounts returned (reversals, refunds)
 *   disputedAmount        — amounts under dispute
 *   fees                  — accumulated fees (PSP, platform, financing)
 *   adjustments           — price adjustments, debit/credit notes
 *   fxConsequences        — FX gain/loss realised
 *   penalties             — penalties (late, breach, demurrage)
 *   compensation          — compensation paid/received
 *   recoverableAmount     — what is still recoverable from a counterparty
 *   outstandingExposure   — current net exposure (computed)
 *   reopenedExposure      — exposure reopened after a reversal (§63.5)
 *   contingentExposure    — contingent (LC, guarantee) exposure
 *
 * §64 — exposureState: NONE | OPEN | REOPENED | RESOLVED
 *
 * §65 — Reopening exposure: when a settled payment is reversed, the
 * exposure is REOPENED (not created anew) so the audit trail is
 * preserved.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { appendEvent } from "@/lib/sgtx/event-spine";

// ============ §63 Constants — exposure states ============

/**
 * §64 — Exposure states.
 */
export const EXPOSURE_STATES = [
  "NONE",
  "OPEN",
  "REOPENED",
  "RESOLVED",
] as const;

export type ExposureState = (typeof EXPOSURE_STATES)[number];

/**
 * Recovery statuses (§63).
 */
export const RECOVERY_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "WRITE_OFF",
] as const;

// ============ Types ============

export interface FinancialExposureRow {
  id: string;
  ustn: string;
  grossCommercialValue: number;
  expectedSettlement: number;
  actualSettlement: number;
  returnedAmount: number;
  disputedAmount: number;
  fees: number;
  adjustments: number;
  fxConsequences: number;
  penalties: number;
  compensation: number;
  recoverableAmount: number;
  outstandingExposure: number;
  reopenedExposure: number;
  contingentExposure: number;
  exposureState: string;
  recoveryStatus?: string | null;
  currency: string;
  lastUpdated: Date;
  createdAt: Date;
}

export interface UpdateExposureInput {
  grossCommercialValue?: number;
  expectedSettlement?: number;
  actualSettlement?: number;
  returnedAmount?: number;
  disputedAmount?: number;
  fees?: number;
  adjustments?: number;
  fxConsequences?: number;
  penalties?: number;
  compensation?: number;
  recoverableAmount?: number;
  contingentExposure?: number;
  exposureState?: string;
  recoveryStatus?: string;
  currency?: string;
}

export interface ReopenExposureInput {
  amount: number;
  reason: string;
  recoveryStatus?: string;
}

// ============ §63.0 Pure helpers ============

/**
 * Pure: compute the outstanding exposure from the exposure fields.
 *
 *   outstandingExposure =
 *     expectedSettlement
 *     - actualSettlement
 *     + returnedAmount          // reversals add back to exposure
 *     + disputedAmount          // disputed amounts are at risk
 *     + penalties               // penalties incurred
 *     - recoverableAmount       // minus what we expect to recover
 *
 * Clamp to >= 0. fxConsequences are tracked separately (not part of
 * outstanding exposure — they are P&L, not exposure).
 */
export function computeOutstanding(exp: Partial<FinancialExposureRow>): number {
  if (!exp) return 0;
  const expected = Number(exp.expectedSettlement ?? 0);
  const actual = Number(exp.actualSettlement ?? 0);
  const returned = Number(exp.returnedAmount ?? 0);
  const disputed = Number(exp.disputedAmount ?? 0);
  const penalties = Number(exp.penalties ?? 0);
  const recoverable = Number(exp.recoverableAmount ?? 0);
  const outstanding =
    expected - actual + returned + disputed + penalties - recoverable;
  return Math.max(0, outstanding);
}

/**
 * Pure: derive the exposure state from the outstanding exposure + actual
 * settlement. Used by `updateExposure` to auto-set the state when the
 * caller doesn't override it.
 *
 *   actualSettlement >= expectedSettlement AND outstanding == 0 → RESOLVED
 *   outstanding > 0 + actualSettlement > 0                  → OPEN
 *   outstanding > 0 + actualSettlement == 0                  → OPEN
 *   outstanding == 0 + actualSettlement == 0                → NONE
 */
export function deriveExposureState(
  exp: Partial<FinancialExposureRow>,
): string {
  const outstanding = computeOutstanding(exp);
  const actual = Number(exp.actualSettlement ?? 0);
  const expected = Number(exp.expectedSettlement ?? 0);
  if (outstanding === 0 && actual >= expected && actual > 0) return "RESOLVED";
  if (outstanding === 0 && actual === 0 && expected === 0) return "NONE";
  return "OPEN";
}

// ============ §63.1 getOrCreateExposure ============

/**
 * Get the FinancialExposure row for a USTN, creating it (with all zeros)
 * if it doesn't already exist.
 *
 * Returns a fresh zero-exposure row on error.
 */
export async function getOrCreateExposure(
  ustn: string,
): Promise<FinancialExposureRow> {
  if (!ustn) throw new Error("ustn is required");
  try {
    const existing = await db.financialExposure.findUnique({
      where: { ustn },
    });
    if (existing) return existing as FinancialExposureRow;
  } catch (err) {
    logger.warn("[financial-exposure] findUnique failed — will attempt create", {
      error: String(err),
      ustn,
    });
  }
  try {
    const row = await db.financialExposure.create({
      data: {
        ustn,
        grossCommercialValue: 0,
        expectedSettlement: 0,
        actualSettlement: 0,
        returnedAmount: 0,
        disputedAmount: 0,
        fees: 0,
        adjustments: 0,
        fxConsequences: 0,
        penalties: 0,
        compensation: 0,
        recoverableAmount: 0,
        outstandingExposure: 0,
        reopenedExposure: 0,
        contingentExposure: 0,
        exposureState: "NONE",
        currency: "USD",
      },
    });
    logger.info("[financial-exposure] exposure created (NONE)", { ustn });
    return row as FinancialExposureRow;
  } catch (err) {
    try {
      const existing = await db.financialExposure.findUnique({
        where: { ustn },
      });
      if (existing) return existing as FinancialExposureRow;
    } catch (err2) {
      logger.error("[financial-exposure] fallback findUnique failed", {
        error: String(err2),
        ustn,
      });
    }
    logger.error("[financial-exposure] create failed — returning fresh in-memory", {
      error: String(err),
      ustn,
    });
    const now = new Date();
    return {
      id: "",
      ustn,
      grossCommercialValue: 0,
      expectedSettlement: 0,
      actualSettlement: 0,
      returnedAmount: 0,
      disputedAmount: 0,
      fees: 0,
      adjustments: 0,
      fxConsequences: 0,
      penalties: 0,
      compensation: 0,
      recoverableAmount: 0,
      outstandingExposure: 0,
      reopenedExposure: 0,
      contingentExposure: 0,
      exposureState: "NONE",
      recoveryStatus: null,
      currency: "USD",
      lastUpdated: now,
      createdAt: now,
    };
  }
}

// ============ §63.2 updateExposure ============

/**
 * Update the financial exposure for a USTN. Applies the provided field
 * updates and recomputes outstandingExposure + exposureState (unless
 * the caller explicitly sets exposureState).
 *
 * Returns the updated exposure row, or null on error.
 */
export async function updateExposure(
  ustn: string,
  updates: UpdateExposureInput,
): Promise<FinancialExposureRow | null> {
  if (!ustn) throw new Error("ustn is required");
  if (!updates || Object.keys(updates).length === 0) {
    return getExposure(ustn);
  }
  try {
    const current = await getOrCreateExposure(ustn);
    const next: any = { ...current, ...updates };
    // Recompute outstandingExposure unless caller overrode it
    const outstanding = computeOutstanding(next);
    // Derive state if caller didn't set it
    let nextState = updates.exposureState;
    if (!nextState) {
      nextState = current.exposureState === "REOPENED" ? "REOPENED" : deriveExposureState(next);
    }
    const data: any = { ...updates, outstandingExposure: outstanding, exposureState: nextState };
    const updated = await db.financialExposure.update({
      where: { ustn },
      data,
    });
    logger.info("[financial-exposure] exposure updated", {
      ustn,
      outstandingExposure: outstanding,
      exposureState: nextState,
      fieldsUpdated: Object.keys(updates),
    });
    return updated as FinancialExposureRow;
  } catch (err) {
    logger.error("[financial-exposure] updateExposure failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §63.3 computeOutstandingExposure ============

/**
 * Compute + persist the current outstanding exposure for a USTN. This is
 * the canonical read of "how much is at risk right now".
 *
 * Returns { outstandingExposure, exposureState } on success, or zeros on
 * error.
 */
export async function computeOutstandingExposure(
  ustn: string,
): Promise<{ outstandingExposure: number; exposureState: string }> {
  if (!ustn) return { outstandingExposure: 0, exposureState: "NONE" };
  try {
    const exp = await getOrCreateExposure(ustn);
    const outstanding = computeOutstanding(exp);
    const state = deriveExposureState({ ...exp, outstandingExposure: outstanding });
    // Persist the recomputed value
    if (outstanding !== exp.outstandingExposure || state !== exp.exposureState) {
      try {
        await db.financialExposure.update({
          where: { ustn },
          data: { outstandingExposure: outstanding, exposureState: state },
        });
      } catch (updErr) {
        logger.warn("[financial-exposure] could not persist recomputed outstanding", {
          error: String(updErr),
          ustn,
        });
      }
    }
    return { outstandingExposure: outstanding, exposureState: state };
  } catch (err) {
    logger.error("[financial-exposure] computeOutstandingExposure failed", {
      error: String(err),
      ustn,
    });
    return { outstandingExposure: 0, exposureState: "NONE" };
  }
}

// ============ §65 reopenExposure ============

/**
 * §65 — Reopen exposure after a reversal. Adds the reversal amount to
 * reopenedExposure + returns it to outstandingExposure. Sets state to
 * REOPENED (preserving the audit trail — does NOT set to OPEN, since
 * "REOPENED" indicates that a previously-resolved exposure was reopened).
 *
 * Also appends a canonical PAYMENT_REVERSED event for the audit trail.
 *
 * Returns the updated exposure row, or null on error.
 */
export async function reopenExposure(
  ustn: string,
  amount: number,
  reason: string,
): Promise<FinancialExposureRow | null> {
  if (!ustn) throw new Error("ustn is required");
  if (typeof amount !== "number" || amount <= 0) {
    logger.warn("[financial-exposure] reopenExposure rejected: invalid amount", {
      ustn,
      amount,
    });
    return null;
  }
  if (!reason) {
    logger.warn("[financial-exposure] reopenExposure rejected: missing reason", {
      ustn,
    });
    return null;
  }
  try {
    const current = await getOrCreateExposure(ustn);
    const reopened = (current.reopenedExposure || 0) + amount;
    const returned = (current.returnedAmount || 0) + amount;
    const next = {
      ...current,
      returnedAmount: returned,
      reopenedExposure: reopened,
    };
    const outstanding = computeOutstanding(next);
    const updated = await db.financialExposure.update({
      where: { ustn },
      data: {
        returnedAmount: returned,
        reopenedExposure: reopened,
        outstandingExposure: outstanding,
        exposureState: "REOPENED",
      },
    });
    logger.warn("[financial-exposure] exposure REOPENED after reversal", {
      ustn,
      amount,
      reason,
      newReopenedExposure: reopened,
      newOutstandingExposure: outstanding,
    });

    // Append canonical PAYMENT_REVERSED event for audit
    try {
      await appendEvent({
        ustn,
        eventType: "PAYMENT_REVERSED",
        eventTypeCategory: "COMMAND",
        authority: "SGTX",
        actor: "financial-exposure",
        evidenceReference: [reason],
        notes: `Exposure reopened: ${amount} ${current.currency} (${reason})`,
        idempotencyKey: `EXPOSURE-REOPEN-${ustn}-${Date.now()}`,
      });
    } catch (err) {
      logger.warn("[financial-exposure] could not append canonical event", {
        error: String(err),
        ustn,
      });
    }

    return updated as FinancialExposureRow;
  } catch (err) {
    logger.error("[financial-exposure] reopenExposure failed", {
      error: String(err),
      ustn,
      amount,
    });
    return null;
  }
}

// ============ §64 resolveExposure ============

/**
 * Mark the exposure as RESOLVED. This is the terminal state — once
 * resolved, the exposure is closed. To reopen, use `reopenExposure`.
 *
 * Sets recoveryStatus to RESOLVED if it was OPEN/IN_PROGRESS.
 *
 * Returns the updated exposure row, or null on error.
 */
export async function resolveExposure(
  ustn: string,
): Promise<FinancialExposureRow | null> {
  if (!ustn) return null;
  try {
    const current = await getOrCreateExposure(ustn);
    const updated = await db.financialExposure.update({
      where: { ustn },
      data: {
        exposureState: "RESOLVED",
        recoveryStatus: current.recoveryStatus === "WRITE_OFF"
          ? "WRITE_OFF"
          : "RESOLVED",
        outstandingExposure: 0,
      },
    });
    logger.info("[financial-exposure] exposure RESOLVED", { ustn });
    return updated as FinancialExposureRow;
  } catch (err) {
    logger.error("[financial-exposure] resolveExposure failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §63.4 getExposure ============

/**
 * Get the financial exposure for a USTN. Returns null if not found. Does
 * NOT auto-create — use `getOrCreateExposure` for that.
 */
export async function getExposure(
  ustn: string,
): Promise<FinancialExposureRow | null> {
  if (!ustn) return null;
  try {
    const row = await db.financialExposure.findUnique({
      where: { ustn },
    });
    return (row as FinancialExposureRow) || null;
  } catch (err) {
    logger.error("[financial-exposure] getExposure failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}
