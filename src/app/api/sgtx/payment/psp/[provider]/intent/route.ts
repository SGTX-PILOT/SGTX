// POST /api/sgtx/payment/psp/[provider]/intent — create a payment intent at the PSP
// Body: {
//   ustn: string,
//   totalAmount: number,
//   currency: string,
//   payerGtid: string,
//   splitInstructions: SplitLeg[],
//   idempotencyKey: string
// }
// Returns: { ok, intentId, status, redirectUrl?, mode }
import { NextRequest, NextResponse } from "next/server";
import {
  getPSPAdapter,
  PSP_ADAPTER_NAMES,
  computeIdempotencyKey,
} from "@/lib/sgtx/payment/psp-adapters";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider } = await params;
    if (!PSP_ADAPTER_NAMES.includes(provider as never)) {
      return NextResponse.json(
        { error: `Unknown PSP provider "${provider}". Valid: ${PSP_ADAPTER_NAMES.join(", ")}` },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { ustn, totalAmount, currency, payerGtid, splitInstructions, idempotencyKey } =
      body || {};

    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (typeof totalAmount !== "number") missing.push("totalAmount");
    if (!currency) missing.push("currency");
    if (!payerGtid) missing.push("payerGtid");
    if (!idempotencyKey) missing.push("idempotencyKey");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const adapter = getPSPAdapter(provider);
    const result = await adapter.createPaymentIntent({
      ustn,
      totalAmount,
      currency,
      payerGtid,
      splitInstructions: Array.isArray(splitInstructions) ? splitInstructions : [],
      idempotencyKey,
    });

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      provider,
      ...result,
      createdAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[psp/[provider]/intent]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create payment intent" },
      { status: 500 },
    );
  }
}

// GET helper: returns the expected idempotency key for a sample body
// (useful for test harnesses that need to compute a valid key before POSTing).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!PSP_ADAPTER_NAMES.includes(provider as never)) {
    return NextResponse.json(
      { error: `Unknown PSP provider "${provider}"` },
      { status: 404 },
    );
  }
  const sample = {
    ustn: "SGTX-001234-002139-20260622144847-1A76EE1B",
    totalAmount: 2845,
    currency: "USD",
    payerGtid: "SGTX-EG-TRD-002139-7F3A",
    splitInstructions: [],
  };
  return NextResponse.json({
    provider,
    mode: "SIMULATION",
    sampleBody: sample,
    idempotencyKey: computeIdempotencyKey(sample),
    note: "Use this idempotencyKey (or any 64-char hex string) in the POST body. Key is valid for ±2 seconds per Part 6.12.",
  });
}
