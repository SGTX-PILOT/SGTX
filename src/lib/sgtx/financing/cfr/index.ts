// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §7 — CFR (Capital Financing Readiness) library
// ═══════════════════════════════════════════════════════════════════════════════
//
// Two-phase financing workflow per v17 Section 7:
//   Phase A — Pre-Clearance (before contract lock):
//     1. Borrower requests a Conditional Financing Reference (CFR) from a
//        financier. The platform compiles a privacy-preserving Trade Digest.
//     2. Financier reviews the digest + borrower Trust Passport.
//     3. Financier issues (conditional approval) OR rejects the CFR.
//     4. The CFR has a 90-day validity window from issue.
//   Phase B — Formal Execution (after contract lock):
//     5. Borrower exercises the CFR; the platform converts it to a formal
//        FinancingRequest once the contract is locked.
//
// Governor gates (Section 15.3):
//   G3U12 — If buyer financing is required, a valid CFR must be issued BEFORE
//           the contract can be locked.
//   G3U13 — The CFR must remain valid (not expired, not rejected, not yet
//           executed) at contract-lock time.
//
// Schema notes (do NOT modify prisma/schema.prisma):
//   `FinancingPreClearanceRequest` columns:
//     id, tradeRequestId, sellerQuoteId, borrowerGtid, financierGtid,
//     financierType, tradeDigest (JSON string), status, cfrReference,
//     conditionalAmountMax (Float), conditionalApr (Float), conditions (String),
//     validityUntil (DateTime, default now()), respondedAt (DateTime?),
//     createdAt.
//   We extend the row using the existing free-text `conditions` column as a
//   JSON-encoded payload (CfrMetadata below) for the fields the v17 spec adds
//   that have no dedicated column (tenorDays, collateralRequired,
//   noteToBorrower, rejectionReason, executedAt, financingRequestId,
//   issuedAt, reviewedAt, contractLockEvidence, etc.).
//
// NON-MARKETPLACE: this library never produces financier rankings, scores,
// or alternative-counterparty suggestions. It answers the binary questions:
//   • Is this CFR request well-formed?
//   • Is this CFR still valid?
//   • Can this CFR be converted to a formal FinancingRequest?

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  generateRequestId,
  FINANCING_TYPE_LABELS,
} from "@/lib/sgtx/financing";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** CFR validity window after issue (v17 §7 — 90 days). */
export const CFR_VALIDITY_DAYS = 90;

/** Valid status transitions for a FinancingPreClearanceRequest. */
export const CFR_STATUSES = {
  REQUESTED: "REQUESTED",   // borrower created the request, financier has not yet acted
  REVIEWED: "REVIEWED",    // financier opened the request and reviewed the digest
  ISSUED: "ISSUED",        // financier issued the conditional approval (CFR live)
  REJECTED: "REJECTED",    // financier rejected the request (mandatory reason)
  EXPIRED: "EXPIRED",      // validity window elapsed without execution
  EXECUTED: "EXECUTED",    // Phase B conversion completed → FinancingRequest created
} as const;

export type CfrStatus = (typeof CFR_STATUSES)[keyof typeof CFR_STATUSES];

