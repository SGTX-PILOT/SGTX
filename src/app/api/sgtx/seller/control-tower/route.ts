// GET /api/sgtx/seller/control-tower?sellerGtid=X — build Seller Control Tower
import { NextRequest, NextResponse } from "next/server";
import { buildControlTower } from "@/lib/sgtx/seller/control-tower";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sellerGtid = url.searchParams.get("sellerGtid");
    if (!sellerGtid) {
      return NextResponse.json({ ok: false, error: "sellerGtid required" }, { status: 400 });
    }

    // Fetch dashboard data
    const [trades, inbox, invoices, shipments] = await Promise.all([
      db.trade.findMany({ where: { sellerGtid }, include: { shipments: true }, orderBy: { createdAt: "desc" } }),
      db.inboxItem.findMany({ where: { tenantGtid: sellerGtid, dismissed: false }, orderBy: { priority: "desc" } }),
      db.invoice.findMany({ where: { OR: [{ payeeGtid: sellerGtid }, { payerGtid: sellerGtid }] }, orderBy: { createdAt: "desc" } }),
      db.shipment.findMany({ where: { trade: { sellerGtid } }, orderBy: { createdAt: "desc" } }),
    ]);

    const allShipments = trades.flatMap((t) => t.shipments || []);

    const result = buildControlTower({
      sellerGtid,
      trades,
      inbox,
      invoices,
      shipments: allShipments,
      dataScope: { hideMargin: false, hideSgtxFee: false, hideFreight: false },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("control-tower GET failed", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}
