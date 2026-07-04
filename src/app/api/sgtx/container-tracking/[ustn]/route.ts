// SGTX Container Tracking API — single-shipment detail
// GET /api/sgtx/container-tracking/[ustn]
// Returns the Terminal49 container tracking picture for every container
// attached to the shipments under the given USTN.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackContainer, trackContainers, summarizeContainerTracking } from "@/lib/sgtx/ai/container-tracking";

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

    const containerNumbers = Array.from(
      new Set(
        shipments
          .map((s) => (s.containerNo || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter((c) => /^[A-Z]{4}\d{7}$/.test(c)),
      ),
    );

    const trackingResults = containerNumbers.length > 0
      ? await trackContainers(containerNumbers)
      : [];

    const byContainer = new Map(trackingResults.map((r) => [r.containerNumber, r]));

    const shipmentsOut = shipments.map((s) => {
      const cn = (s.containerNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const t = cn ? byContainer.get(cn) : undefined;
      return {
        shipmentId: s.id,
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
        trade: s.trade,
        tracking: t || null,
      };
    });

    return NextResponse.json({
      ustn,
      timestamp: new Date().toISOString(),
      shipmentCount: shipments.length,
      containerCount: trackingResults.length,
      summary: summarizeContainerTracking(trackingResults),
      shipments: shipmentsOut,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "internal_error" }, { status: 500 });
  }
}

// POST allows a single-container refresh under a USTN scope.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await context.params;
    const body = await req.json().catch(() => ({}));
    const containerNumber = (body?.containerNumber || "").trim().toUpperCase();
    if (!containerNumber) {
      return NextResponse.json({ error: "containerNumber required in body" }, { status: 400 });
    }
    const shipment = await db.shipment.findFirst({
      where: { ustn, OR: [
        { containerNo: { contains: containerNumber } },
        { containerNo: { contains: containerNumber.replace(/([A-Z]{4})(\d{7})/, "$1 $2") } },
      ] },
    });
    if (!shipment) {
      return NextResponse.json({ error: "container not found on this USTN", ustn, containerNumber }, { status: 404 });
    }
    const result = await trackContainer(containerNumber);
    return NextResponse.json({ ustn, containerNumber, tracking: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "internal_error" }, { status: 500 });
  }
}
