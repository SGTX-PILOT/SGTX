// SGTX Vessel Tracking API — single-shipment detail
// GET /api/sgtx/vessel-tracking/[ustn]
// Returns the full vessel tracking picture for a USTN: schedule, AI
// ETA prediction, live AIS position (if available), notifications.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackVesselWithAIS, searchVessel, type VesselTrackingResult } from "@/lib/sgtx/ai/vessel-tracking";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await context.params;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const shipments = await db.shipment.findMany({
      where: { ustn },
      orderBy: { sequence: "asc" },
      include: { trade: { select: { commodity: true, tradeValueUsd: true, incoterm: true, status: true } } },
    });
    if (shipments.length === 0) {
      return NextResponse.json({ error: "no shipments found for USTN", ustn }, { status: 404 });
    }

    const results: any[] = [];
    for (const s of shipments) {
      const vesselName = s.vesselName || "";
      const daysSince = s.departedAt
        ? Math.max(0, (Date.now() - s.departedAt.getTime()) / 86400000)
        : s.etd
        ? Math.max(0, (Date.now() - s.etd.getTime()) / 86400000)
        : 0;
      const scheduledDays = s.eta && (s.departedAt || s.etd)
        ? Math.max(1, Math.round((s.eta.getTime() - (s.departedAt || s.etd)!.getTime()) / 86400000))
        : 25;

      const tracked: VesselTrackingResult & { aisPosition: any; source: string } = await trackVesselWithAIS({
        vesselName,
        vesselImo: s.vesselImo || undefined,
        originPort: s.originPort,
        destinationPort: s.destPort,
        scheduledArrivalDays: scheduledDays,
        daysSinceDeparture: daysSince,
        cargoValueUsd: s.trade?.tradeValueUsd || undefined,
        ustn: s.ustn,
      });

      const dbVessel = vesselName ? searchVessel(vesselName) : null;

      results.push({
        shipment: {
          id: s.id,
          sequence: s.sequence,
          status: s.status,
          vesselName: s.vesselName,
          vesselImo: s.vesselImo,
          containerNo: s.containerNo,
          containerCount: s.containerCount,
          originPort: s.originPort,
          destPort: s.destPort,
          etd: s.etd,
          eta: s.eta,
          departedAt: s.departedAt,
          arrivedAt: s.arrivedAt,
          coldChainTemp: s.coldChainTemp,
          lat: s.lat,
          lng: s.lng,
          carrierGtid: s.carrierGtid,
        },
        trade: s.trade,
        vesselDbMatch: dbVessel,
        tracking: tracked,
      });
    }

    const allOnTime = results.every((r) => r.tracking?.vessel?.arrivalStatus === "ON_TIME");
    const anyDelayed = results.some((r) => r.tracking?.vessel?.arrivalStatus === "DELAYED");
    const anyAtRisk = results.some((r) => r.tracking?.vessel?.arrivalStatus === "AT_RISK");
    const anyEarly = results.some((r) => r.tracking?.vessel?.arrivalStatus === "EARLY");
    const liveSources = results.filter((r) => r.tracking?.source === "AIS_STREAM").length;

    return NextResponse.json({
      ustn,
      timestamp: new Date().toISOString(),
      shipmentCount: results.length,
      summary: {
        allOnTime,
        anyDelayed,
        anyAtRisk,
        anyEarly,
        liveAISCount: liveSources,
        simulatedCount: results.length - liveSources,
        earliestPredictedArrival: results
          .map((r) => r.tracking?.vessel?.predictedArrivalTime)
          .filter(Boolean)
          .sort()[0] || null,
      },
      shipments: results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "internal_error" }, { status: 500 });
  }
}
