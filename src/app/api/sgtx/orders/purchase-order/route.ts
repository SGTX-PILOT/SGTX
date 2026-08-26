// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 2: Purchase Orders
// GET  /api/sgtx/orders/purchase-order   — list (filter: ?ustn=&buyerGtid=&sellerGtid=&status=)
// POST /api/sgtx/orders/purchase-order   — create a DRAFT PO
import { NextResponse } from "next/server";
import {
  createPurchaseOrder,
  listPurchaseOrders,
} from "@/lib/sgtx/orders";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    const buyerGtid = url.searchParams.get("buyerGtid") || undefined;
    const sellerGtid = url.searchParams.get("sellerGtid") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const rows = await listPurchaseOrders({
      ustn: ustn || undefined,
      buyerGtid: buyerGtid || undefined,
      sellerGtid: sellerGtid || undefined,
      status: status || undefined,
    });
    return NextResponse.json({
      ok: true,
      purchaseOrders: rows,
      count: rows.length,
      filter: { ustn, buyerGtid, sellerGtid, status },
    });
  } catch (err: any) {
    logger.error("[api/sgtx/orders/purchase-order] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const required = ["ustn", "tradeId", "buyerGtid", "sellerGtid", "incoterm", "items"];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null || body[f] === "") {
        return NextResponse.json(
          { error: `${f} required` },
          { status: 400 },
        );
      }
    }
    const po = await createPurchaseOrder({
      ustn: body.ustn,
      tradeId: body.tradeId,
      buyerGtid: body.buyerGtid,
      sellerGtid: body.sellerGtid,
      items: body.items,
      currency: body.currency,
      incoterm: body.incoterm,
      deliveryDate: body.deliveryDate || null,
      paymentTerms: body.paymentTerms || null,
      deliveryTerms: body.deliveryTerms || null,
    });
    if (!po) {
      return NextResponse.json(
        { error: "failed to create purchase order" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, purchaseOrder: po }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/sgtx/orders/purchase-order] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
