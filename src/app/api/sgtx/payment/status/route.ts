// GET /api/sgtx/payment/status?ustn=... — returns FeeLock + PaymentAttempt status
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { getFeeLockStatus } from "@/lib/sgtx/payment/fealock";

export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const [feeLock, attempts, calculations] = await Promise.all([
      getFeeLockStatus(ustn),
      db.paymentAttempt.findMany({ where: { ustn }, orderBy: { attemptedAt: "desc" } }),
      db.feeCalculation.findMany({ where: { ustn }, orderBy: { createdAt: "desc" } }),
    ]);

    return NextResponse.json({
      ustn,
      feeLock,
      paymentAttempts: attempts.map(a => ({
        id: a.id,
        stage: a.stage,
        amountUsd: a.amountUsd,
        currency: a.currency,
        pspProvider: a.pspProvider,
        pspReference: a.pspReference,
        status: a.status,
        idempotencyKey: a.idempotencyKey,
        attemptedAt: a.attemptedAt,
        completedAt: a.completedAt,
        splits: a.splitJson ? JSON.parse(a.splitJson) : [],
      })),
      feeCalculations: calculations.map(c => ({
        id: c.id,
        stage: c.stage,
        tradeValueUsd: c.tradeValueUsd,
        sgtxFeeUsd: c.sgtxFeeUsd,
        providerFees: c.providerFeesJson ? JSON.parse(c.providerFeesJson) : [],
        totalFeesUsd: c.totalFeesUsd,
        createdAt: c.createdAt,
      })),
    });
  } catch (e: any) {
    logger.error("[payment/status]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
