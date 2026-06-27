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

    // Auto-trigger Certificate of Analysis when lab test PASSES (Part 5.7)
    if (passFail === "PASS" || passFail === "CONDITIONAL") {
      const certNo = `CoA-${id.slice(-8).toUpperCase()}`;
      await db.document.create({ data: { tradeId: labTest.tradeId, type: "CERTIFICATE_OF_ANALYSIS", title: `Certificate of Analysis — ${certNo} — ${labTest.testType.replace(/_/g, " ")}`, status: "VERIFIED", uploadedBy: labTest.labGtid, hashSha256: `coa-${id}-${Date.now()}` } }).catch(() => null);
    }

    const certNote = (passFail === "PASS" || passFail === "CONDITIONAL") ? ". Certificate of Analysis auto-issued." : "";
    await db.inboxItem.create({ data: { tenantGtid: labTest.trade.buyerGtid, tradeId: labTest.tradeId, category: "GENERAL", priority: 80, title: `Lab results: ${passFail}`, description: `${labTest.testType} result: ${result}. USTN: ${labTest.trade.ustn}${certNote}`, ctaLabel: "View Results" } }).catch(() => null);
    await db.inboxItem.create({ data: { tenantGtid: labTest.trade.sellerGtid, tradeId: labTest.tradeId, category: "GENERAL", priority: 80, title: `Lab results: ${passFail}`, description: `${labTest.testType} result: ${result}. USTN: ${labTest.trade.ustn}${certNote}`, ctaLabel: "View Results" } }).catch(() => null);
    return NextResponse.json({ ok: true, status: "COMPLETED", passFail, certificateIssued: passFail === "PASS" || passFail === "CONDITIONAL" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
