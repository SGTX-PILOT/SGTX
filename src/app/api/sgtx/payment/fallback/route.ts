// POST /api/sgtx/payment/fallback — body: { ustn, stage, payerCountry, currency, amount, forceFailProviders, healthCheckEnabled }
// Executes PSP fallback chain (Part 6.5.2). Tries primary → fallback1 → fallback2.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { executePspFallbackChain, ensurePaymentAggregatorsSeeded } from "@/lib/sgtx/payment/fallback";
import { PspProvider, PSP_PROVIDERS } from "@/lib/sgtx/payment/psp-split";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, stage, payerCountry, currency, amount, forceFailProviders, healthCheckEnabled } = body;
    if (!ustn || !stage || !payerCountry || !currency || amount === undefined) {
      return NextResponse.json({ error: "ustn, stage, payerCountry, currency, amount required" }, { status: 400 });
    }
    if (!["STAGE1", "STAGE2"].includes(stage)) {
      return NextResponse.json({ error: "stage must be STAGE1 or STAGE2" }, { status: 400 });
    }

    if (forceFailProviders && Array.isArray(forceFailProviders)) {
      for (const p of forceFailProviders) {
        if (!PSP_PROVIDERS.includes(p as PspProvider)) {
          return NextResponse.json({ error: `forceFailProviders must be one of ${PSP_PROVIDERS.join(", ")}` }, { status: 400 });
        }
      }
    }

    await ensurePaymentAggregatorsSeeded();

    const result = await executePspFallbackChain({
      ustn,
      stage: stage as "STAGE1" | "STAGE2",
      payerCountry,
      currency,
      amount: Number(amount),
      forceFailProviders: (forceFailProviders ?? []) as PspProvider[],
      healthCheckEnabled: healthCheckEnabled !== false,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[payment/fallback]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
