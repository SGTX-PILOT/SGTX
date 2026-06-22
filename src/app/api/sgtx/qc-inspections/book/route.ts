import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest) {
  try {
    const { ustn, qcGtid, inspectionType, inspectionDate, inspectionLocation } = await req.json();
    if (!ustn || !qcGtid || !inspectionType) return NextResponse.json({ error: "ustn, qcGtid, inspectionType required" }, { status: 400 });
    const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true, buyerGtid: true, sellerGtid: true } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const inspection = await db.qcInspection.create({ data: { tradeId: trade.id, qcGtid, inspectionType, status: "SCHEDULED" } });
    await db.inboxItem.create({ data: { tenantGtid: qcGtid, tradeId: trade.id, category: "GENERAL", priority: 75, title: `Inspection scheduled: ${inspectionType}`, description: `${inspectionType} inspection for ${ustn}. Date: ${inspectionDate || "TBD"}. Location: ${inspectionLocation || "TBD"}`, ctaLabel: "Accept Inspection" } }).catch(() => null);
    return NextResponse.json({ ok: true, inspectionId: inspection.id, status: "SCHEDULED" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const qcGtid = req.nextUrl.searchParams.get("qcGtid");
  const where: any = {};
  if (ustn) { const t = await db.trade.findUnique({ where: { ustn }, select: { id: true } }); if (t) where.tradeId = t.id; }
  if (qcGtid) where.qcGtid = qcGtid;
  const inspections = await db.qcInspection.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ ok: true, qcInspections: inspections, total: inspections.length });
}
