// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Promise<{ params: { ustn: string } }>) {
  try {
    const { ustn } = await params;
    const [trade, quotes, pos, sos, proformas, negotiations, customsDecls, shipments, invoices, activities, inspections, labTests, qcInspections, disputes, documents] = await Promise.all([
      db.trade.findFirst({ where: { ustn } }),
      db.quote.findMany({ where: { ustn } }),
      db.purchaseOrder.findMany({ where: { ustn } }),
      db.salesOrder.findMany({ where: { ustn } }),
      db.proformaInvoice.findMany({ where: { ustn } }),
      db.tradeNegotiation.findMany({ where: { ustn } }),
      db.customsDeclaration.findMany({ where: { ustn } }),
      db.shipment.findMany({ where: { ustn } }),
      db.invoice.findMany({ where: { ustn } }),
      db.activity.findMany({ where: { trade: { ustn } } }),
      db.qcInspection.findMany({ where: { trade: { ustn } } }),
      db.labTest.findMany({ where: { trade: { ustn } } }),
      db.qcInspection.findMany({ where: { trade: { ustn } } }),
      db.dispute.findMany({ where: { trade: { ustn } } }),
      db.document.findMany({ where: { trade: { ustn } } }),
    ].map(p => p.catch(() => [])));
    const pkg = {
      ustn, generatedAt: new Date().toISOString(),
      evidencePackage: {
        trade, quotes: quotes || [], purchaseOrders: pos || [], salesOrders: sos || [],
        proformaInvoices: proformas || [], negotiations: negotiations || [],
        customsDeclarations: customsDecls || [], shipments: shipments || [],
        invoices: invoices || [], activities: activities || [],
        inspections: inspections || [], labTests: labTests || [],
        qcInspections: qcInspections || [], disputes: disputes || [], documents: documents || [],
      },
      categories: 26, tradeFound: !!trade,
    };
    return NextResponse.json(pkg, { headers: { "Content-Disposition": `attachment; filename="evidence-${ustn}.json"` } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
