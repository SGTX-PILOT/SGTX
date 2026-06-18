// 3B.5.5 — Encrypted Bid Submission
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  validateBid,
  generateBidId,
  encryptBidPayload,
  computeFinancingFee,
  APR_DEVIATION_WARN_PCT,
} from "@/lib/sgtx/financing";
import { financingMatchScoreExplanation } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, financierGtid, amountOffered, apr, settlementMethod, collateralRequired, conditions, noteToBorrower, isDeFi, deFiProtocol, defiRiskAcknowledgedAt, borrowerPublicKey } = body;

    if (!requestId || !financierGtid || !amountOffered || apr === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const request = await db.financingRequest.findUnique({
      where: { id: requestId },
      include: { borrower: true, rfqLogs: { where: { financierGtid } } },
    });
    if (!request) return NextResponse.json({ error: "Financing request not found" }, { status: 404 });
    if (request.status !== "BIDDING_OPEN") {
      return NextResponse.json({ error: `Bidding window is ${request.status}. Cannot submit bid.`, code: "BID_WINDOW_CLOSED" }, { status: 400 });
    }

    // Check window not expired
    if (request.biddingWindowEndsAt && new Date() > request.biddingWindowEndsAt) {
      return NextResponse.json({ error: "Bidding window has closed.", code: "BID_WINDOW_EXPIRED" }, { status: 400 });
    }

    // Prevent duplicate bid from same financier
    const existing = await db.financingBid.findFirst({ where: { requestId, financierGtid, status: "SUBMITTED" } });
    if (existing) return NextResponse.json({ error: "You already have an active bid on this request.", code: "BID_DUPLICATE" }, { status: 400 });

    // Get financier preferences (for min tranche size & benchmark)
    const pref = await db.financierPreference.findUnique({ where: { financierGtid } });
    const minTranche = pref?.minTrancheSize ?? 10000;
    const benchmark = pref?.defaultAprBenchmark ?? 5.0;

    // Validate protocol risk score if DeFi
    let protocolRiskScore: number | undefined;
    if (isDeFi && deFiProtocol) {
      const proto = await db.deFiProtocol.findUnique({ where: { name: deFiProtocol } });
      protocolRiskScore = proto?.riskScore;
    }

    // G4U4 / G4U5 validation
    const validation = validateBid({
      amountOffered: +amountOffered,
      apr: +apr,
      benchmarkApr: benchmark,
      settlementMethod,
      borrowerSettlement: request.preferredSettlement,
      isDeFi: !!isDeFi,
      protocolRiskScore,
      defiRiskAcknowledgedAt: defiRiskAcknowledgedAt ? new Date(defiRiskAcknowledgedAt) : null,
      minTrancheSize: minTranche,
      requestedAmount: request.amountUsd,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason, code: validation.code }, { status: 400 });
    }

    // Compute APR deviation warning flag
    const deviation = Math.abs(+apr - benchmark) / benchmark * 100;
    const aprWarning = deviation > APR_DEVIATION_WARN_PCT;

    // Generate match score (use existing RFQ log if present)
    const matchScore = request.rfqLogs[0]?.matchScore ?? 70;

    // AI match score explanation (best-effort)
    let aiMatchExplanation: string | null = null;
    try {
      const r = await financingMatchScoreExplanation(
        (await db.tenant.findUnique({ where: { gtid: financierGtid } }))?.legalName || financierGtid,
        request.borrower.legalName,
        matchScore,
        [],
        `Financier has funded similar ${request.financingType.replace(/_/g, " ")} loans in the past.`
      );
      aiMatchExplanation = r.content;
    } catch (e) { /* ignore */ }

    // Encrypt payload with borrower's public key (simulated)
    const payload = { amountOffered, apr, settlementMethod, collateralRequired, conditions, noteToBorrower, isDeFi, deFiProtocol };
    const encrypted = encryptBidPayload(payload, borrowerPublicKey || request.borrowerGtid);

    // Compute fee preview
    const feePreview = computeFinancingFee(+amountOffered);

    const bidId = generateBidId();
    const bid = await db.financingBid.create({
      data: {
        bidId,
        requestId,
        financierGtid,
        amountOffered: +amountOffered,
        apr: +apr,
        settlementMethod,
        collateralRequired,
        conditions: conditions || null,
        noteToBorrower: noteToBorrower || null,
        isDeFi: !!isDeFi,
        deFiProtocol: deFiProtocol || null,
        deFiRiskAcknowledgedAt: defiRiskAcknowledgedAt ? new Date(defiRiskAcknowledgedAt) : null,
        matchScore,
        encryptedPayload: encrypted,
        status: "SUBMITTED",
      },
    });

    // Notify borrower
    await db.inboxItem.create({
      data: {
        tenantGtid: request.borrowerGtid,
        tradeId: request.tradeId,
        category: "NEW_OFFER",
        priority: 80,
        title: `New financing bid received — ${bidId}`,
        description: `Bid of $${(+amountOffered).toLocaleString()} @ ${apr}% APR on request ${request.requestId}. Bidding window closes ${request.biddingWindowEndsAt?.toLocaleString()}.`,
        ctaLabel: "View Bids",
        deadline: request.biddingWindowEndsAt,
      },
    });

    return NextResponse.json({
      ok: true,
      bidId,
      id: bid.id,
      aprWarning,
      feePreview,
      aiMatchExplanation,
    });
  } catch (e: any) {
    console.error("[financing/bid]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — list bids for a borrower on a request (after window closes — decrypt)
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId");
  const financierGtid = req.nextUrl.searchParams.get("financierGtid");
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });

  const where: any = { requestId };
  if (financierGtid) where.financierGtid = financierGtid;

  const bids = await db.financingBid.findMany({
    where,
    include: { financier: true },
    orderBy: { apr: "asc" },
  });

  return NextResponse.json({ bids, total: bids.length });
}
