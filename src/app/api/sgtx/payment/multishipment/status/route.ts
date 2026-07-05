// GET /api/sgtx/payment/multishipment/status?masterUstn=...&shipmentSeq=...
// Returns per-shipment FeeLock + payment attempt status (Part 6.7).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getShipmentPaymentStatus, listMasterContractShipments } from "@/lib/sgtx/payment/multishipment";

export async function GET(req: NextRequest) {
  try {
    const masterUstn = req.nextUrl.searchParams.get("masterUstn");
    const shipmentSeqStr = req.nextUrl.searchParams.get("shipmentSeq");
    if (!masterUstn) return NextResponse.json({ error: "masterUstn required" }, { status: 400 });

    if (!shipmentSeqStr) {
      // List all shipments in master contract
      const shipments = await listMasterContractShipments(masterUstn);
      return NextResponse.json({ masterUstn, shipments });
    }

    const shipmentSeq = parseInt(shipmentSeqStr, 10);
    if (isNaN(shipmentSeq) || shipmentSeq < 1) {
      return NextResponse.json({ error: "shipmentSeq must be a positive integer" }, { status: 400 });
    }

    const status = await getShipmentPaymentStatus(masterUstn, shipmentSeq);
    return NextResponse.json({
      masterUstn,
      shipmentSeq,
      shipmentUstn: status.shipmentUstn,
      shipmentId: status.shipmentId,
      containerNo: status.containerNo,
      stage1: status.stage1,
      stage2: status.stage2,
    });
  } catch (e: any) {
    logger.error("[payment/multishipment/status]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
