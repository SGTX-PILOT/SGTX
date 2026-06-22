// 6.2 — Stage 2 Payment (Post-departure)
import { NextRequest, NextResponse } from "next/server";
import { generateStage2Split } from "@/lib/sgtx/payment-orchestration";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { ustn, payerGtid, oceanFreightUsd, destinationChargesUsd, creditTerms, dueDate } = await req.json();
    if (!ustn || !payerGtid || !oceanFreightUsd) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const { totalAmount, splits } = await generateStage2Split({ ustn, payerGtid, oceanFreightUsd: +oceanFreightUsd, destinationChargesUsd: +destinationChargesUsd || 0, creditTerms, dueDate: dueDate ? new Date(dueDate) : undefined });

    const requestId = `FPR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
    const trade = await db.trade.findUnique({ where: { ustn } });
    const pspReference = `PSP-S2-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    await db.feePaymentRequest.create({
      data: { requestId, ustn, tradeId: trade?.id, stage: "STAGE2", payerGtid,
        totalAmountUsd: totalAmount, currency: "USD", splits: JSON.stringify(splits),
        pspSelected: "SWIFT_BANK", pspReference, feeLockStatus: "ACTIVE", status: creditTerms ? "PENDING" : "PAID",
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 86400 * 1000),
        paidAt: creditTerms ? null : new Date() },
    });

    return NextResponse.json({ ok: true, requestId, totalAmount, splits, pspReference, status: creditTerms ? "CREDIT" : "PAID" });
  } catch (e: any) { console.error("[payment/stage2]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
