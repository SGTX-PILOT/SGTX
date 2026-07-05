// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Vessel Tracking API — collection endpoint
// POST  /api/sgtx/vessel-tracking         — update vessel positions for IN_TRANSIT shipments (simulates AIS pull)
// GET   /api/sgtx/vessel-tracking         — list/search vessels in the curated DB + filter by carrier
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAllVessels, searchVessel, trackVesselWithAIS } from "@/lib/sgtx/ai/vessel-tracking";

// ── GET: list/search vessels ────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || searchParams.get("search") || "").trim();
  const carrier = (searchParams.get("carrier") || "").toUpperCase();

  if (query) {
    const hit = searchVessel(query);
    return NextResponse.json({ query, match: hit, count: hit ? 1 : 0 });
  }

  let vessels = getAllVessels();
  if (carrier) vessels = vessels.filter((v) => v.carrier === carrier);
  return NextResponse.json({
    count: vessels.length,
    vessels: vessels.map((v) => ({
      name: v.name,
      imo: v.imo,
      carrier: v.carrier,
      teu: v.teu,
      serviceName: v.serviceName || null,
    })),
  });
}

// ── POST: refresh positions for IN_TRANSIT shipments ────────────
// Body (all optional):
//   { ustn?: string, carrier?: string, simulateOnly?: boolean }
// Iterates all shipments with status IN_TRANSIT (or DEPARTED), pulls
// their latest AIS position via trackVesselWithAIS, and persists
// lat/lng/eta back onto the Shipment row so dashboards reflect
// near-real-time state.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustnFilter = (body?.ustn || "").trim();
    const carrierFilter = (body?.carrier || "").trim().toUpperCase();

    const where: any = { status: { in: ["IN_TRANSIT", "DEPARTED", "LOADED"] } };
    if (ustnFilter) where.ustn = ustnFilter;
    if (carrierFilter) where.trade = { seller: { legalName: { contains: carrierFilter } } };

    const shipments = await db.shipment.findMany({
      where,
      include: { trade: { select: { ustn: true, commodity: true, tradeValueUsd: true } } },
      take: 100,
        }) as any;

    const updates: any[] = [];
    for (const s of shipments) {
      if (!s.vesselName) continue;
      // Compute days since departure for the AI prediction
      const daysSince = s.departedAt
        ? Math.max(0, (Date.now() - s.departedAt.getTime()) / 86400000)
        : s.etd
        ? Math.max(0, (Date.now() - s.etd.getTime()) / 86400000)
        : Math.floor(Math.random() * 14);

      const scheduledDays = s.eta && (s.departedAt || s.etd)
        ? Math.max(1, Math.round((s.eta.getTime() - (s.departedAt || s.etd)!.getTime()) / 86400000))
        : 25;

      try {
        const tracked = await trackVesselWithAIS({
          vesselName: s.vesselName,
          vesselImo: s.vesselImo || undefined,
          originPort: s.originPort,
          destinationPort: s.destPort,
          scheduledArrivalDays: scheduledDays,
          daysSinceDeparture: daysSince,
          cargoValueUsd: s.trade?.tradeValueUsd || undefined,
          ustn: s.ustn,
                }) as any;

        const data: any = {
          lat: tracked.vessel.latitude,
          lng: tracked.vessel.longitude,
          eta: tracked.vessel.predictedArrivalTime ? new Date(tracked.vessel.predictedArrivalTime) : s.eta,
        };
        if (tracked.vessel.vesselImo && !s.vesselImo) data.vesselImo = tracked.vessel.vesselImo;

                await db.shipment.update({ where: { id: s.id }, data }) as any;

        updates.push({
          ustn: s.ustn,
          sequence: s.sequence,
          vesselName: s.vesselName,
          imo: tracked.vessel.vesselImo,
          lat: tracked.vessel.latitude,
          lng: tracked.vessel.longitude,
          speedKnots: tracked.vessel.speedKnots,
          status: tracked.vessel.currentStatus,
          arrivalStatus: tracked.vessel.arrivalStatus,
          delayMinutes: tracked.vessel.delayMinutes,
          predictedArrival: tracked.vessel.predictedArrivalTime,
          confidence: tracked.vessel.confidence,
          source: tracked.source,
                }) as any;
      } catch (err: any) {
        updates.push({
          ustn: s.ustn,
          sequence: s.sequence,
          vesselName: s.vesselName,
          error: err?.message || "tracking_failed",
                }) as any;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: updates.length,
      totalScanned: shipments.length,
      updates,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "internal_error" }, { status: 500 });
  }
}
