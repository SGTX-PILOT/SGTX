// POST /api/sgtx/payment/psp/[provider]/confirm — confirm/capture a payment intent
// Body: { intentId: string }
// Returns: { ok, confirmed, transactionId, mode }
import { NextRequest, NextResponse } from "next/server";
import { getPSPAdapter, PSP_ADAPTER_NAMES } from "@/lib/sgtx/payment/psp-adapters";

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
    const { intentId } = body || {};
    if (!intentId) {
      return NextResponse.json(
        { error: "Missing required field: intentId" },
        { status: 400 },
      );
    }

    const adapter = getPSPAdapter(provider);
    const result = await adapter.confirmPayment(String(intentId));

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      provider,
      intentId,
      ...result,
      confirmedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[psp/[provider]/confirm]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to confirm payment" },
      { status: 500 },
    );
  }
}
