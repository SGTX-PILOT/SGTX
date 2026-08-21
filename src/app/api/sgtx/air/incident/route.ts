// @ts-nocheck
// POST /api/sgtx/air/incident
// Body: { shipmentId, ustn?, irregularityType, description?, flightNumber?,
//         airport?, severity?, status?, aiEscalationLevel? }
// Creates an AirIrregularity row (exception state). Does NOT modify the
// shipment's primary cargoStatus — exception states live on AirIrregularity rows.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_IRREG_TYPES = new Set([
  "DELAY",
  "CANCELLATION",
  "OFFLOAD",
  "NO_SHOW",
  "MISCONNECT",
  "MISROUTE",
  "SHORTAGE",
  "DAMAGE",
  "SECURITY_HOLD",
  "DG_REJECTION",
  "CUSTOMS_HOLD",
  "ULD_SHORTAGE",
  "AIRPORT_CLOSURE",
  "WEATHER",
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
    if (!body?.irregularityType) {
      return NextResponse.json({ error: "irregularityType required" }, { status: 400 });
    }
    const irregType = String(body.irregularityType).toUpperCase();
    if (!VALID_IRREG_TYPES.has(irregType)) {
      return NextResponse.json(
        { error: `invalid irregularityType: ${irregType}` },
        { status: 400 },
      );
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

    const incident = await db.airIrregularity.create({
      data: {
        shipmentId,
        ustn: ustn || "",
        irregularityType: irregType,
        description: body.description || null,
        flightNumber: body.flightNumber || null,
        airport: body.airport || null,
        severity: body.severity || "MEDIUM",
        status: body.status || "OPEN",
        aiEscalationLevel: body.aiEscalationLevel || null,
      },
    });

    logger.info("[api/air/incident] POST created", {
      incidentId: incident.id,
      ustn,
      irregularityType: irregType,
      severity: incident.severity,
    });
    return NextResponse.json({ incident });
  } catch (err: any) {
    logger.error("[api/air/incident] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
