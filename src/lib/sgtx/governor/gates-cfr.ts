// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §7 + §15.3 — Governor gates G3U12 + G3U13 (CFR / Capital Financing
// Readiness)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Two gates enforce the CFR workflow at contract-lock time:
//
//   G3U12 — If buyer financing is required (`trade.buyerFinancingRequired=true`),
//           a valid CFR must be ISSUED before the contract can be locked.
//           Returns DENY when buyer financing is required but no ISSUED CFR
//           exists for the trade; returns ALLOW when buyer financing is not
//           required (CFR is optional).
//
//   G3U13 — At contract-lock time, the supplied CFR must still be valid:
//           not expired (90-day window), not rejected, not yet executed.
//           This gate composes `validateCfrValidity` from the CFR lib.
//
// Both gates are ASYNC because they query the database to find the latest CFR
// for the trade and verify its state. They never throw — they degrade
// gracefully to DENY for hard failures and CONDITIONAL for ambiguous input.
//
// NON-MARKETPLACE: these gates never produce financier rankings, scores, or
// alternative-counterparty suggestions. They answer the binary "may the
// contract be locked?" question for the CFR axis only.

import { db } from "@/lib/db";
import {
  CFR_STATUSES,
  validateCfrValidity,
} from "@/lib/sgtx/financing/cfr";

// ============ Types (re-use the Phase 2 verdict interface) ============

export type GateVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface GateResult {
  gateId: string;
  verdict: GateVerdict;
  conditions: string[];
}

/** Loose input shape — accepts either a Prisma Trade row or a compatible plain object. */
export interface TradeLike {
  id?: string;
  ustn?: string;
  buyerGtid?: string;
  buyerFinancingRequired?: boolean;
  status?: string;
}

// ============ Helpers ============

function allow(gateId: string): GateResult {
  return { gateId, verdict: "ALLOW", conditions: [] };
}

function conditional(gateId: string, ...conditions: string[]): GateResult {
  return { gateId, verdict: "CONDITIONAL", conditions: conditions.filter(Boolean) };
}

function deny(gateId: string, ...conditions: string[]): GateResult {
  return { gateId, verdict: "DENY", conditions: conditions.filter(Boolean) };
}

/**
 * Find the most recent FinancingPreClearanceRequest row for a given trade,
 * regardless of status. Returns null when no CFR exists yet.
 */
