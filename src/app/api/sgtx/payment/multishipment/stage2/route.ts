// POST /api/sgtx/payment/multishipment/stage2 — body: { masterUstn, shipmentSeq, pspProvider? }
// Activates per-shipment Stage 2 (Part 6.7 step 6): ocean freight + destination THC + import clearance
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { activateShipmentStage2 } from "@/lib/sgtx/payment/multishipment";
import { PspProvider, PSP_PROVIDERS } from "@/lib/sgtx/payment/psp-split";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { masterUstn, shipmentSeq, pspProvider } = body;
    if (!masterUstn || !shipmentSeq) {
      return NextResponse.json({ error: "masterUstn and shipmentSeq required" }, { status: 400 });
    }
    if (pspProvider && !PSP_PROVIDERS.includes(pspProvider as PspProvider)) {
      return NextResponse.json({ error: `pspProvider must be one of ${PSP_PROVIDERS.join(", ")}` }, { status: 400 });
    }

    const result = await activateShipmentStage2({
      masterUstn,
      shipmentSeq: Number(shipmentSeq),
      pspProvider: pspProvider as PspProvider | undefined,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: any) {
    logger.error("[payment/multishipment/stage2]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
