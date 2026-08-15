import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/dashboard?tenant=GTID
//
// FIX-12-FINAL / Fix 2 (HIGH — IDOR tenant isolation):
//   The `tenant` query param is now scoped to the caller's own tenant.
//   Middleware injects `x-tenant-gtid` from the verified session JWT. When the
//   request asks for a different tenant's dashboard AND the caller is not an
//   ADM-type platform admin, we return 403. GOV-type regulators are also
//   allowed because they have supervisory read access across tenants
//   (audit section S27 — RBAC).
export async function GET(req: NextRequest) {
  try {
    const tenant = req.nextUrl.searchParams.get("tenant");
    if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });

    // ── Tenant isolation (Fix 2) ─────────────────────────────────────
    const callerGtid = req.headers.get("x-tenant-gtid");
    if (callerGtid && callerGtid !== tenant) {
      let callerType: string | null = null;
      try {
        const caller = await db.tenant.findUnique({
          where: { gtid: callerGtid },
          select: { type: true },
        });
        callerType = caller?.type ?? null;
      } catch (err) {
        logger.error("[dashboard GET] tenant lookup failed during IDOR check", { callerGtid, err });
        return NextResponse.json(
          { error: "Not authorized to view this tenant's dashboard" },
          { status: 403 },
        );
      }
      if (callerType !== "ADM" && callerType !== "GOV") {
        return NextResponse.json(
          { error: "Not authorized to view this tenant's dashboard" },
          { status: 403 },
        );
      }
    }

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
      ? await db.financingBid.findMany({ where: { financierGtid: tenant }, include: { request: { include: { trade: { include: { seller: true, buyer: true } }, borrower: true, bids: true } } }, orderBy: { createdAt: "desc" } })
      : [];
    const openFinancingRequests = ["BANK", "PFI"].includes(tenantRecord?.type || "")
      ? await db.financingRequest.findMany({ where: { status: { in: ["REQUESTED", "RFQ_BROADCAST", "BIDDING_OPEN"] } }, include: { trade: { include: { seller: true, buyer: true } }, bids: true, borrower: true }, orderBy: { createdAt: "desc" } })
      : [];
    const disputes = ["TRD"].includes(tenantRecord?.type || "")
      ? await db.dispute.findMany({ where: { trade: { OR: [{ buyerGtid: tenant }, { sellerGtid: tenant }] } }, include: { trade: true }, orderBy: { createdAt: "desc" } })
      : [];

    return NextResponse.json({
      tenant: tenantRecord, inbox, tradesAsBuyer, tradesAsSeller, activities, invoices,
      labTests, qcInspections, customsDecls, shipmentsCarrier, financingBids, openFinancingRequests, disputes,
    });
  } catch (e: any) {
    logger.error("[dashboard GET] error:", e);
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