async function findLatestCfrForTrade(tradeId: string): Promise<any | null> {
  if (!tradeId) return null;
  try {
    const rows = await db.financingPreClearanceRequest.findMany({
      where: { tradeRequestId: tradeId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ============ G3U12 — CFR issued before contract lock ============

/**
 * G3U12 — validate that a valid CFR has been issued before the contract can
 * be locked, IF the trade requires buyer financing.
 *
 * Decision matrix:
 *   • `buyerFinancingRequired=false` → ALLOW (CFR is optional).
 *   • `buyerFinancingRequired=true` and no CFR row exists → DENY.
 *   • `buyerFinancingRequired=true` and CFR row exists but status is
 *     REQUESTED/REVIEWED → DENY (CFR must be ISSUED before lock).
 *   • `buyerFinancingRequired=true` and CFR status is REJECTED → DENY
 *     (borrower must reapply to a different financier).
 *   • `buyerFinancingRequired=true` and CFR status is EXPIRED → DENY
 *     (borrower must obtain a fresh CFR).
 *   • `buyerFinancingRequired=true` and CFR status is EXECUTED → CONDITIONAL
 *     (the CFR has already been converted to a formal FinancingRequest; this
 *     is unusual at contract-lock time but not strictly forbidden — flag for
 *     human review).
 *   • `buyerFinancingRequired=true` and CFR status is ISSUED and within the
 *     90-day validity window → ALLOW.
 */
export async function validateCfrBeforeContractLock(
  trade: TradeLike,
): Promise<GateResult> {
  if (!trade || !trade.id) {
    return conditional("G3U12", "Trade context not supplied — CFR eligibility cannot be validated.");
  }

  // CFR is only required when the buyer has flagged financing need.
  if (trade.buyerFinancingRequired !== true) {
    return allow("G3U12");
  }

  const cfr = await findLatestCfrForTrade(trade.id);
  if (!cfr) {
    return deny(
      "G3U12",
      "Trade requires buyer financing (buyerFinancingRequired=true) but no Conditional Financing Reference (CFR) has been requested. Obtain a CFR from a financier before locking the contract.",
    );
  }

  switch (cfr.status) {
    case CFR_STATUSES.ISSUED: {
      // Re-use G3U13 to confirm the issued CFR is still within its validity
      // window (this is the G3U12 → G3U13 composition).
      const validity = await validateCfrValidity(cfr.id);
      if (!validity.valid) {
        return deny(
          "G3U12",
          `A CFR was issued for this trade but is no longer valid: ${validity.reason} Obtain a fresh CFR before locking the contract.`,
        );
      }
      if (validity.daysRemaining <= 7) {
        return conditional(
          "G3U12",
          `CFR ${cfr.cfrReference || cfr.id} is valid but expires in ${validity.daysRemaining} day(s). Consider locking the contract soon or applying for a renewal.`,
        );
      }
      return allow("G3U12");
    }
    case CFR_STATUSES.REQUESTED:
    case CFR_STATUSES.REVIEWED:
      return deny(
        "G3U12",
        `CFR for this trade is still in state ${cfr.status} — the financier must ISSUE the CFR before the contract can be locked.`,
      );
    case CFR_STATUSES.REJECTED:
      return deny(
        "G3U12",
        "The CFR for this trade was rejected by the financier. Reapply with a different financier or address the rejection feedback before locking the contract.",
      );
    case CFR_STATUSES.EXPIRED:
      return deny(
        "G3U12",
        "The CFR for this trade has expired (90-day validity window elapsed). Obtain a fresh CFR before locking the contract.",
      );
    case CFR_STATUSES.EXECUTED:
      return conditional(
        "G3U12",
        "The CFR for this trade has already been EXECUTED (converted to a formal FinancingRequest). This is unusual at contract-lock time — flag for human review.",
      );
    default:
      return conditional(
        "G3U12",
        `CFR for this trade is in unknown state ${cfr.status}. Resolve before locking the contract.`,
      );
  }
}

// ============ G3U13 — CFR validity at contract lock ============

/**
 * G3U13 — validate that a specific CFR is still valid at contract-lock
 * time. This gate is the direct composition of `validateCfrValidity` from
 * the CFR lib, but it returns the standard { gateId, verdict, conditions }
 * shape so it can be merged with other Governor gates.
 *
 * Call this gate with the CFR id the borrower has selected to exercise
 * at contract lock. If no CFR id is supplied but the trade requires buyer
 * financing, the gate returns DENY (you cannot contract-lock a
 * financing-required trade without identifying a CFR).
 */
export async function validateCfrValidityAtContractLock(
  cfrId: string | null | undefined,
  trade?: TradeLike,
): Promise<GateResult> {
  // If no CFR id supplied, defer to G3U12's eligibility check.
  if (!cfrId) {
    if (trade && trade.buyerFinancingRequired === true) {
      return deny(
        "G3U13",
        "Trade requires buyer financing but no CFR id was supplied for contract-lock validation. Identify the CFR to exercise before locking the contract.",
      );
    }
    return allow("G3U13"); // CFR not required for this trade.
  }

  const validity = await validateCfrValidity(cfrId);
  if (validity.valid) {
    if (validity.daysRemaining <= 7) {
      return conditional(
        "G3U13",
        `CFR ${cfrId} is valid but expires in ${validity.daysRemaining} day(s). Lock the contract soon to avoid expiry.`,
      );
    }
    return allow("G3U13");
  }

  return deny(
    "G3U13",
    `CFR ${cfrId} is not valid at contract-lock time: ${validity.reason}`,
  );
}

// ============ Convenience: run both CFR gates for a contract-lock attempt ============

/**
 * Run both G3U12 and G3U13 for a contract-lock attempt and merge the
 * verdicts (DENY > CONDITIONAL > ALLOW).
 *
 * Call this from the contract-lock handler with:
 *   • `trade` — the Trade row being locked.
 *   • `cfrId` — the CFR id the borrower is exercising (null/undefined when
 *     buyer financing is not required).
 */
export async function validateCfrGatesForContractLock(
  trade: TradeLike,
  cfrId?: string | null,
): Promise<{
  verdict: GateVerdict;
  conditions: string[];
  gates: GateResult[];
}> {
  const [g3u12, g3u13] = await Promise.all([
    validateCfrBeforeContractLock(trade),
    validateCfrValidityAtContractLock(cfrId, trade),
  ]);
  const gates = [g3u12, g3u13];

  const VERDICT_RANK: Record<GateVerdict, number> = {
    ALLOW: 0, CONDITIONAL: 1, DENY: 2,
  };
  let merged: GateVerdict = "ALLOW";
  const conditions: string[] = [];
  for (const g of gates) {
    if (VERDICT_RANK[g.verdict] > VERDICT_RANK[merged]) {
      merged = g.verdict;
    }
    if (g.verdict !== "ALLOW") {
      conditions.push(...g.conditions);
    }
  }
  return { verdict: merged, conditions, gates };
}
