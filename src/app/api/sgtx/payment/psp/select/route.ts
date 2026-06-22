// POST /api/sgtx/payment/psp/select — A2 PSP Router (select optimal PSP)
// Body: { payerCountry: string, amount: number, currency: string }
// Returns: { psp, reason, fallbackChain, mode }
import { NextRequest, NextResponse } from "next/server";
import { selectOptimalPSP } from "@/lib/sgtx/payment/psp-adapters";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { payerCountry, amount, currency } = body || {};

    const missing: string[] = [];
    if (!payerCountry) missing.push("payerCountry");
    if (typeof amount !== "number") missing.push("amount");
    if (!currency) missing.push("currency");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const selection = selectOptimalPSP(String(payerCountry), Number(amount), String(currency));

    return NextResponse.json({
      ok: true,
      ...selection,
      requestedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[psp/select]", e);
    return NextResponse.json({ error: e?.message ?? "PSP selection failed" }, { status: 500 });
  }
}
