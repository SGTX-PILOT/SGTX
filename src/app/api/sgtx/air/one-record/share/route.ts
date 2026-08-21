// @ts-nocheck
// POST /api/sgtx/air/one-record/share
// Body: { ustn, recipientOrgId?, shareScope?, payload? }
// Shares an IATA ONE Record snapshot of the shipment. Currently the
// EgyptAirAdapter is in ONE Record onboarding phase — so we generate an
// internal share token and persist it as a tracking row.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    const shipment = await db.airCargoShipment.findFirst({
      where: { ustn: body.ustn },
      include: {
        waybills: true,
        cargoPieces: true,
        flightLegs: { orderBy: { sequence: "asc" } },
      },
    });
    if (!shipment) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    // Build a ONE Record-style snapshot (LogisticsObject collection)
    const oneRecordSnapshot = {
      version: "2.0",
      shipment: {
        id: shipment.id,
        ustn: shipment.ustn,
        originAirport: shipment.originAirport,
        destinationAirport: shipment.destinationAirport,
        serviceType: shipment.serviceType,
        cargoStatus: shipment.cargoStatus,
        totalPieces: shipment.totalPieces,
        totalGrossWeight: shipment.totalGrossWeight,
        chargeableWeight: shipment.chargeableWeight,
        currency: shipment.currency,
        plannedDeparture: shipment.plannedDeparture,
        plannedArrival: shipment.plannedArrival,
      },
      waybills: shipment.waybills.map((w: any) => ({
        type: w.awbType,
        number: w.awbNumber,
        origin: w.origin,
        destination: w.destination,
        pieces: w.pieces,
        grossWeight: w.grossWeight,
        chargeableWeight: w.chargeableWeight,
        commodity: w.commodity,
      })),
      cargoPieces: shipment.cargoPieces.map((p: any) => ({
        pieceId: p.pieceId,
        packageType: p.packageType,
        length: p.length,
        width: p.width,
        height: p.height,
        actualWeight: p.actualWeight,
        dgFlag: p.dgFlag,
      })),
      flightLegs: shipment.flightLegs.map((l: any) => ({
        sequence: l.sequence,
        flightNumber: l.flightNumber,
        operatingAirline: l.operatingAirline,
        origin: l.originAirport,
        destination: l.destinationAirport,
        scheduledDeparture: l.scheduledDeparture,
        scheduledArrival: l.scheduledArrival,
        status: l.status,
      })),
      sharedAt: new Date().toISOString(),
      sharedWith: body.recipientOrgId || null,
      shareScope: body.shareScope || "FULL",
    };

    // Generate a share token
    const shareToken = `1R-${shipment.ustn}-${Date.now().toString(36).toUpperCase()}`;

    // Persist a tracking row
    try {
      await db.airReconciliationEvent.create({
        data: {
          ustn: body.ustn,
          reconciliationType: "MANIFEST_MISMATCH" as any,
          expectedValue: `ONE_RECORD_SHARED_${shareToken}`,
          actualValue: body.recipientOrgId || "PUBLIC",
          status: "OPEN",
        },
      });
    } catch (e: any) {
      logger.warn("[api/air/one-record/share] tracking row persist failed", { error: e?.message });
    }

    logger.info("[api/air/one-record/share] POST shared", {
      ustn: body.ustn,
      shareToken,
      recipient: body.recipientOrgId,
    });

    return NextResponse.json({
      ok: true,
      shareToken,
      sharedAt: new Date().toISOString(),
      recipientOrgId: body.recipientOrgId || null,
      snapshot: oneRecordSnapshot,
      note: "EgyptAir ONE Record adapter is in onboarding phase — snapshot is internal only; share token does not auto-deliver to airline.",
    });
  } catch (err: any) {
    logger.error("[api/air/one-record/share] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
