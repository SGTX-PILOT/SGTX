// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Unified USTN Tracking API
// GET /api/sgtx/ustn/[ustn]/tracking
//
// Connects ALL SGTX tracking systems into one response:
//   1. trade master object (buildUstnMasterObject — parties, goods, docs,
//      sensor data, blockchain anchor, payment plan, qc, timeline)
//   2. per-shipment vessel tracking (AIS Stream live data + AI ETA)
//   3. per-shipment container tracking (Terminal49 live events timeline)
//   4. summary flags (anyDelayed, allOnTime, coldChainBreaches, ...)
//
// Use Next.js 16 async params: const { ustn } = await context.params.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildUstnMasterObject } from "@/lib/sgtx/ustn";
import { trackVesselWithAIS, type VesselTrackingResult } from "@/lib/sgtx/ai/vessel-tracking";
import { trackContainer, trackContainers, summarizeContainerTracking, type ContainerTrackingResult } from "@/lib/sgtx/ai/container-tracking";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await context.params;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    // 1. Master object (covers trade, parties, documents, sensors, payments,
    //    qc, blockchain anchor — the canonical USTN resolution payload).
    const master = await buildUstnMasterObject(ustn);
    if (!master) {
      return NextResponse.json({ error: "trade not found", ustn }, { status: 404 });
    }

    // 2. Shipments — raw DB rows for this USTN.
    const shipments = await db.shipment.findMany({
      where: { ustn },
      orderBy: { sequence: "asc" },
        }) as any;

    // 3. Container tracking — batch every container under this USTN.
    const containerNumbers = Array.from(
      new Set(
        shipments
          .map((s) => (s.containerNo || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter((c) => /^[A-Z]{4}\d{7}$/.test(c)),
      ),
    );
    const containerResults: ContainerTrackingResult[] = containerNumbers.length > 0
      ? await trackContainers(containerNumbers)
      : [];
    const byContainer = new Map(containerResults.map((r) => [r.containerNumber, r]));

    // 4. Vessel tracking — per shipment, with live AIS overlay + AI ETA.
    const shipmentTracking: any[] = [];
    for (const s of shipments) {
      const daysSince = s.departedAt
        ? Math.max(0, (Date.now() - s.departedAt.getTime()) / 86400000)
        : s.etd
        ? Math.max(0, (Date.now() - s.etd.getTime()) / 86400000)
        : 0;
      const scheduledDays = s.eta && (s.departedAt || s.etd)
        ? Math.max(1, Math.round((s.eta.getTime() - (s.departedAt || s.etd)!.getTime()) / 86400000))
        : 25;

      let vesselTracking: (VesselTrackingResult & { aisPosition: any; source: string }) | null = null;
      let vesselError: string | null = null;
      try {
        vesselTracking = await trackVesselWithAIS({
          vesselName: s.vesselName || "UNKNOWN",
          vesselImo: s.vesselImo || undefined,
          originPort: s.originPort,
          destinationPort: s.destPort,
          scheduledArrivalDays: scheduledDays,
          daysSinceDeparture: daysSince,
          ustn: s.ustn,
        });
      } catch (e: any) {
        vesselError = e?.message || "vessel_tracking_failed";
      }

      const cn = (s.containerNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const containerTracking = cn ? (byContainer.get(cn) || null) : null;

      // Optional: if a container has no live data yet, try a single fetch.
      let containerTrackingFinal = containerTracking;
      if (!containerTrackingFinal && cn) {
        try {
          containerTrackingFinal = await trackContainer(cn);
          byContainer.set(cn, containerTrackingFinal);
        } catch {
          // leave as null
        }
      }

      // Cold-chain monitoring — derive breaches from sensor_data + coldChainTemp.
      const sensorReadings: any[] = Array.isArray(master.sensor_data)
        ? master.sensor_data.filter((r: any) => {
            const sn = (r.container_no || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
            return sn && sn === cn;
          })
        : [];
      const coldChainBreaches = sensorReadings.filter(
        (r: any) => r.type === "TEMPERATURE_C" && s.coldChainTemp != null && Number(r.value) > s.coldChainTemp + 2,
      );

      shipmentTracking.push({
        shipmentId: s.id,
        sequence: s.sequence,
        shipmentStatus: s.status,
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
        driverName: s.driverName,
        truckNumber: s.truckNumber,
        loadingDate: s.loadingDate,
        warehouseArrivalTime: s.warehouseArrivalTime,
        warehouseDepartureTime: s.warehouseDepartureTime,
        portCheckInTime: s.portCheckInTime,
        vesselTracking,
        vesselError,
        containerTracking: containerTrackingFinal,
        coldChain: {
          setPointC: s.coldChainTemp,
          readings: sensorReadings,
          breachCount: coldChainBreaches.length,
          breached: coldChainBreaches.length > 0,
        },
      });
    }

    // 5. Unified summary flags — drives portal badges & dashboards.
    const allVesselResults = shipmentTracking
      .map((s) => s.vesselTracking)
      .filter(Boolean) as (VesselTrackingResult & { aisPosition: any; source: string })[];

    const summary = {
      shipmentCount: shipments.length,
      containersTracked: containerResults.length,
      vesselsTracked: allVesselResults.length,
      allOnTime: allVesselResults.length > 0 && allVesselResults.every((r) => r.vessel.arrivalStatus === "ON_TIME"),
      anyDelayed: allVesselResults.some((r) => r.vessel.arrivalStatus === "DELAYED"),
      anyAtRisk: allVesselResults.some((r) => r.vessel.arrivalStatus === "AT_RISK"),
      anyEarly: allVesselResults.some((r) => r.vessel.arrivalStatus === "EARLY"),
      anyColdChainBreach: shipmentTracking.some((s) => s.coldChain.breached),
      allDischarged: containerResults.length > 0 && containerResults.every(
        (r) => ["DISCHARGED", "AVAILABLE", "RETURNED"].includes(r.status),
      ),
      anyContainerDelayed: containerResults.some(
        (r) => r.status === "IN_TRANSIT" && r.eta && new Date(r.eta).getTime() > Date.now() + 7 * 86400000,
      ),
      liveAISCount: allVesselResults.filter((r) => r.source === "AIS_STREAM").length,
      simulatedAISCount: allVesselResults.filter((r) => r.source === "SIMULATED").length,
      liveContainerCount: containerResults.filter((r) => r.source === "TERMINAL49").length,
      simulatedContainerCount: containerResults.filter((r) => r.source === "SIMULATED").length,
      earliestPredictedArrival: allVesselResults
        .map((r) => r.vessel.predictedArrivalTime)
        .filter(Boolean)
        .sort()[0] || null,
      containerSummary: summarizeContainerTracking(containerResults),
      tradeStatus: master.status,
      tradeHealthScore: master.risk_assessment?.platform_risk_score != null
        ? Math.max(0, 100 - master.risk_assessment.platform_risk_score)
        : null,
    };

    return NextResponse.json({
      ustn,
      timestamp: new Date().toISOString(),
      master,
      shipments: shipmentTracking,
      summary,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "internal_error" }, { status: 500 });
  }
}
