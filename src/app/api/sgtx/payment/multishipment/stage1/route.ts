// POST /api/sgtx/payment/multishipment/stage1 — body: { masterUstn, shipmentSeq, pspProvider? }
// Activates per-shipment Stage 1 (Part 6.7 steps 1-5):
//   - Generates new shipment USTN: {masterUstn}#S{seq}
//   - Creates per-shipment FeeLock (PENDING)
//   - Processes PSP payment → FeeLock ACTIVE
import { NextRequest, NextResponse } from "next/server";
import { activateShipmentStage1, listMasterContractShipments } from "@/lib/sgtx/payment/multishipment";
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

    const result = await activateShipmentStage1({
      masterUstn,
      shipmentSeq: Number(shipmentSeq),
      pspProvider: pspProvider as PspProvider | undefined,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: any) {
    console.error("[payment/multishipment/stage1]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const masterUstn = req.nextUrl.searchParams.get("masterUstn");
    if (!masterUstn) return NextResponse.json({ error: "masterUstn required" }, { status: 400 });
    const shipments = await listMasterContractShipments(masterUstn);
    return NextResponse.json({ masterUstn, shipments });
  } catch (e: any) {
    console.error("[payment/multishipment/stage1 GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
