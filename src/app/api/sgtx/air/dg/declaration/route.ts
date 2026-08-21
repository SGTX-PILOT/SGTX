// @ts-nocheck
// POST /api/sgtx/air/dg/declaration
// Body: { shipmentId, ustn?, unNumber, properShippingName?, dgClass, division?,
//         packingGroup?, quantity, unit, netQuantity?, packageType?,
//         packingInstruction?, handlingCode?, lithiumBatteryInfo?,
//         radioactiveData?, aircraftLimitation?, operatorRestrictions?,
//         originRestrictions?, destinationRestrictions? }
// Creates an AirDgRecord row. Runs the DG validator first; if invalid, the
// record is persisted in PENDING state with the validation result; otherwise
// it's marked VALIDATED.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { validateDangerousGoods } from "@/lib/sgtx/air-cargo";

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
    if (!body?.unNumber) {
      return NextResponse.json({ error: "unNumber required" }, { status: 400 });
    }

    let shipmentId = body.shipmentId;
    let ustn = body.ustn;
    if (!shipmentId && ustn) {
      const sh = await db.airCargoShipment.findFirst({ where: { ustn } });
      shipmentId = sh?.id;
    }
    if (!shipmentId) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    // Validate first
    const validation = validateDangerousGoods({
      unNumber: body.unNumber,
      dgClass: body.dgClass,
      division: body.division,
      packingGroup: body.packingGroup,
      quantity: Number(body.quantity) || 0,
      unit: body.unit,
      packageType: body.packageType,
      aircraftType: body.aircraftLimitation === "PASSENGER" ? "PASSENGER" : "CARGO",
      airline: body.airline,
      origin: body.origin || "",
      destination: body.destination || "",
    });

    const declarationStatus = validation.valid ? "VALIDATED" : "PENDING";

    const dgRecord = await db.airDgRecord.create({
      data: {
        shipmentId,
        ustn: ustn || "",
        unNumber: String(body.unNumber).toUpperCase(),
        properShippingName: body.properShippingName || null,
        dgClass: body.dgClass || null,
        division: body.division || null,
        packingGroup: body.packingGroup || null,
        quantity: Number(body.quantity) || 0,
        unit: body.unit || null,
        netQuantity: body.netQuantity != null ? Number(body.netQuantity) : null,
        packageType: body.packageType || null,
        packingInstruction: body.packingInstruction || null,
        handlingCode: body.handlingCode || null,
        lithiumBatteryInfo: body.lithiumBatteryInfo ? JSON.stringify(body.lithiumBatteryInfo) : null,
        radioactiveData: body.radioactiveData ? JSON.stringify(body.radioactiveData) : null,
        aircraftLimitation: body.aircraftLimitation || "CARGO",
        operatorRestrictions: body.operatorRestrictions ? JSON.stringify(body.operatorRestrictions) : null,
        originRestrictions: body.originRestrictions ? JSON.stringify(body.originRestrictions) : null,
        destinationRestrictions: body.destinationRestrictions ? JSON.stringify(body.destinationRestrictions) : null,
        declarationStatus,
        eDgdStatus: "NOT_APPLICABLE",
        validationResult: JSON.stringify(validation),
      },
    });

    logger.info("[api/air/dg/declaration] POST created", {
      dgId: dgRecord.id,
      un: body.unNumber,
      declarationStatus,
      validationValid: validation.valid,
    });
    return NextResponse.json({
      declaration: dgRecord,
      validation,
    });
  } catch (err: any) {
    logger.error("[api/air/dg/declaration] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
