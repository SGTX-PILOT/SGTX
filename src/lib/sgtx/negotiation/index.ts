// @ts-nocheck
/**
 * SGTX v13.1 — Article 129 E2E Trade Workflow — Stage 1: Negotiation
 * ===========================================================================
 *
 * Implements the buyer-seller back-and-forth on quote terms BEFORE a
 * PurchaseOrder is issued. Each round captures one party's proposal
 * (PRICE / TERMS / DELIVERY / PAYMENT / PACKAGING / OTHER) and the
 * counterparty's response (ACCEPTED / REJECTED / COUNTERED / PENDING).
 *
 * Lifecycle (per USTN):
 *
 *   Round 1 ──createNegotiation──▶ PENDING
 *        ──respondToNegotiation(ACCEPTED)──▶ ACCEPTED
 *        ──respondToNegotiation(REJECTED)──▶ REJECTED
 *        ──respondToNegotiation(COUNTERED)──▶ REJECTED + new round created
 *   Round 2 ──createNegotiation──▶ PENDING
 *        ──expireStaleNegotiations──▶ EXPIRED (if past expiresAt)
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes.
 *
 * NOTE: Tables may not exist in dev environments without `db:push`. Every
 * DB call is wrapped in try/catch and returns null/[] on failure so the API
 * layer can degrade gracefully.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Constants ============

export const PROPOSAL_TYPES = [
  "PRICE",
  "TERMS",
  "DELIVERY",
  "PAYMENT",
  "PACKAGING",
  "OTHER",
] as const;

export const NEGOTIATION_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;

export const RESPONSE_TYPES = [
  "ACCEPTED",
  "REJECTED",
  "COUNTERED",
  "PENDING",
] as const;

// ============ Types ============

export interface ProposalDetails {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  [key: string]: unknown;
}

export interface CounterDetails {
  field?: string;
  proposedValue?: unknown;
  reason?: string;
  [key: string]: unknown;
}

export interface CreateNegotiationInput {
  ustn: string;
  tradeId: string;
  proposedBy: string;
  proposalType: string;
  proposalDetails: ProposalDetails | string;
  expiresAt?: Date | string | null;
}

export interface RespondInput {
  id: string;
  response: string; // ACCEPTED | REJECTED | COUNTERED
  counterDetails?: CounterDetails | string | null;
}

export interface NegotiationRow {
  id: string;
  ustn: string;
  tradeId: string;
  round: number;
  proposedBy: string;
  proposalType: string;
  proposalDetails: string;
  counterpartyResponse: string | null;
  counterDetails: string | null;
  status: string;
  expiresAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ Helpers ============

function serializeProposal(
  proposalDetails: ProposalDetails | string,
): string {
  if (typeof proposalDetails === "string") return proposalDetails;
  try {
    return JSON.stringify(proposalDetails);
  } catch {
    return JSON.stringify({ raw: String(proposalDetails) });
  }
}

function serializeCounter(
  counterDetails: CounterDetails | string | null | undefined,
): string | null {
  if (!counterDetails) return null;
  if (typeof counterDetails === "string") return counterDetails;
  try {
    return JSON.stringify(counterDetails);
  } catch {
    return JSON.stringify({ raw: String(counterDetails) });
  }
}

function isValidProposalType(t: string): boolean {
  return (PROPOSAL_TYPES as readonly string[]).includes(t);
}

function isValidResponseType(r: string): boolean {
  return (RESPONSE_TYPES as readonly string[]).includes(r);
}

// ============ Public API ============

/**
 * Create a new negotiation round. Auto-computes the round number by
 * counting existing negotiations for the same USTN + 1. If the table
 * is missing (dev env without db:push), returns null gracefully.
 */
