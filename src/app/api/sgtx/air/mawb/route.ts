// @ts-nocheck
// POST /api/sgtx/air/mawb
// Body: { shipmentId, ustn, airlinePrefix?, awbNumber?, shipper?, consignee?,
//         origin, destination, pieces, grossWeight, chargeableWeight?, volume?,
//         commodity?, rate?, charges?, currency?, eAwbStatus?, documentHash? }
// Issues a Master Air Waybill. Generates an AWB number + check digit if not provided.
// Promotes shipment cargoStatus AWB_PENDING -> MAWB_ISSUED (via state machine).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  isValidAirStateTransition,
  generateAwbSerial,
} from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.shipmentId && !body?.ustn) {
      return NextResponse.json(
        { error: "shipmentId or ustn required" },
        { status: 400 },
      );
    }

    let shipmentId = body.shipmentId;
    let shipment: any = null;
    if (body.ustn && !shipmentId) {
      shipment = await db.airCargoShipment.findFirst({
        where: { ustn: body.ustn },
      });
      shipmentId = shipment?.id;
    } else if (shipmentId) {
      shipment = await db.airCargoShipment.findUnique({ where: { id: shipmentId } });
    }
    if (!shipment || !shipmentId) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    // Generate AWB number if not provided
    let awbNumber = body.awbNumber;
    let airlinePrefix = body.airlinePrefix;
    let serial: string | undefined;
    if (!awbNumber) {
      const gen = generateAwbSerial(body.airlinePrefix);
      awbNumber = gen.fullAwbNumber;
      airlinePrefix = gen.airlinePrefix;
      serial = gen.serial;
    }

    // Create the AWB
    const mawb = await db.airWaybill.create({
      data: {
        shipmentId,
        ustn: shipment.ustn,
        awbType: "MAWB",
        awbNumber,
        airlinePrefix: airlinePrefix || null,
        serial: serial || null,
        shipper: body.shipper || null,
        consignee: body.consignee || null,
        origin: String(body.origin || shipment.originAirport).toUpperCase(),
        destination: String(body.destination || shipment.destinationAirport).toUpperCase(),
        pieces: Number(body.pieces) || shipment.totalPieces || 0,
        grossWeight: Number(body.grossWeight) || shipment.totalGrossWeight || 0,
        chargeableWeight: body.chargeableWeight != null ? Number(body.chargeableWeight) : shipment.chargeableWeight,
        volume: body.volume != null ? Number(body.volume) : shipment.totalVolume,
        commodity: body.commodity || null,
        rate: body.rate != null ? Number(body.rate) : null,
        charges: body.charges != null ? Number(body.charges) : null,
        currency: body.currency || "USD",
        eAwbStatus: body.eAwbStatus || "E_AWB",
        documentHash: body.documentHash || null,
        issuedAt: new Date(),
      },
    });

    // Promote shipment cargoStatus: AWB_PENDING -> MAWB_ISSUED (state machine).
    const fromStatus = shipment.cargoStatus || "AWB_PENDING";
    const toStatus = "MAWB_ISSUED";
    if (isValidAirStateTransition(fromStatus, toStatus)) {
      try {
        await db.airCargoShipment.update({
          where: { id: shipmentId },
          data: { cargoStatus: toStatus },
        });
      } catch (e: any) {
        logger.warn("[api/air/mawb] cargoStatus promotion failed", { error: e?.message });
      }
    } else {
      logger.warn("[api/air/mawb] invalid state transition", {
        shipmentId,
        from: fromStatus,
        to: toStatus,
      });
    }

    logger.info("[api/air/mawb] POST issued", {
      mawbId: mawb.id,
      awbNumber: mawb.awbNumber,
      shipmentId,
    });
    return NextResponse.json({ mawb });
  } catch (err: any) {
    logger.error("[api/air/mawb] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
