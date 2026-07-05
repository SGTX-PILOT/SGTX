// 3B.5.8 — Borrower Accepts Bids (Co-Financing) + 3B.5.9 Agreement Assembly
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import {
  validateAcceptedBids,
  assembleFinancingAgreement,
  computeFinancingFee,
  buildRepaymentSchedule,
  MIN_QUALIFIED_BIDS,
} from "@/lib/sgtx/financing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, borrowerGtid, selectedBidIds } = body;
    if (!requestId || !borrowerGtid || !Array.isArray(selectedBidIds) || selectedBidIds.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const request = await db.financingRequest.findUnique({
      where: { id: requestId },
      include: { bids: true, borrower: true, trade: true },
    });
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (request.borrowerGtid !== borrowerGtid) return NextResponse.json({ error: "Not the borrower" }, { status: 403 });

    // G4U4 — Minimum 2 qualified bids OR window extension (allow if window already closed)
    if (request.bids.length < MIN_QUALIFIED_BIDS && request.status === "BIDDING_OPEN") {
      return NextResponse.json({
        error: `Need at least ${MIN_QUALIFIED_BIDS} qualified bids before accepting. Current: ${request.bids.length}. Consider extending the bidding window.`,
        code: "G4U4_MIN_BIDS",
      }, { status: 400 });
    }

    // G4U4a — Sum of accepted bids ≤ P
    const selectedBids = request.bids.filter((b) => selectedBidIds.includes(b.bidId));
    if (selectedBids.length !== selectedBidIds.length) {
      return NextResponse.json({ error: "Some selected bids not found in request." }, { status: 400 });
    }

    const validation = validateAcceptedBids({
      requestedAmount: request.amountUsd,
      selectedBids: selectedBids.map((b) => ({ bidId: b.bidId, amountOffered: b.amountOffered })),
      existingBids: request.bids.map((b) => ({ bidId: b.bidId, amountOffered: b.amountOffered, status: b.status })),
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason, code: validation.code }, { status: 400 });
    }

    // 3B.5.9 — Assemble master financing agreement + annexes
    const acceptedBids = selectedBids.map((b) => ({ bidId: b.bidId, amountOffered: b.amountOffered, apr: b.apr }));
    const agreement = await assembleFinancingAgreement(requestId, acceptedBids);

    // Create agreement record
    const fa = await db.financingAgreement.create({
      data: {
        agreementId: agreement.agreementId,
        requestId,
        masterContractHash: agreement.masterContractHash,
        witnessClauseText: agreement.witnessClauseText,
        totalAcceptedAmount: agreement.totalAcceptedAmount,
        blendedApr: agreement.blendedApr,
        status: "PENDING_SIGNATURES",
      },
    });

    // Create annex per accepted bid
    const annexes: any[] = [];
    for (const bid of selectedBids) {
      const fee = computeFinancingFee(bid.amountOffered);
      const schedule = buildRepaymentSchedule(bid.amountOffered, bid.apr, request.tenorDays);
      const annex = await db.financingAgreementAnnex.create({
        data: {
          agreementId: fa.id,
          bidId: bid.id,
          financierGtid: bid.financierGtid,
          amountFinanced: bid.amountOffered,
          apr: bid.apr,
          tenorDays: request.tenorDays,
          repaymentSchedule: JSON.stringify(schedule),
          collateralTerms: bid.collateralRequired,
          feeUsd: fee.fee,
          borrowerNetProceeds: fee.borrowerNet,
          status: "PENDING",
        },
      });
      annexes.push(annex);
      // Mark bid as ACCEPTED
      await db.financingBid.update({ where: { id: bid.id }, data: { status: "ACCEPTED" } });
    }

    // Mark rejected bids
    const rejectedBids = request.bids.filter((b) => !selectedBidIds.includes(b.bidId));
    for (const rb of rejectedBids) {
      await db.financingBid.update({ where: { id: rb.id }, data: { status: "REJECTED" } });
    }

    // Update request status
    await db.financingRequest.update({
      where: { id: requestId },
      data: {
        status: "AGREEMENT_PENDING",
        blendedApr: agreement.blendedApr,
        feeUsd: annexes.reduce((s, a) => s + a.feeUsd, 0),
      },
    });

    // Notify each financier with accepted bid
    for (const bid of selectedBids) {
      await db.inboxItem.create({
        data: {
          tenantGtid: bid.financierGtid,
          tradeId: request.tradeId,
          category: "NEEDS_SIGNATURE",
          priority: 95,
          title: `Financing agreement ready to sign — ${agreement.agreementId}`,
          description: `Your bid ${bid.bidId} was accepted by ${request.borrower.legalName}. Sign annex to proceed with disbursement.`,
          ctaLabel: "Sign Annex",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      agreementId: agreement.agreementId,
      agreementDbId: fa.id,
      totalAccepted: agreement.totalAcceptedAmount,
      blendedApr: agreement.blendedApr,
      witnessClause: agreement.witnessClauseText,
      annexes: annexes.map((a) => ({ id: a.id, financierGtid: a.financierGtid, amountFinanced: a.amountFinanced, feeUsd: a.feeUsd, borrowerNetProceeds: a.borrowerNetProceeds })),
    });
  } catch (e: any) {
    logger.error("[financing/accept-bids]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
