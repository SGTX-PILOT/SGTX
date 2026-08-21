// @ts-nocheck
// POST /api/sgtx/air/hawb
// Body: { shipmentId, ustn, awbNumber?, forwarderPrefix?, shipper?, consignee?,
//         origin, destination, pieces, grossWeight, chargeableWeight?, volume?,
//         commodity?, rate?, charges?, currency? }
// Issues a House Air Waybill. Promotes shipment cargoStatus: MAWB_ISSUED -> HAWB_ISSUED.
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
      shipment = await db.airCargoShipment.findFirst({ where: { ustn: body.ustn } });
      shipmentId = shipment?.id;
    } else if (shipmentId) {
      shipment = await db.airCargoShipment.findUnique({ where: { id: shipmentId } });
    }
    if (!shipment || !shipmentId) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    // Generate HAWB number if not provided (uses forwarder prefix, default 920).
    let awbNumber = body.awbNumber;
    if (!awbNumber) {
      const gen = generateAwbSerial(body.forwarderPrefix || "920");
      awbNumber = gen.fullAwbNumber;
    }

    const hawb = await db.airWaybill.create({
      data: {
        shipmentId,
        ustn: shipment.ustn,
        awbType: "HAWB",
        awbNumber,
        shipper: body.shipper || null,
        consignee: body.consignee || null,
        origin: String(body.origin || shipment.originAirport).toUpperCase(),
        destination: String(body.destination || shipment.destinationAirport).toUpperCase(),
        pieces: Number(body.pieces) || 0,
        grossWeight: Number(body.grossWeight) || 0,
        chargeableWeight: body.chargeableWeight != null ? Number(body.chargeableWeight) : null,
        volume: body.volume != null ? Number(body.volume) : null,
        commodity: body.commodity || null,
        rate: body.rate != null ? Number(body.rate) : null,
        charges: body.charges != null ? Number(body.charges) : null,
        currency: body.currency || "USD",
        issuedAt: new Date(),
      },
    });

    // Promote shipment cargoStatus: MAWB_ISSUED -> HAWB_ISSUED (allowed transition).
    const fromStatus = shipment.cargoStatus || "MAWB_ISSUED";
    const toStatus = "HAWB_ISSUED";
    if (isValidAirStateTransition(fromStatus, toStatus)) {
      try {
        await db.airCargoShipment.update({
          where: { id: shipmentId },
          data: { cargoStatus: toStatus },
        });
      } catch (e: any) {
        logger.warn("[api/air/hawb] cargoStatus promotion failed", { error: e?.message });
      }
    } else {
      logger.warn("[api/air/hawb] invalid state transition", {
        shipmentId,
        from: fromStatus,
        to: toStatus,
      });
    }

    logger.info("[api/air/hawb] POST issued", {
      hawbId: hawb.id,
      awbNumber: hawb.awbNumber,
      shipmentId,
    });
    return NextResponse.json({ hawb });
  } catch (err: any) {
    logger.error("[api/air/hawb] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
