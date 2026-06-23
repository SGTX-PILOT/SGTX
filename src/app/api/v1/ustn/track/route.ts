import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";

// POST /api/v1/ustn/track — public USTN tracking (trade status only).
// Body: { ustn: string }
// Returns: public trade status, phase, parties (legal names + GTIDs), milestones, ETA.
// NO private data (financial details, documents, internal IDs).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn } = body;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const trade = await db.trade.findUnique({
      where: { ustn },
      select: {
        ustn: true,
        commodity: true,
        commodityHs: true,
        incoterm: true,
        originPort: true,
        destPort: true,
        originCountry: true,
        destCountry: true,
        phase: true,
        status: true,
        healthScore: true,
        coldChain: true,
        containerCount: true,
        multiShipment: true,
        transportMode: true,
        grossWeightKg: true,
        netWeightKg: true,
        currency: true,
        blType: true,
        createdAt: true,
        buyer: { select: { gtid: true, legalName: true, country: true } },
        seller: { select: { gtid: true, legalName: true, country: true } },
        shipments: {
          select: {
            sequence: true,
            status: true,
            originPort: true,
            destPort: true,
            etd: true,
            eta: true,
            vesselName: true,
          },
          orderBy: { sequence: "asc" },
        },
        timeline: {
          select: { phase: true, label: true, description: true, completed: true, completedAt: true },
          orderBy: { phase: "asc" },
        },
      },
    });

    if (!trade) return NextResponse.json({ error: "USTN not found" }, { status: 404 });

    return NextResponse.json({
      ustn: trade.ustn,
      commodity: trade.commodity,
      hs_code: trade.commodityHs,
      incoterm: trade.incoterm,
      phase: trade.phase,
      status: trade.status,
      health_score: trade.healthScore,
      cold_chain: trade.coldChain,
      bl_type: trade.blType,
      origin: { port: trade.originPort, country: trade.originCountry },
      destination: { port: trade.destPort, country: trade.destCountry },
      buyer: trade.buyer,
      seller: trade.seller,
      container_count: trade.containerCount,
      multi_shipment: trade.multiShipment,
      transport_mode: trade.transportMode,
      weight: { gross_kg: trade.grossWeightKg, net_kg: trade.netWeightKg },
      currency: trade.currency,
      created_at: trade.createdAt,
      shipments: trade.shipments.map(s => ({
        sequence: s.sequence,
        status: s.status,
        origin_port: s.originPort,
        dest_port: s.destPort,
        etd: s.etd,
        eta: s.eta,
        vessel: s.vesselName,
      })),
      timeline: trade.timeline.map(t => ({
        phase: t.phase,
        label: t.label,
        description: t.description,
        completed: t.completed,
        completed_at: t.completedAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/v1/ustn/track?ustn=... — same as POST but via query param
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  return POST(new NextRequest(new URL(`/api/v1/ustn/track`, req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ustn }),
  }));
}