/** Financier tenant types that may receive a CFR request. */
export const FINANCIER_TYPES = ["BANK", "PFI"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Privacy-preserving Trade Digest compiled from the trade record. */
export interface TradeDigest {
  commodity: string | null;
  hsCode: string | null;
  quantity: number | null;
  incoterm: string | null;
  origin: string | null;
  destination: string | null;
  transportMode: string | null;
  estimatedValue: number | null;
  currency: string | null;
  /** Masked counterparty names — first 3 chars + "***". */
  buyerMasked: string | null;
  sellerMasked: string | null;
  /** Borrower-side requested financing envelope (no sensitive terms yet). */
  financingAmountRequested: number | null;
  tenorDaysRequested: number | null;
  collateralType: string | null;
}

/** Extended metadata persisted in the `conditions` column as JSON. */
export interface CfrMetadata {
  // Issuance fields
  conditions: string[];
  aprIndicative: number | null;
  maxAmount: number | null;
  tenorDays: number | null;
  collateralRequired: string | null;
  noteToBorrower: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  // Rejection fields
  rejectionReason: string | null;
  rejectedAt: string | null;
  // Execution (Phase B)
  executedAt: string | null;
  financingRequestId: string | null;
  contractLockEvidence: string | null;
  // Review
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export function emptyCfrMetadata(): CfrMetadata {
  return {
    conditions: [],
    aprIndicative: null,
    maxAmount: null,
    tenorDays: null,
    collateralRequired: null,
    noteToBorrower: null,
    issuedAt: null,
    expiresAt: null,
    rejectionReason: null,
    rejectedAt: null,
    executedAt: null,
    financingRequestId: null,
    contractLockEvidence: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

export function parseCfrMetadata(raw: string | null | undefined): CfrMetadata {
  if (!raw) return emptyCfrMetadata();
  try {
    const parsed = JSON.parse(raw);
    return { ...emptyCfrMetadata(), ...parsed };
  } catch {
    // Legacy rows stored plain-text conditions — wrap them as a single-item array.
    return { ...emptyCfrMetadata(), conditions: [String(raw)] };
  }
}

export function stringifyCfrMetadata(meta: CfrMetadata): string {
  return JSON.stringify(meta);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mask a counterparty legal name per v17 §7 privacy rules:
 * first 3 characters + "***". Returns null when the name is missing.
 */
export function maskCounterpartyName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (trimmed.length === 0) return null;
  return trimmed.substring(0, 3) + "***";
}

/**
 * Compute the CFR expiry timestamp — `issuedAt` + 90 days.
 * Used by `issue` and `validateCfrValidity`.
 */
export function getCfrExpiryDate(issuedAt: Date | string | number): Date {
  const base = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  const expiry = new Date(base.getTime() + CFR_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return expiry;
}

/**
 * Generate a unique CFR reference id of the form
 *   CFR-<yyyyMMddHHmmss>-<6-char base32>
 */
export function generateCfrReference(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const ts =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CFR-${ts}-${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// compileTradeDigest — privacy-preserving summary of the trade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile a privacy-preserving Trade Digest for a given trade request id.
 *
 * Per v17 §7:
 *   • Mask counterparty legal names (first 3 chars + "***").
 *   • No sensitive financial details (APR, collateral specifics, fees) are
 *     exposed until the financier accepts the request.
 *
 * Returns a digest with null fields when the trade is not found, so the caller
 * can still create a CFR with a partial digest if needed.
 */
export async function compileTradeDigest(
  tradeRequestId: string,
): Promise<TradeDigest> {
  if (!tradeRequestId) {
    return {
      commodity: null, hsCode: null, quantity: null, incoterm: null,
      origin: null, destination: null, transportMode: null,
      estimatedValue: null, currency: null,
      buyerMasked: null, sellerMasked: null,
      financingAmountRequested: null, tenorDaysRequested: null,
      collateralType: null,
    };
  }

  const trade = await db.trade.findUnique({
    where: { id: tradeRequestId },
    include: { buyer: true, seller: true },
  });

  if (!trade) {
    logger.warn("cfr.compileTradeDigest: trade not found", { tradeRequestId });
    return {
      commodity: null, hsCode: null, quantity: null, incoterm: null,
      origin: null, destination: null, transportMode: null,
      estimatedValue: null, currency: null,
      buyerMasked: null, sellerMasked: null,
      financingAmountRequested: null, tenorDaysRequested: null,
      collateralType: null,
    };
  }

  // Borrower-side requested financing envelope — surfaced only as the
  // *requested* amount and tenor, never the financier's indicative terms.
  const financingAmountRequested =
    typeof trade.tradeValueUsd === "number" && trade.tradeValueUsd > 0
      ? trade.tradeValueUsd
      : null;
  const tenorDaysRequested =
    typeof trade.transitTimeDays === "number" && trade.transitTimeDays > 0
      ? trade.transitTimeDays
      : null;
  const collateralType = trade.settlementStructure || null;

  return {
    commodity: trade.commodity || null,
    hsCode: trade.commodityHs || null,
    quantity:
      typeof trade.grossWeightKg === "number" && trade.grossWeightKg > 0
        ? trade.grossWeightKg
        : null,
    incoterm: trade.incoterm || null,
    origin: trade.originCountry || null,
    destination: trade.destCountry || null,
    transportMode: trade.transportMode || null,
    estimatedValue:
      typeof trade.tradeValueUsd === "number" && trade.tradeValueUsd > 0
        ? trade.tradeValueUsd
        : null,
    currency: trade.currency || null,
    buyerMasked: maskCounterpartyName(trade.buyer?.legalName),
    sellerMasked: maskCounterpartyName(trade.seller?.legalName),
    financingAmountRequested,
    tenorDaysRequested,
    collateralType,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateCfrRequest — G3U12 gate (pre-contract-lock)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * G3U12 gate — validate that a CFR request is well-formed before the contract
 * is locked. Per v17 §7 + §15.3:
 *
 *   • `buyerFinancingRequired` must be `true` on the trade (otherwise a CFR
 *     is not needed for this trade).
 *   • The referenced trade must exist.
 *   • The financier tenant must be of type BANK or PFI.
 *
 * Returns `{ valid: true }` or `{ valid: false, errors: [...] }`.
 *
 * NOTE: this function does NOT enforce that the CFR has been issued — that
 * is the role of `validateCfrBeforeContractLock` in gates-cfr.ts, which
 * composes this check with the issued-state check.
 */
export async function validateCfrRequest(input: {
  tradeRequestId?: string | null;
  borrowerGtid: string;
  financierGtid: string;
}): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!input.borrowerGtid) errors.push("borrowerGtid is required.");
  if (!input.financierGtid) errors.push("financierGtid is required.");
  if (!input.tradeRequestId) errors.push("tradeRequestId is required.");

  if (errors.length > 0) return { valid: false, errors };

  // Trade must exist and have buyerFinancingRequired=true
  const trade = await db.trade.findUnique({
    where: { id: input.tradeRequestId! },
  });
  if (!trade) {
    errors.push(`Trade ${input.tradeRequestId} not found.`);
    return { valid: false, errors };
  }
  if (trade.buyerFinancingRequired !== true) {
    errors.push(
      "Trade does not require buyer financing (buyerFinancingRequired=false) — CFR not required.",
    );
  }
  if (trade.buyerGtid !== input.borrowerGtid) {
    errors.push("Borrower GTID does not match the trade's buyer — only the buyer may request a CFR.");
  }

  // Financier must be BANK or PFI
  const financier = await db.tenant.findUnique({
    where: { gtid: input.financierGtid },
  });
  if (!financier) {
    errors.push(`Financier ${input.financierGtid} not found.`);
  } else if (!FINANCIER_TYPES.includes(financier.type as any)) {
    errors.push(
      `Selected tenant ${financier.legalName} is not a financier (type=${financier.type}); only BANK or PFI may receive a CFR request.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateCfrValidity — G3U13 gate (at contract-lock time)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * G3U13 gate — validate that a CFR is still valid at contract-lock time.
 *
 * A CFR is valid when ALL of the following hold:
 *   1. The CFR row exists.
 *   2. The CFR status is "ISSUED".
 *   3. The current time is on or before `validityUntil` (issued_at + 90 days).
 *   4. The CFR has not yet been executed (no financingRequestId).
 *
 * Returns:
 *   `{ valid: true, status, expiresAt, daysRemaining }`
 *   `{ valid: false, reason, status, expiresAt, daysRemaining }`
 */
export async function validateCfrValidity(
  cfrId: string,
): Promise<{
  valid: boolean;
  reason?: string;
  status: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  cfr?: any;
}> {
  if (!cfrId) {
    return {
      valid: false,
      reason: "cfrId is required.",
      status: null,
      expiresAt: null,
      daysRemaining: 0,
    };
  }

  const cfr = await db.financingPreClearanceRequest.findUnique({
    where: { id: cfrId },
  });

  if (!cfr) {
    return {
      valid: false,
      reason: `CFR ${cfrId} not found.`,
      status: null,
      expiresAt: null,
      daysRemaining: 0,
    };
  }

  const meta = parseCfrMetadata(cfr.conditions);
  // The canonical expiry is the `validityUntil` column (set at issue time).
  const expiresAt =
    cfr.validityUntil instanceof Date
      ? cfr.validityUntil
      : meta.expiresAt
        ? new Date(meta.expiresAt)
        : null;

  const now = Date.now();
  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)))
    : 0;

  if (cfr.status === CFR_STATUSES.REJECTED) {
    return {
      valid: false,
      reason: `CFR was rejected by the financier${meta.rejectionReason ? `: ${meta.rejectionReason}` : "."}`,
      status: cfr.status,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining: 0,
      cfr,
    };
  }
  if (cfr.status === CFR_STATUSES.EXPIRED) {
    return {
      valid: false,
      reason: "CFR validity window has elapsed.",
      status: cfr.status,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining: 0,
      cfr,
    };
  }
  if (cfr.status === CFR_STATUSES.EXECUTED) {
    return {
      valid: false,
      reason: "CFR has already been executed (converted to a formal Financing Request).",
      status: cfr.status,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining: 0,
      cfr,
    };
  }
  if (cfr.status !== CFR_STATUSES.ISSUED) {
    return {
      valid: false,
      reason: `CFR status is ${cfr.status}; must be ISSUED to be valid at contract lock.`,
      status: cfr.status,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining,
      cfr,
    };
  }
  if (!expiresAt || now > expiresAt.getTime()) {
    // Auto-mark as EXPIRED so future checks short-circuit.
    await db.financingPreClearanceRequest
      .update({
        where: { id: cfr.id },
        data: { status: CFR_STATUSES.EXPIRED },
      })
      .catch(() => {
        /* non-fatal */
      });
    return {
      valid: false,
      reason: "CFR validity window has elapsed (90 days from issue).",
      status: CFR_STATUSES.EXPIRED,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining: 0,
      cfr,
    };
  }

  return {
    valid: true,
    status: cfr.status,
    expiresAt: expiresAt.toISOString(),
    daysRemaining,
    cfr,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// convertCfrToFinancingRequest — Phase B conversion (after contract lock)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Phase B — convert an ISSUED CFR into a formal FinancingRequest.
 *
 * Preconditions (validated):
 *   • CFR is valid (G3U13 — `validateCfrValidity` returns valid=true).
 *   • The associated trade is LOCKED (or past LOCKED — IN_EXECUTION / SETTLED).
 *   • The trade's `buyerFinancingRequired` flag is still `true`.
 *   • `contractLockEvidence` is supplied (hash, signature reference, or
 *     document id proving the contract has been locked).
 *
 * Side effects:
 *   • Creates a FinancingRequest row seeded from the CFR's issued terms
 *     (maxAmount, aprIndicative, tenorDays, collateralRequired).
 *   • Marks the CFR as EXECUTED, stores `executedAt`, `financingRequestId`,
 *     and `contractLockEvidence` in the metadata JSON.
 *
 * Returns `{ financingRequestId }` on success or throws on validation failure.
 */
export async function convertCfrToFinancingRequest(
  cfrId: string,
  contractLockEvidence: string,
): Promise<{ financingRequestId: string; financingRequestInternalId: string }> {
  if (!cfrId) throw new Error("cfrId is required.");
  if (!contractLockEvidence || String(contractLockEvidence).trim().length === 0) {
    throw new Error("contractLockEvidence is required (hash or reference proving contract lock).");
  }

  const validity = await validateCfrValidity(cfrId);
  if (!validity.valid) {
    throw new Error(`CFR not valid for execution: ${validity.reason}`);
  }

  const cfr = validity.cfr;
  const meta = parseCfrMetadata(cfr.conditions);

  // Trade must exist and be LOCKED
  if (!cfr.tradeRequestId) {
    throw new Error("CFR has no associated trade — cannot convert to a formal Financing Request.");
  }
  const trade = await db.trade.findUnique({
    where: { id: cfr.tradeRequestId },
  });
  if (!trade) {
    throw new Error(`Trade ${cfr.tradeRequestId} not found.`);
  }
  const ALLOWED = ["LOCKED", "IN_EXECUTION", "SETTLED", "CONTRACT_SIGNED"];
  if (!ALLOWED.includes(trade.status)) {
    throw new Error(
      `Trade status is ${trade.status}; contract must be LOCKED before the CFR can be executed.`,
    );
  }
  if (trade.buyerFinancingRequired !== true) {
    throw new Error(
      "Trade no longer requires buyer financing (buyerFinancingRequired=false) — CFR cannot be executed.",
    );
  }

  // Borrower must still be the trade's buyer
  if (trade.buyerGtid !== cfr.borrowerGtid) {
    throw new Error("CFR borrower does not match the trade's buyer — cannot execute.");
  }

  // Pull issued terms from the metadata (fall back to the legacy columns).
  const amountUsd = meta.maxAmount ?? cfr.conditionalAmountMax ?? trade.tradeValueUsd ?? 0;
  const aprIndicative = meta.aprIndicative ?? cfr.conditionalApr;
  const tenorDays = meta.tenorDays ?? 30;
  const collateralType = meta.collateralRequired ?? "GOODS";

  // Generate a formal FinancingRequest id (FR-yyyyMMdd-NNN).
  const requestId = generateRequestId();

  const financingRequest = await db.financingRequest.create({
    data: {
      requestId,
      tradeId: trade.id,
      borrowerGtid: cfr.borrowerGtid,
      shipmentSeq: null,
      ustn: trade.ustn,
      amountUsd: +amountUsd,
      totalTradeValue: trade.tradeValueUsd,
      financingType: "POST_SHIPMENT",
      tenorDays: +tenorDays,
      preferredSettlement: "BANK_TRANSFER",
      preferredCurrency: trade.currency || "USD",
      collateralType,
      specialInstructions:
        (meta.noteToBorrower || cfr.conditions || "").toString() || null,
      recommendedLtv: 75,
      status: "RFQ_BROADCAST",
      blendedApr: aprIndicative,
      feeUsd: +(amountUsd * 0.0025).toFixed(2),
      feeLockStatus: "PENDING",
      creditIntelligence: JSON.stringify({
        source: "cfr",
        cfrId: cfr.id,
        cfrReference: cfr.cfrReference,
        contractLockEvidence,
        issuedAt: meta.issuedAt,
        expiresAt: meta.expiresAt,
      }),
    },
  });

  // Mark CFR as executed
  const executedAt = new Date();
  const updatedMeta: CfrMetadata = {
    ...meta,
    executedAt: executedAt.toISOString(),
    financingRequestId: financingRequest.id,
    contractLockEvidence: String(contractLockEvidence),
  };
  await db.financingPreClearanceRequest.update({
    where: { id: cfr.id },
    data: {
      status: CFR_STATUSES.EXECUTED,
      respondedAt: executedAt,
      conditions: stringifyCfrMetadata(updatedMeta),
    },
  });

  logger.info("cfr.converted", {
    cfrId: cfr.id,
    financingRequestId: financingRequest.id,
    tradeId: trade.id,
    borrowerGtid: cfr.borrowerGtid,
  });

  return {
    financingRequestId: financingRequest.requestId,
    financingRequestInternalId: financingRequest.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Borrower Trust Passport summary (for the financier review endpoint)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile a borrower-side "Trust Passport" summary suitable for sharing with
 * a financier during CFR review. The summary is privacy-preserving:
 *   • Includes trust score, KYB tier, sanctions clearance, country, sector.
 *   • Excludes bank account details, UBO identities, raw financials.
 */
export async function getBorrowerTrustPassport(borrowerGtid: string): Promise<{
  gtid: string;
  legalName: string;
  country: string;
  sector: string | null;
  type: string;
  kybTier: number;
  kybStatus: string | null;
  trustScore: number;
  trustConfidence: number | null;
  sanctionsCleared: boolean;
  pepStatus: string | null;
  lifecycleState: string;
  tradeCount: number;
  settledTrades: number;
  disputeRate: number | null;
}> {
  const borrower = await db.tenant.findUnique({
    where: { gtid: borrowerGtid },
  });
  if (!borrower) {
    return {
      gtid: borrowerGtid,
      legalName: "Unknown",
      country: "Unknown",
      sector: null,
      type: "UNKNOWN",
      kybTier: 0,
      kybStatus: null,
      trustScore: 0,
      trustConfidence: null,
      sanctionsCleared: false,
      pepStatus: null,
      lifecycleState: "UNKNOWN",
      tradeCount: 0,
      settledTrades: 0,
      disputeRate: null,
    };
  }

  // Lightweight trade performance summary (no PII, no financial figures).
  const [asBuyer, asSeller, disputes] = await Promise.all([
    db.trade.findMany({
      where: { buyerGtid: borrowerGtid },
      select: { id: true, status: true },
    }),
    db.trade.findMany({
      where: { sellerGtid: borrowerGtid },
      select: { id: true, status: true },
    }),
    db.dispute.findMany({
      where: { filedByGtid: borrowerGtid },
      select: { id: true, status: true },
    }),
  ]);

  const tradeCount = asBuyer.length + asSeller.length;
  const settledTrades =
    asBuyer.filter((t) => t.status === "SETTLED").length +
    asSeller.filter((t) => t.status === "SETTLED").length;
  const disputeRate =
    tradeCount > 0 ? +(disputes.length / tradeCount).toFixed(3) : null;

  return {
    gtid: borrower.gtid,
    legalName: borrower.legalName,
    country: borrower.country,
    sector: borrower.sector || null,
    type: borrower.type,
    kybTier: borrower.kybTier,
    kybStatus: borrower.kybStatus,
    trustScore: borrower.trustScore,
    trustConfidence: borrower.trustConfidence,
    sanctionsCleared: borrower.sanctionsCleared,
    pepStatus: borrower.pepStatus,
    lifecycleState: borrower.lifecycleState,
    tradeCount,
    settledTrades,
    disputeRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public re-exports (labels) — used by the route handlers
// ─────────────────────────────────────────────────────────────────────────────

export { FINANCING_TYPE_LABELS };
