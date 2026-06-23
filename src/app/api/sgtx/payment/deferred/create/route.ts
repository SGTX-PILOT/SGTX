// POST /api/sgtx/payment/deferred/create — body: { ustn, payerGtid, amount, currency?, jurisdictionMaxDays?, autoChargeAuthorised?, tradeId?, shipmentId?, stage?, splits? }
// Creates a deferred payment (guarantee held) per Part 6.8.1.
import { NextRequest, NextResponse } from "next/server";
import { createDeferredPayment } from "@/lib/sgtx/payment/deferred";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, payerGtid, amount } = body;
    if (!ustn || !payerGtid || amount === undefined) {
      return NextResponse.json({ error: "ustn, payerGtid, amount required" }, { status: 400 });
    }

    const result = await createDeferredPayment({
      ustn,
      payerGtid,
      amount: Number(amount),
      currency: body.currency,
      jurisdictionMaxDays: body.jurisdictionMaxDays,
      autoChargeAuthorised: body.autoChargeAuthorised,
      tradeId: body.tradeId,
      shipmentId: body.shipmentId,
      stage: body.stage,
      splits: body.splits,
    });

    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[payment/deferred/create]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
