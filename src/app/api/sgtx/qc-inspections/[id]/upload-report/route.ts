import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { result, defectCount, notes, actionPlan, defectsJson } = await req.json();
    const inspection = await db.qcInspection.findUnique({ where: { id }, include: { trade: true } });
    if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    await db.qcInspection.update({ where: { id }, data: { result, defectCount: defectCount || 0, notes, actionPlan, defectsJson: defectsJson || "[]", status: "COMPLETED", completedAt: new Date() } });
    await db.document.create({ data: { tradeId: inspection.tradeId, type: "QC_REPORT", title: `QC Report — ${inspection.inspectionType}`, status: "UPLOADED", uploadedBy: inspection.qcGtid, hashSha256: `qc-${id}-${Date.now()}` } }).catch(() => null);
    await db.inboxItem.create({ data: { tenantGtid: inspection.trade.buyerGtid, tradeId: inspection.tradeId, category: "GENERAL", priority: 80, title: `QC Result: ${result}`, description: `${inspection.inspectionType}: ${result}. Defects: ${defectCount || 0}. ${notes || ""}`, ctaLabel: "View Report" } }).catch(() => null);
    await db.inboxItem.create({ data: { tenantGtid: inspection.trade.sellerGtid, tradeId: inspection.tradeId, category: "GENERAL", priority: 80, title: `QC Result: ${result}`, description: `${inspection.inspectionType}: ${result}. Defects: ${defectCount || 0}. ${notes || ""}`, ctaLabel: "View Report" } }).catch(() => null);
    return NextResponse.json({ ok: true, status: "COMPLETED", result });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
