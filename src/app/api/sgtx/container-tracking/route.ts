// SGTX Container Tracking API — collection endpoint
// POST /api/sgtx/container-tracking
//   Body (optional): { ustn?: string, simulateOnly?: boolean }
//   Pulls live Terminal49 tracking for every shipment's container under
//   the given USTN (or all trades if no USTN supplied).
//
// GET is intentionally not implemented — use /api/sgtx/container-tracking/[ustn]
// to fetch a per-trade container tracking picture.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackContainer, trackContainers, summarizeContainerTracking } from "@/lib/sgtx/ai/container-tracking";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustnFilter = (body?.ustn || "").trim();

    const where: any = {};
    if (ustnFilter) where.ustn = ustnFilter;
    // Only shipments that actually have a container number are trackable.
    where.containerNo = { not: null };

    const shipments = await db.shipment.findMany({
      where,
      include: { trade: { select: { ustn: true, commodity: true, status: true } } },
      take: 200,
    });

    const containerNumbers = Array.from(
      new Set(
        shipments
          .map((s) => (s.containerNo || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter((c) => /^[A-Z]{4}\d{7}$/.test(c)) as string[],
      ),
    );

    const trackingResults = containerNumbers.length > 0
      ? await trackContainers(containerNumbers)
      : [];

    // Index results by container number for the response payload.
    const byContainer = new Map(trackingResults.map((r) => [r.containerNumber, r]));

    const shipmentsTracking = shipments.map((s) => {
      const cn = (s.containerNo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const t = cn ? byContainer.get(cn) : undefined;
      return {
        ustn: s.ustn,
        sequence: s.sequence,
        shipmentStatus: s.status,
        vesselName: s.vesselName,
        containerNo: s.containerNo,
        containerCount: s.containerCount,
        originPort: s.originPort,
        destPort: s.destPort,
        trade: s.trade,
        tracking: t || null,
      };
    });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ustn: ustnFilter || null,
      totalShipments: shipments.length,
      totalContainersTracked: trackingResults.length,
      summary: summarizeContainerTracking(trackingResults),
      shipments: shipmentsTracking,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "internal_error" }, { status: 500 });
  }
}

// GET intentionally returns 405 — use /[ustn] for reads.
export async function GET() {
  return NextResponse.json(
    { error: "method_not_allowed", hint: "Use POST to refresh tracking for all containers, or GET /api/sgtx/container-tracking/[ustn] for a single trade." },
    { status: 405 },
  );
}

// Re-export trackContainer for callers that want the library directly.
export { trackContainer };
