import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { result, passFail, parameters } = await req.json();
    const labTest = await db.labTest.findUnique({ where: { id }, include: { trade: true } });
    if (!labTest) return NextResponse.json({ error: "Lab test not found" }, { status: 404 });
    await db.labTest.update({ where: { id }, data: { result, passFail, parameters: parameters || null, status: "COMPLETED", completedAt: new Date() } });
    await db.document.create({ data: { tradeId: labTest.tradeId, type: "LAB_REPORT", title: `Lab Report — ${labTest.testType}`, status: "UPLOADED", uploadedBy: labTest.labGtid, hashSha256: `lab-${id}-${Date.now()}` } }).catch(() => null);
    await db.inboxItem.create({ data: { tenantGtid: labTest.trade.buyerGtid, tradeId: labTest.tradeId, category: "GENERAL", priority: 80, title: `Lab results: ${passFail}`, description: `${labTest.testType} result: ${result}. USTN: ${labTest.trade.ustn}`, ctaLabel: "View Results" } }).catch(() => null);
    await db.inboxItem.create({ data: { tenantGtid: labTest.trade.sellerGtid, tradeId: labTest.tradeId, category: "GENERAL", priority: 80, title: `Lab results: ${passFail}`, description: `${labTest.testType} result: ${result}. USTN: ${labTest.trade.ustn}`, ctaLabel: "View Results" } }).catch(() => null);
    return NextResponse.json({ ok: true, status: "COMPLETED", passFail });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
