// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 2: Sales Orders
// GET  /api/sgtx/orders/sales-order   — list (filter: ?ustn=&sellerGtid=&buyerGtid=&status=)
// POST /api/sgtx/orders/sales-order   — create a standalone SO
import { NextResponse } from "next/server";
import {
  createSalesOrder,
  listSalesOrders,
} from "@/lib/sgtx/orders";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    const sellerGtid = url.searchParams.get("sellerGtid") || undefined;
    const buyerGtid = url.searchParams.get("buyerGtid") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const rows = await listSalesOrders({
      ustn: ustn || undefined,
      sellerGtid: sellerGtid || undefined,
      buyerGtid: buyerGtid || undefined,
      status: status || undefined,
    });
    return NextResponse.json({
      ok: true,
      salesOrders: rows,
      count: rows.length,
      filter: { ustn, sellerGtid, buyerGtid, status },
    });
  } catch (err: any) {
    logger.error("[api/sgtx/orders/sales-order] GET failed", {
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
    const required = ["ustn", "tradeId", "sellerGtid", "buyerGtid", "items"];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null || body[f] === "") {
        return NextResponse.json(
          { error: `${f} required` },
          { status: 400 },
        );
      }
    }
    const so = await createSalesOrder({
      ustn: body.ustn,
      tradeId: body.tradeId,
      poId: body.poId || null,
      sellerGtid: body.sellerGtid,
      buyerGtid: body.buyerGtid,
      items: body.items,
      currency: body.currency,
    });
    if (!so) {
      return NextResponse.json(
        { error: "failed to create sales order" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, salesOrder: so }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/sgtx/orders/sales-order] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
