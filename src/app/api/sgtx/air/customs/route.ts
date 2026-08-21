// @ts-nocheck
// POST /api/sgtx/air/customs
// Body: { shipmentId, ustn?, country, airport?, operationType, declarationNumber?,
//         brokerGtid?, mawbNumber?, hawbNumbers?, manifestReference? }
// Creates an AirCustomsOperation row in DRAFT status. Also runs the ACI
// Applicability check (§25) to flag whether ACI pre-arrival filing is required.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { checkAciAirApplicability } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

const VALID_OP_TYPES = new Set([
  "EXPORT",
  "IMPORT",
  "TRANSIT",
  "ACI_AIR",
  "MANIFEST",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.shipmentId && !body?.ustn) {
      return NextResponse.json(
        { error: "shipmentId or ustn required" },
        { status: 400 },
      );
    }
    if (!body?.country || !body?.operationType) {
      return NextResponse.json(
        { error: "country and operationType required" },
        { status: 400 },
      );
    }
    const opType = String(body.operationType).toUpperCase();
    if (!VALID_OP_TYPES.has(opType)) {
      return NextResponse.json(
        { error: `invalid operationType: ${opType}` },
        { status: 400 },
      );
    }

    let shipmentId = body.shipmentId;
    let ustn = body.ustn;
    let shipment: any = null;
    if (!shipmentId && ustn) {
      shipment = await db.airCargoShipment.findFirst({ where: { ustn } });
      shipmentId = shipment?.id;
    } else if (shipmentId) {
      shipment = await db.airCargoShipment.findUnique({ where: { id: shipmentId } });
    }
    if (!shipmentId) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    const op = await db.airCustomsOperation.create({
      data: {
        shipmentId,
        ustn: ustn || shipment.ustn,
        country: String(body.country).toUpperCase(),
        airport: body.airport || shipment?.originAirport || null,
        operationType: opType,
        declarationNumber: body.declarationNumber || null,
        brokerGtid: body.brokerGtid || null,
        mawbNumber: body.mawbNumber || null,
        hawbNumbers: body.hawbNumbers ? JSON.stringify(body.hawbNumbers) : null,
        manifestReference: body.manifestReference || null,
        status: "DRAFT",
      },
    });

    // Run ACI applicability check
    const aci = checkAciAirApplicability({
      country: body.country,
      origin: shipment?.originAirport || "",
      destination: shipment?.destinationAirport || "",
      cargoType: opType,
    });

    logger.info("[api/air/customs] POST created", {
      opId: op.id,
      ustn,
      opType,
      aciResult: aci.result,
    });
    return NextResponse.json({
      operation: op,
      aciApplicability: aci,
    });
  } catch (err: any) {
    logger.error("[api/air/customs] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
