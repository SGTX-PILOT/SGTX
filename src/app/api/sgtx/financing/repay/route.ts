// 3B.5.11 — Repayment Monitoring (zero clicks — automated)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, annexId, financierGtid, amountUsd, method, txReference, detectedVia } = body;
    if (!requestId || !financierGtid || !amountUsd) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const request = await db.financingRequest.findUnique({
      where: { id: requestId },
      include: { borrower: true, agreements: { include: { annexes: true } } },
    });
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    // Log repayment event (immutable, in financing_repayments)
    const repayment = await db.financingRepayment.create({
      data: {
        requestId,
        annexId: annexId || null,
        financierGtid,
        amountUsd: +amountUsd,
        method: method || "BANK_TRANSFER",
        txReference: txReference || null,
        detectedVia: detectedVia || "PSP_WEBHOOK",
        status: "CONFIRMED",
        repaidAt: new Date(),
      },
    });

    // If annexId provided, check if that annex is fully repaid
    let annexFullyRepaid = false;
    if (annexId) {
      const annex = await db.financingAgreementAnnex.findUnique({ where: { id: annexId } });
      if (annex) {
        const totalRepaid = await db.financingRepayment.aggregate({
          where: { annexId, status: "CONFIRMED" },
          _sum: { amountUsd: true },
        });
        const totalDue = annex.amountFinanced + (annex.amountFinanced * annex.apr / 100 * annex.tenorDays / 365);
        if ((totalRepaid._sum.amountUsd || 0) >= totalDue) {
          await db.financingAgreementAnnex.update({ where: { id: annexId }, data: { status: "REPAID" } });
          annexFullyRepaid = true;
          // If DeFi position, mark as REPAID
          await db.deFiPosition.updateMany({ where: { annexId }, data: { status: "REPAID" } });
        } else {
          await db.financingAgreementAnnex.update({ where: { id: annexId }, data: { status: "REPAYING" } });
        }
      }
    }

    // Check if ALL annexes repaid → mark request as REPAID, release fee lock
    const allAnnexes = await db.financingAgreementAnnex.findMany({
      where: { agreementId: request.agreements[0]?.id },
    });
    const allRepaid = allAnnexes.length > 0 && allAnnexes.every((a) => a.status === "REPAID");
    if (allRepaid) {
      await db.financingRequest.update({
        where: { id: requestId },
        data: { status: "REPAID", feeLockStatus: "RELEASED" },
      });
      await db.financingAgreement.update({
        where: { id: request.agreements[0].id },
        data: { status: "COMPLETED" },
      });
      // Notify both parties
      await db.inboxItem.create({
        data: {
          tenantGtid: request.borrowerGtid,
          tradeId: request.tradeId,
          category: "NEW_OFFER",
          priority: 90,
          title: `Financing ${request.requestId} fully repaid`,
          description: `All financiers repaid in full. FeeLock released. Your credit score has been adjusted positively.`,
          ctaLabel: "View Details",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      repaymentId: repayment.id,
      annexFullyRepaid,
      allRepaid,
      feeLockStatus: allRepaid ? "RELEASED" : "ACTIVE",
    });
  } catch (e: any) {
    logger.error("[financing/repay]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — list repayments for a request
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId");
  const financierGtid = req.nextUrl.searchParams.get("financierGtid");
  const where: any = {};
  if (requestId) where.requestId = requestId;
  if (financierGtid) where.financierGtid = financierGtid;
  const repayments = await db.financingRepayment.findMany({
    where,
    include: { request: { select: { requestId: true, borrower: { select: { legalName: true, gtid: true } } } } },
    orderBy: { repaidAt: "desc" },
  });
  return NextResponse.json({ repayments });
}