export async function createNegotiation(
  input: CreateNegotiationInput,
): Promise<NegotiationRow | null> {
  if (!input?.ustn || !input?.tradeId || !input?.proposedBy) {
    logger.warn("[negotiation/create] missing required input", { input });
    return null;
  }
  if (!isValidProposalType(input.proposalType)) {
    logger.warn("[negotiation/create] invalid proposalType", {
      proposalType: input.proposalType,
    });
    return null;
  }
  try {
    // Compute round number from existing negotiations for this USTN.
    let round = 1;
    try {
      const count = await db.tradeNegotiation.count({
        where: { ustn: input.ustn },
      });
      round = (count || 0) + 1;
    } catch (e: any) {
      logger.warn(
        "[negotiation/create] count failed (table missing?), defaulting to round 1",
        { ustn: input.ustn, error: e?.message },
      );
    }

    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      try {
        expiresAt =
          input.expiresAt instanceof Date
            ? input.expiresAt
            : new Date(input.expiresAt);
        if (isNaN(expiresAt.getTime())) expiresAt = null;
      } catch {
        expiresAt = null;
      }
    }

    const created = await db.tradeNegotiation.create({
      data: {
        ustn: input.ustn,
        tradeId: input.tradeId,
        round,
        proposedBy: input.proposedBy,
        proposalType: input.proposalType,
        proposalDetails: serializeProposal(input.proposalDetails),
        counterpartyResponse: "PENDING",
        counterDetails: null,
        status: "PENDING",
        expiresAt,
        resolvedAt: null,
      },
    });
    logger.info("[negotiation/create] created", {
      id: created.id,
      ustn: input.ustn,
      round,
    });
    return created as NegotiationRow;
  } catch (e: any) {
    logger.error("[negotiation/create] failed", {
      ustn: input?.ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Counterparty responds to a pending negotiation. If the response is
 * COUNTERED, the current negotiation is marked REJECTED (the counter
 * is recorded as counterDetails) and the caller is expected to issue a
 * new round via `createNegotiation`. ACCEPTED/REJECTED set the final
 * status and stamp `resolvedAt`.
 */
export async function respondToNegotiation(
  input: RespondInput,
): Promise<NegotiationRow | null> {
  if (!input?.id || !input?.response) {
    logger.warn("[negotiation/respond] missing id or response", { input });
    return null;
  }
  const response = String(input.response).toUpperCase();
  if (!isValidResponseType(response)) {
    logger.warn("[negotiation/respond] invalid response type", { response });
    return null;
  }
  try {
    const existing = await db.tradeNegotiation.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      logger.warn("[negotiation/respond] negotiation not found", {
        id: input.id,
      });
      return null;
    }
    if (existing.status !== "PENDING") {
      logger.warn(
        "[negotiation/respond] negotiation already resolved",
        { id: input.id, status: existing.status },
      );
      return existing as NegotiationRow;
    }

    // COUNTERED is internally modelled as REJECTED + counterDetails
    // (the next round captures the counter-proposal).
    const finalStatus =
      response === "ACCEPTED"
        ? "ACCEPTED"
        : response === "COUNTERED"
          ? "REJECTED"
          : "REJECTED";

    const updated = await db.tradeNegotiation.update({
      where: { id: input.id },
      data: {
        counterpartyResponse: response,
        counterDetails: serializeCounter(input.counterDetails),
        status: finalStatus,
        resolvedAt: new Date(),
      },
    });
    logger.info("[negotiation/respond] responded", {
      id: input.id,
      response,
      finalStatus,
    });
    return updated as NegotiationRow;
  } catch (e: any) {
    logger.error("[negotiation/respond] failed", {
      id: input?.id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * List negotiations — optionally filtered by USTN. Returns newest-first.
 * Defensive — returns [] on any DB error (including missing table).
 */
export async function listNegotiations(
  ustn?: string,
): Promise<NegotiationRow[]> {
  try {
    const where = ustn ? { ustn } : undefined;
    const rows = await db.tradeNegotiation.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows || []) as NegotiationRow[];
  } catch (e: any) {
    logger.error("[negotiation/list] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get the most-recent PENDING negotiation for a USTN. Returns null if
 * none exists, the table is missing, or the DB call fails.
 */
export async function getActiveNegotiation(
  ustn: string,
): Promise<NegotiationRow | null> {
  if (!ustn) return null;
  try {
    const row = await db.tradeNegotiation.findFirst({
      where: { ustn, status: "PENDING" },
      orderBy: [{ createdAt: "desc" }],
    });
    return (row as NegotiationRow) || null;
  } catch (e: any) {
    logger.error("[negotiation/active] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Get a single negotiation by id.
 */
export async function getNegotiation(
  id: string,
): Promise<NegotiationRow | null> {
  if (!id) return null;
  try {
    const row = await db.tradeNegotiation.findUnique({ where: { id } });
    return (row as NegotiationRow) || null;
  } catch (e: any) {
    logger.error("[negotiation/get] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Mark all PENDING negotiations whose `expiresAt` has passed as EXPIRED.
 * Returns the count of negotiations expired. Best-effort — on DB error
 * returns 0.
 */
export async function expireStaleNegotiations(): Promise<number> {
  try {
    const result = await db.tradeNegotiation.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      data: {
        status: "EXPIRED",
        counterpartyResponse: "REJECTED",
        resolvedAt: new Date(),
      },
    });
    const count = result?.count || 0;
    if (count > 0) {
      logger.info("[negotiation/expireStale] expired stale negotiations", {
        count,
      });
    }
    return count;
  } catch (e: any) {
    logger.error("[negotiation/expireStale] failed", {
      error: e?.message || String(e),
    });
    return 0;
  }
}
