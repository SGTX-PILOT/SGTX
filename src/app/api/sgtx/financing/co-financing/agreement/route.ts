// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §10.23-10.24 — Co-financing: assemble master + annexes agreement.
// POST /api/sgtx/financing/co-financing/agreement
//   body: { co_financing_id }
//
// Assembles:
//   • One master financing agreement with blended APR + total amount
//   • One annex per accepted financier tranche (amount, APR, conditions)
//   • SGTX Witness Clause in master (non-removable)
//   • SHA-256 hash of master + all annexes (combined)
//
// Returns: { master_agreement, annexes, blended_apr, total_amount, sha256_hash }
//
// Persists the master agreement as a FinancingAgreement row and each annex as
// a FinancingAgreementAnnex row (one per accepted bid). Idempotent — if a
// FinancingAgreement already exists for this request, returns the existing
// one (does NOT re-assemble).
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import {
  assembleCoFinancingAgreement,
  deriveFinancierPrivateKey,
  decryptBid,
  generateCoFinancingId,
  type AcceptedBid,
} from "@/lib/sgtx/financing/co-financing";
import { buildRepaymentSchedule } from "@/lib/sgtx/financing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const coFinancingId = body?.co_financing_id || body?.coFinancingId;
    if (!coFinancingId) {
      return NextResponse.json(
        { error: "co_financing_id is required" },
        { status: 400 },
      );
    }

    const financingRequest = await db.financingRequest.findUnique({
      where: { id: coFinancingId },
      include: {
        bids: true,
        borrower: true,
        agreements: { include: { annexes: true } },
      },
    });
    if (!financingRequest) {
      return NextResponse.json(
        { error: "Co-financing request not found" },
        { status: 404 },
      );
    }

    // Idempotency: if an agreement already exists for this request, return it.
    // The first FinancingAgreement row for a request is the master co-financing
    // agreement (the v17 spec allows one master per request).
    const existingAgreement = financingRequest.agreements[0];
    if (existingAgreement) {
      return NextResponse.json({
        ok: true,
        master_agreement: {
          agreement_id: existingAgreement.agreementId,
          request_id: financingRequest.requestId,
          blended_apr: existingAgreement.blendedApr,
          total_amount: existingAgreement.totalAcceptedAmount,
          witness_clause: existingAgreement.witnessClauseText,
          master_hash: existingAgreement.masterContractHash,
          status: existingAgreement.status,
          created_at: existingAgreement.createdAt,
        },
        annexes: existingAgreement.annexes.map((a) => ({
          annex_id: a.id,
          bid_id: a.bidId,
          financier_gtid: a.financierGtid,
          amount: a.amountFinanced,
          apr: a.apr,
          tenor_days: a.tenorDays,
          fee: a.feeUsd,
          borrower_net: a.borrowerNetProceeds,
          status: a.status,
          psp_split_reference: a.pspSplitReference,
          disbursed_at: a.disbursedAt,
        })),
        blended_apr: existingAgreement.blendedApr,
        total_amount: existingAgreement.totalAcceptedAmount,
        sha256_hash: existingAgreement.masterContractHash,
        idempotent: true,
      });
    }

    // Get accepted bids
    const acceptedBidRows = financingRequest.bids.filter((b) => b.status === "ACCEPTED");
    if (acceptedBidRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No accepted bids found for this financing request. Call /co-financing/accept first.",
        },
        { status: 400 },
      );
    }

    // Decrypt each accepted bid to get the canonical terms (the stored
    // columns may have been written by the legacy /api/sgtx/financing/bid
    // route which uses a lossy encryption stub). The decrypted payload is
    // authoritative for terms.
    const acceptedBids: AcceptedBid[] = acceptedBidRows.map((b) => {
      if (b.encryptedPayload) {
        try {
          const priv = deriveFinancierPrivateKey(b.financierGtid);
          const dec = decryptBid(b.encryptedPayload, priv);
          return {
            bidId: b.bidId,
            financierGtid: b.financierGtid,
            amount: dec.amountOffered ?? b.amountOffered,
            apr: dec.apr ?? b.apr,
          };
        } catch (_) {
          return {
            bidId: b.bidId,
            financierGtid: b.financierGtid,
            amount: b.amountOffered,
            apr: b.apr,
          };
        }
      }
      return {
        bidId: b.bidId,
        financierGtid: b.financierGtid,
        amount: b.amountOffered,
        apr: b.apr,
      };
    });

    // Assemble master + annexes (in-memory)
    const assembled = assembleCoFinancingAgreement(acceptedBids, {
      requestId: financingRequest.requestId,
      tenorDays: financingRequest.tenorDays,
      preferredCurrency: financingRequest.preferredCurrency,
    });

    // Persist the master agreement
    const persistedAgreement = await db.financingAgreement.create({
      data: {
        agreementId: assembled.masterAgreement.agreementId,
        requestId: coFinancingId,
        masterContractHash: assembled.sha256Hash,
        witnessClauseText: assembled.masterAgreement.witnessClause,
        totalAcceptedAmount: assembled.totalAmount,
        blendedApr: assembled.blendedApr,
        status: "PENDING_SIGNATURES",
      },
    });

    // Persist one annex per accepted bid
    const persistedAnnexes: any[] = [];
    for (let i = 0; i < acceptedBids.length; i++) {
      const b = acceptedBids[i];
      const annexSpec = assembled.annexes[i];
      const bidRow = acceptedBidRows.find((r) => r.bidId === b.bidId)!;
      const schedule = buildRepaymentSchedule(b.amount, b.apr, financingRequest.tenorDays);

      const annex = await db.financingAgreementAnnex.create({
        data: {
          agreementId: persistedAgreement.id,
          bidId: bidRow.id,
          financierGtid: b.financierGtid,
          amountFinanced: b.amount,
          apr: b.apr,
          tenorDays: financingRequest.tenorDays,
          repaymentSchedule: JSON.stringify(schedule),
          collateralTerms: bidRow.collateralRequired,
          feeUsd: annexSpec.fee,
          borrowerNetProceeds: annexSpec.borrowerNet,
          status: "PENDING",
        },
      });
      persistedAnnexes.push(annex);
    }

    // Update the financing request status
    await db.financingRequest.update({
      where: { id: coFinancingId },
      data: { status: "AGREEMENT_PENDING", blendedApr: assembled.blendedApr },
    });

    return NextResponse.json({
      ok: true,
      master_agreement: {
        agreement_id: assembled.masterAgreement.agreementId,
        request_id: assembled.masterAgreement.requestId,
        blended_apr: assembled.masterAgreement.blendedApr,
        total_amount: assembled.masterAgreement.totalAmount,
        accepted_bids: assembled.masterAgreement.acceptedBids,
        witness_clause: assembled.masterAgreement.witnessClause,
        master_hash: assembled.masterAgreement.masterHash,
        status: "PENDING_SIGNATURES",
        created_at: assembled.masterAgreement.createdAt,
      },
      annexes: assembled.annexes.map((a, i) => ({
        annex_id: a.annexId,
        db_id: persistedAnnexes[i].id,
        bid_id: a.bidId,
        financier_gtid: a.financierGtid,
        amount: a.amount,
        apr: a.apr,
        tenor_days: a.tenorDays,
        fee: a.fee,
        borrower_net: a.borrowerNet,
        witness_clause: a.witnessClause,
        annex_hash: a.annexHash,
        status: "PENDING",
      })),
      blended_apr: assembled.blendedApr,
      total_amount: assembled.totalAmount,
      sha256_hash: assembled.sha256Hash,
      witness_clause_non_removable: true,
      encryption_method: "simulated-nacl",
    });
  } catch (e: any) {
    logger.error("[financing/co-financing/agreement]", { message: e?.message, stack: e?.stack });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
