// POST /api/sgtx/payment/psp/[provider]/webhook — receive + verify a PSP webhook
// Headers expected (per PSP):
//   FAWRY:    Fawry-Signature: <HMAC-SHA256 hex>
//   PAYMOB:   X-PAYMOB-SIG: <SHA-512 hex>
//   STRIPE:   Stripe-Signature: t=<ts>,v1=<HMAC-SHA256 hex>
//   CBE_IPN:  X-Client-Cert-Fingerprint: <mTLS fingerprint>
// Body: the raw webhook payload from the PSP
// Returns: { ok, verified, event, ustn, mode }
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
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

    // Pull the signature header per PSP convention.
    let signature = "";
    switch (provider) {
      case "FAWRY":
        signature =
          req.headers.get("fawry-signature") ??
          req.headers.get("x-fawry-signature") ??
          "";
        break;
      case "PAYMOB":
        signature =
          req.headers.get("x-paymob-sig") ??
          req.headers.get("x-paymob-signature") ??
          "";
        break;
      case "STRIPE":
        signature = req.headers.get("stripe-signature") ?? "";
        break;
      case "CBE_IPN":
        signature =
          req.headers.get("x-client-cert-fingerprint") ??
          req.headers.get("x-mtls-fingerprint") ??
          "";
        break;
    }

    const adapter = getPSPAdapter(provider);
    const result = await adapter.handleWebhook(body, signature);

    return NextResponse.json({
      ok: result.verified,
      mode: "SIMULATION",
      provider,
      ...result,
      receivedAt: new Date().toISOString(),
      signatureHeaderPresent: !!signature,
    });
  } catch (e: any) {
    logger.error("[psp/[provider]/webhook]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to process webhook" },
      { status: 500 },
    );
  }
}
