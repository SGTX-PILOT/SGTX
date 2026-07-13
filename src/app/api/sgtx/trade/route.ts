import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/trade?ustn=...  — full Trade Command Center payload
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

  const trade = await db.trade.findUnique({
    where: { ustn },
    include: {
      buyer: true,
      seller: true,
      shipments: true,
      // Containers (VGM / DG / seals / lot hierarchy). Added by TRADE-UI task
      // so the Container Compliance Panel can render the per-container grid
      // without a second round-trip. Backwards-compatible additive include.
      containers: { orderBy: { sequence: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
      activities: { include: { actor: true }, orderBy: { createdAt: "desc" }, take: 30 },
      invoices: { orderBy: { createdAt: "asc" } },
      timeline: { orderBy: { phase: "asc" } },
      chatMessages: { orderBy: { createdAt: "asc" } },
      labTests: { include: { lab: true } },
      qcInspections: { include: { qc: true } },
      customsDecls: { include: { broker: true } },
      financing: { include: { bids: { include: { financier: true } }, borrower: true } },
      disputes: true,
      quotations: { include: { provider: true } },
    },
  });

  if (!trade) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(trade);
}
