// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §10.23-10.24 — Co-financing: borrower accepts multiple bids.
// POST /api/sgtx/financing/co-financing/accept
//   body: { financing_request_id, accepted_bid_ids: string[], borrower_gtid? }
//
// Validates:
//   • All accepted bids exist + belong to the financing request
//   • All bids are in SUBMITTED status
//   • Sum of accepted bid amounts ≤ total requested amount P
//   • All bids were submitted within the bidding window
//
// Returns: { co_financing_id, total_amount, blended_apr, accepted_bids }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import {
  validateCoFinancing,
  calculateBlendedApr,
  deriveFinancierPrivateKey,
  decryptBid,
} from "@/lib/sgtx/financing/co-financing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const financingRequestId = body?.financing_request_id || body?.financingRequestId;
    const acceptedBidIds: string[] = body?.accepted_bid_ids || body?.acceptedBidIds || [];
    const borrowerGtid =
      body?.borrower_gtid ||
      body?.borrowerGtid ||
      req.headers.get("x-tenant-gtid") ||
      "";

    if (!financingRequestId) {
      return NextResponse.json(
        { error: "financing_request_id is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(acceptedBidIds) || acceptedBidIds.length === 0) {
      return NextResponse.json(
        { error: "accepted_bid_ids must be a non-empty array" },
        { status: 400 },
      );
    }

    const financingRequest = await db.financingRequest.findUnique({
      where: { id: financingRequestId },
      include: {
        bids: true,
        borrower: true,
        trade: true,
      },
    });
    if (!financingRequest) {
      return NextResponse.json(
        { error: "Financing request not found" },
        { status: 404 },
      );
    }

    // Borrower identity check (x-tenant-gtid from middleware OR body)
    if (borrowerGtid && financingRequest.borrowerGtid !== borrowerGtid) {
      return NextResponse.json(
        { error: "Only the borrower of this financing request can accept bids" },
        { status: 403 },
      );
    }

    // Resolve accepted bids (by bidId, since the API contract uses bidId strings)
    const acceptedBids = financingRequest.bids.filter((b) =>
      acceptedBidIds.includes(b.bidId),
    );
    if (acceptedBids.length !== acceptedBidIds.length) {
      const foundIds = new Set(acceptedBids.map((b) => b.bidId));
      const missing = acceptedBidIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        {
          error: `Some accepted_bid_ids not found in financing request: ${missing.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate co-financing rules (sum ≤ P, all SUBMITTED, within window)
    const validation = validateCoFinancing(
      acceptedBids.map((b) => ({
        bidId: b.bidId,
        amount: b.amountOffered,
        status: b.status,
        submittedAt: b.createdAt,
      })),
      financingRequest.amountUsd,
      financingRequest.biddingWindowEndsAt,
    );
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Co-financing validation failed", errors: validation.errors },
        { status: 400 },
      );
    }

    // Decrypt each accepted bid's encrypted payload (the financier's "private
    // key" is derived from their GTID — see lib header for the simulation
    // disclaimer). We surface the decrypted bid terms in the response so the
    // borrower can see what they're accepting. If the bid has no
    // encryptedPayload (legacy / submitted via /api/sgtx/financing/bid which
    // used the lossy stub), fall back to the stored columns.
    const decryptedAcceptedBids = acceptedBids.map((b) => {
      if (b.encryptedPayload) {
        try {
          const priv = deriveFinancierPrivateKey(b.financierGtid);
          const decrypted = decryptBid(b.encryptedPayload, priv);
          return {
            bidId: b.bidId,
            financierGtid: b.financierGtid,
            amount: decrypted.amountOffered ?? b.amountOffered,
            apr: decrypted.apr ?? b.apr,
            settlementMethod: decrypted.settlementMethod ?? b.settlementMethod,
            collateralRequired: decrypted.collateralRequired ?? b.collateralRequired,
            conditions: decrypted.conditions ?? b.conditions,
            noteToBorrower: decrypted.noteToBorrower ?? b.noteToBorrower,
            isDeFi: decrypted.isDeFi ?? b.isDeFi,
            deFiProtocol: decrypted.deFiProtocol ?? b.deFiProtocol,
            decryptedFromPayload: true,
          };
        } catch (e) {
          // Fall back to stored columns
          return {
            bidId: b.bidId,
            financierGtid: b.financierGtid,
            amount: b.amountOffered,
            apr: b.apr,
            settlementMethod: b.settlementMethod,
            collateralRequired: b.collateralRequired,
            conditions: b.conditions,
            noteToBorrower: b.noteToBorrower,
            isDeFi: b.isDeFi,
            deFiProtocol: b.deFiProtocol,
            decryptedFromPayload: false,
            decryptError: e?.message || "decrypt_failed",
          };
        }
      }
      return {
        bidId: b.bidId,
        financierGtid: b.financierGtid,
        amount: b.amountOffered,
        apr: b.apr,
        settlementMethod: b.settlementMethod,
        collateralRequired: b.collateralRequired,
        conditions: b.conditions,
        noteToBorrower: b.noteToBorrower,
        isDeFi: b.isDeFi,
        deFiProtocol: b.deFiProtocol,
        decryptedFromPayload: false,
      };
    });

    // Compute blended APR
    const blended = calculateBlendedApr(
      decryptedAcceptedBids.map((b) => ({ amount: b.amount, apr: b.apr })),
    );

    // Mark accepted bids as ACCEPTED, others as REJECTED
    for (const b of acceptedBids) {
      await db.financingBid.update({
        where: { id: b.id },
        data: { status: "ACCEPTED" },
      });
    }
    const rejectedBids = financingRequest.bids.filter(
      (b) => !acceptedBidIds.includes(b.bidId) && b.status === "SUBMITTED",
    );
    for (const b of rejectedBids) {
      await db.financingBid.update({
        where: { id: b.id },
        data: { status: "REJECTED" },
      });
    }

    // Update the financing request with the blended APR + AGREEEMENT_PENDING
    await db.financingRequest.update({
      where: { id: financingRequestId },
      data: {
        status: "AGREEMENT_PENDING",
        blendedApr: blended.blendedApr,
      },
    });

    // Notify each accepted financier
    for (const b of acceptedBids) {
      try {
        await db.inboxItem.create({
          data: {
            tenantGtid: b.financierGtid,
            tradeId: financingRequest.tradeId,
            category: "NEEDS_SIGNATURE",
            priority: 95,
            title: `Co-financing bid accepted — ${b.bidId}`,
            description: `Your bid on financing request ${financingRequest.requestId} was accepted by ${financingRequest.borrower?.legalName || "the borrower"}. Master agreement + annex pending assembly.`,
            ctaLabel: "View Co-Financing",
          },
        });
      } catch (_) { /* inbox write is best-effort */ }
    }

    return NextResponse.json({
      ok: true,
      co_financing_id: financingRequestId,
      total_amount: +blended.totalAmount.toFixed(2),
      blended_apr: blended.blendedApr,
      weighted_sum: blended.weightedSum,
      accepted_bids: decryptedAcceptedBids,
      rejected_bid_count: rejectedBids.length,
      request_status: "AGREEMENT_PENDING",
      encryption_method: "simulated-nacl",
      note: "Bid terms decrypted from each financier's encrypted payload (simulated NaCl — see lib header).",
    });
  } catch (e: any) {
    logger.error("[financing/co-financing/accept]", { message: e?.message, stack: e?.stack });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
