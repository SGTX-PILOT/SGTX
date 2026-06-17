import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/dashboard?tenant=GTID
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });

  const [tenantRecord, inbox, tradesAsBuyer, tradesAsSeller, activities, invoices] = await Promise.all([
    db.tenant.findUnique({ where: { gtid: tenant }, include: { employees: true } }),
    db.inboxItem.findMany({ where: { tenantGtid: tenant, dismissed: false }, include: { trade: true }, orderBy: { priority: "desc" } }),
    db.trade.findMany({ where: { buyerGtid: tenant }, include: { shipments: true, buyer: true, seller: true }, orderBy: { createdAt: "desc" } }),
    db.trade.findMany({ where: { sellerGtid: tenant }, include: { shipments: true, buyer: true, seller: true }, orderBy: { createdAt: "desc" } }),
    db.activity.findMany({ where: { OR: [{ actorGtid: tenant }, { trade: { OR: [{ buyerGtid: tenant }, { sellerGtid: tenant }] } }] }, include: { trade: true, actor: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.invoice.findMany({ where: { OR: [{ payerGtid: tenant }, { payeeGtid: tenant }] }, include: { trade: true }, orderBy: { createdAt: "desc" } }),
  ]);

  const labTests = ["LAB"].includes(tenantRecord?.type || "")
    ? await db.labTest.findMany({ where: { labGtid: tenant }, include: { trade: { include: { seller: true, buyer: true } } }, orderBy: { createdAt: "desc" } })
    : [];
  const qcInspections = ["QC"].includes(tenantRecord?.type || "")
    ? await db.qcInspection.findMany({ where: { qcGtid: tenant }, include: { trade: { include: { seller: true, buyer: true } } }, orderBy: { createdAt: "desc" } })
    : [];
  const customsDecls = ["CBR"].includes(tenantRecord?.type || "")
    ? await db.customsDeclaration.findMany({ where: { brokerGtid: tenant }, include: { trade: { include: { seller: true, buyer: true } } }, orderBy: { createdAt: "desc" } })
    : [];
  const shipmentsCarrier = ["SHIP", "LSP"].includes(tenantRecord?.type || "")
    ? await db.shipment.findMany({ where: { carrierGtid: tenant }, include: { trade: { include: { seller: true, buyer: true } } }, orderBy: { createdAt: "desc" } })
    : [];
  const financingBids = ["BANK", "PFI"].includes(tenantRecord?.type || "")
    ? await db.financingBid.findMany({ where: { financierGtid: tenant }, include: { request: { include: { trade: { include: { borrower: true } }, borrower: true } } }, orderBy: { createdAt: "desc" } })
    : [];
  const openFinancingRequests = ["BANK", "PFI"].includes(tenantRecord?.type || "")
    ? await db.financingRequest.findMany({ where: { status: { in: ["OPEN", "BIDDING"] } }, include: { trade: { include: { borrower: true, seller: true, buyer: true } }, bids: true, borrower: true }, orderBy: { createdAt: "desc" } })
    : [];
  const disputes = ["TRD"].includes(tenantRecord?.type || "")
    ? await db.dispute.findMany({ where: { trade: { OR: [{ buyerGtid: tenant }, { sellerGtid: tenant }] } }, include: { trade: true }, orderBy: { createdAt: "desc" } })
    : [];

  return NextResponse.json({
    tenant: tenantRecord, inbox, tradesAsBuyer, tradesAsSeller, activities, invoices,
    labTests, qcInspections, customsDecls, shipmentsCarrier, financingBids, openFinancingRequests, disputes,
  });
}
