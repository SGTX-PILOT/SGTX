import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest) {
  try {
    const { ustn, labGtid, testType, sampleRef } = await req.json();
    if (!ustn || !labGtid || !testType) return NextResponse.json({ error: "ustn, labGtid, testType required" }, { status: 400 });
    const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true, buyerGtid: true, sellerGtid: true } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const labTest = await db.labTest.create({ data: { tradeId: trade.id, labGtid, testType, sampleRef: sampleRef || "SMP-" + Date.now().toString(36), status: "REQUESTED" } });
    await db.inboxItem.create({ data: { tenantGtid: labGtid, tradeId: trade.id, category: "GENERAL", priority: 75, title: `Lab test requested: ${testType}`, description: `New ${testType} test requested for ${ustn}. Sample ref: ${labTest.sampleRef}`, ctaLabel: "Start Testing" } }).catch(() => null);
    return NextResponse.json({ ok: true, labTestId: labTest.id, status: "REQUESTED" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const labGtid = req.nextUrl.searchParams.get("labGtid");
  const where: any = {};
  if (ustn) { const t = await db.trade.findUnique({ where: { ustn }, select: { id: true } }); if (t) where.tradeId = t.id; }
  if (labGtid) where.labGtid = labGtid;
  const labTests = await db.labTest.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ ok: true, labTests, total: labTests.length });
}
