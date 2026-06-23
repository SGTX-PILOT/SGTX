import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
    const missingItems: any[] = [];
    // Check trades without signatures
    const trades = await db.trade.findMany({ where: { OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }], status: { notIn: ["SETTLED", "COMPLETED", "CANCELLED"] } }, select: { id: true, ustn: true, buyerGtid: true, sellerGtid: true, status: true, blType: true }, take: 20 });
    for (const trade of trades) {
      // Check signatures
      const sigs = await db.qesSignature.findMany({ where: { ustn: trade.ustn } });
      if (!sigs.some(s => s.signerGtid === trade.buyerGtid)) missingItems.push({ id: `sig-buyer-${trade.ustn}`, category: "CONTRACT", severity: "BLOCKER", title: "Buyer contract signature missing", description: `Trade ${trade.ustn} needs buyer signature`, actionLabel: "Sign Contract", actionTab: "contract", ustn: trade.ustn });
      if (!sigs.some(s => s.signerGtid === trade.sellerGtid)) missingItems.push({ id: `sig-seller-${trade.ustn}`, category: "CONTRACT", severity: "BLOCKER", title: "Seller contract signature missing", description: `Trade ${trade.ustn} needs seller signature`, actionLabel: "Sign Contract", actionTab: "contract", ustn: trade.ustn });
      // Check documents
      const docs = await db.document.findMany({ where: { tradeId: trade.id, status: { in: ["REQUIRED", "MISSING"] } } });
      for (const doc of docs) {
        const isBlocker = ["PHYTO", "HEALTH_CERT", "BILL_LADING", "CONTRACT", "CERTIFICATE_ORIGIN", "CUSTOMS_DECL"].includes(doc.type);
        missingItems.push({ id: `doc-${doc.id}`, category: "DOCUMENTS", severity: isBlocker ? "BLOCKER" : "WARNING", title: `${doc.type} missing`, description: doc.title, actionLabel: "Upload Now", actionTab: "documents", ustn: trade.ustn });
      }
      // Check lab tests
      const labTests = await db.labTest.findMany({ where: { tradeId: trade.id, status: { in: ["REQUESTED", "TESTING"] } } });
      for (const lt of labTests) missingItems.push({ id: `lab-${lt.id}`, category: "LAB_TESTS", severity: "WARNING", title: `Lab test pending: ${lt.testType}`, description: `Sample ${lt.sampleRef} awaiting results`, actionLabel: "View Lab Tests", actionTab: "requests", ustn: trade.ustn });
      // Check QC inspections
      const qcs = await db.qcInspection.findMany({ where: { tradeId: trade.id, status: "SCHEDULED" } });
      for (const qc of qcs) missingItems.push({ id: `qc-${qc.id}`, category: "QC_INSPECTIONS", severity: "WARNING", title: `Inspection pending: ${qc.inspectionType}`, description: "Inspection scheduled but not completed", actionLabel: "View Inspections", actionTab: "schedule", ustn: trade.ustn });
      // Check logistics
      const shipments = await db.shipment.findMany({ where: { tradeId: trade.id, status: { in: ["PLANNED", "LOADED"] } } });
      for (const s of shipments) {
        if (!s.driverName) missingItems.push({ id: `logistics-${s.id}`, category: "LOGISTICS", severity: "WARNING", title: "Driver not assigned", description: `Shipment ${s.sequence} needs driver assignment`, actionLabel: "Assign Driver", actionTab: "assignments", ustn: trade.ustn });
      }
    }
    const blockerCount = missingItems.filter(i => i.severity === "BLOCKER").length;
    const warningCount = missingItems.filter(i => i.severity === "WARNING").length;
    return NextResponse.json({ ok: true, missingItems, totalMissing: missingItems.length, blockerCount, warningCount });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
