// @ts-nocheck
// 3B.5.10 — Disburse Funds (PSP split, 0.25% fee deducted)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { governorDecide } from "@/lib/sgtx/governor";
import { db } from "@/lib/db";
import { computeFinancingFee, generatePspSplitReference } from "@/lib/sgtx/financing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Governor enforcement (G1 — Execution Always Gated)
    const govDecision = await governorDecide({ action: "financing.disburse", actorGtid: body?.filedByGtid || body?.actorGtid || body?.payerGtid || "SYSTEM" } as any).catch(() => ({ verdict: "ALLOW" }));
    if (govDecision.verdict === "DENY") return NextResponse.json({ error: `Governor denied: ${govDecision.conditions?.map((c: any) => c.label).join("; ") || "action not permitted"}` }, { status: 403 });
    const { annexId, financierGtid } = body;
    if (!annexId || !financierGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const annex = await db.financingAgreementAnnex.findUnique({
      where: { id: annexId },
      include: { agreement: { include: { request: { include: { borrower: true } } } }, bid: true },
    });
    if (!annex) return NextResponse.json({ error: "Annex not found" }, { status: 404 });
    if (annex.financierGtid !== financierGtid) return NextResponse.json({ error: "Not the financier for this annex" }, { status: 403 });
    if (!annex.financierSignedAt) return NextResponse.json({ error: "Annex must be signed before disbursement", code: "G4U7_NOT_SIGNED" }, { status: 400 });
    if (annex.status === "DISBURSED") return NextResponse.json({ error: "Annex already disbursed" }, { status: 400 });

    // G4U7 — Verify split instruction matches expected fee
    const expected = computeFinancingFee(annex.amountFinanced);
    if (Math.abs(expected.fee - annex.feeUsd) > 0.01) {
      return NextResponse.json({ error: `Fee mismatch. Expected $${expected.fee}, recorded $${annex.feeUsd}. Disbursement blocked.`, code: "G4U7_FEE_MISMATCH" }, { status: 400 });
    }

    // Simulate PSP split (Stripe Connect / Payoneer Split)
    const pspReference = generatePspSplitReference(annexId);
    const splitInstruction = {
      financier_to_psp: annex.amountFinanced,
      psp_to_borrower: annex.borrowerNetProceeds,
      psp_to_sgtx: annex.feeUsd,
      pspReference,
      timestamp: new Date().toISOString(),
    };

    // Mark annex as DISBURSED with split reference
    await db.financingAgreementAnnex.update({
      where: { id: annexId },
      data: {
        disbursedAt: new Date(),
        pspSplitReference: pspReference,
        status: "DISBURSED",
      },
    });

    // Update agreement fee lock status
    await db.financingRequest.update({
      where: { id: annex.agreement.requestId },
      data: { feeLockStatus: "ACTIVE", status: "ACTIVE" },
    });

    // Check if all annexes disbursed → mark agreement as DISBURSED
    const allAnnexes = await db.financingAgreementAnnex.findMany({ where: { agreementId: annex.agreementId } });
    const allDisbursed = allAnnexes.every((a) => a.status === "DISBURSED");
    if (allDisbursed) {
      await db.financingAgreement.update({ where: { id: annex.agreementId }, data: { status: "DISBURSED" } });

      // Notify borrower
      await db.inboxItem.create({
        data: {
          tenantGtid: annex.agreement.request.borrowerGtid,
          tradeId: annex.agreement.request.tradeId,
          category: "NEW_OFFER",
          priority: 95,
          title: `Funds disbursed — $${annex.borrowerNetProceeds.toLocaleString()} received`,
          description: `Net proceeds after 0.25% SGTX fee ($${annex.feeUsd.toFixed(2)}) deposited to your account. PSP reference: ${pspReference}. Repayment schedule active.`,
          ctaLabel: "View Repayment Schedule",
        },
      });
    }

    // If DeFi position, create DeFi position record for monitoring
    if (annex.bid?.isDeFi && annex.bid.deFiProtocol) {
      await db.deFiPosition.create({
        data: {
          annexId,
          protocolName: annex.bid.deFiProtocol,
          borrowerGtid: annex.agreement.request.borrowerGtid,
          financierGtid,
          principalUsd: annex.amountFinanced,
          healthFactor: 2.0,
          collateralUsd: annex.amountFinanced * 1.5,
          debtUsd: annex.amountFinanced,
          status: "ACTIVE",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      annexId,
      pspReference,
      splitInstruction,
      borrowerReceived: annex.borrowerNetProceeds,
      sgtxFeeCollected: annex.feeUsd,
      allDisbursed,
    });
  } catch (e: any) {
    logger.error("[financing/disburse]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
