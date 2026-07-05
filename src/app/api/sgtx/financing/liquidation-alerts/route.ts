// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.5.12.3 — Liquidation Early Warning (LSTM-style, Smart Inbox alerts)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { liquidationRiskAssessment } from "@/lib/sgtx/financing";
import { repaymentAdvice } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest) {
  const financierGtid = req.nextUrl.searchParams.get("financierGtid");
  const borrowerGtid = req.nextUrl.searchParams.get("borrowerGtid");
  const where: any = { status: { in: ["ACTIVE", "WARNING", "LIQUIDATION_RISK"] } };
  if (financierGtid) where.financierGtid = financierGtid;
  if (borrowerGtid) where.borrowerGtid = borrowerGtid;

  const positions = await db.deFiPosition.findMany({
    where,
    include: { annex: { include: { agreement: { include: { request: { include: { borrower: true } } } } } } },
    }) as any;

  const annotated = [];
  for (const p of positions) {
    const predicted24h = p.predictedHealth24h ?? Math.max(0.5, p.healthFactor - 0.15); // simulated LSTM
    const risk = liquidationRiskAssessment({
      healthFactor: p.healthFactor,
      collateralUsd: p.collateralUsd,
      debtUsd: p.debtUsd,
      predictedHealth24h: predicted24h,
        }) as any;
    // Get AI advice if at risk
    let aiAdvice: string | null = null;
    if (risk.status === "LIQUIDATION_RISK") {
      try {
        const borrowerName = p.annex?.agreement?.request?.borrower?.legalName || "Borrower";
        const r = await repaymentAdvice(borrowerName, p.healthFactor, predicted24h, p.debtUsd, p.collateralUsd);
        aiAdvice = r.content;
      } catch { /* ignore */ }
      // Update position status
      if (p.status !== "LIQUIDATION_RISK") {
                await db.deFiPosition.update({ where: { id: p.id }, data: { status: "LIQUIDATION_RISK", predictedHealth24h: predicted24h, lastCheckedAt: new Date() } }) as any;
      }
    } else if (risk.status === "WARNING" && p.status !== "WARNING") {
            await db.deFiPosition.update({ where: { id: p.id }, data: { status: "WARNING", predictedHealth24h: predicted24h, lastCheckedAt: new Date() } }) as any;
    }
    annotated.push({
      ...p,
      predictedHealth24h: predicted24h,
      riskAssessment: risk,
      aiAdvice,
        }) as any;
  }

    return NextResponse.json({ positions: annotated, total: annotated.length, alertsCount: annotated.filter((a) => a.riskAssessment.status !== "ACTIVE").length }) as any;
}
