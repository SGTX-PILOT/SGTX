// 3B.6 — List milestones + pallets + holds for a shipment (by USTN or shipmentId)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const shipmentId = req.nextUrl.searchParams.get("shipmentId");
  if (!ustn && !shipmentId) return NextResponse.json({ error: "ustn or shipmentId required" }, { status: 400 });

  const where: any = {};
  if (ustn) where.ustn = ustn;
  if (shipmentId) where.shipmentId = shipmentId;

  const [milestones, pallets, holds] = await Promise.all([
    db.milestone.findMany({ where, orderBy: { sequence: "asc" } }),
    db.palletDetail.findMany({ where, orderBy: [{ layerPosition: "asc" }, { layerIndex: "asc" }] }),
    db.shipmentHold.findMany({ where: { ...where, released: false } }),
  ]);

  const loadedCount = pallets.filter(p => p.loaded).length;
  const totalCount = pallets.length;
  const allPalletsLoaded = totalCount > 0 && loadedCount === totalCount;

  return NextResponse.json({
    milestones,
    pallets,
    holds,
    palletProgress: { loaded: loadedCount, total: totalCount, allLoaded: allPalletsLoaded },
    activeHolds: holds.length,
    hasBlockingDeliveryHold: holds.some(h => h.blocksDelivery),
    hasBlockingSettlementHold: holds.some(h => h.blocksSettlement),
  });
}
