// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 2: Purchase Orders (by id)
// GET   /api/sgtx/orders/purchase-order/[id]   — fetch PO
// PATCH /api/sgtx/orders/purchase-order/[id]   — lifecycle transition
//   body: { action: "send" | "accept" | "reject" }
import { NextRequest, NextResponse } from "next/server";
import {
  getPurchaseOrder,
  sendPurchaseOrder,
  acceptPurchaseOrder,
  rejectPurchaseOrder,
} from "@/lib/sgtx/orders";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const po = await getPurchaseOrder(id);
    if (!po) {
      return NextResponse.json(
        { error: "purchase order not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (err: any) {
    logger.error("[api/sgtx/orders/purchase-order/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const action = String(body.action || "").toLowerCase();
    if (!action) {
      return NextResponse.json(
        { error: "action required (send | accept | reject)" },
        { status: 400 },
      );
    }
    if (action === "send") {
      const po = await sendPurchaseOrder(id);
      if (!po) {
        return NextResponse.json(
          { error: "purchase order not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, purchaseOrder: po });
    }
    if (action === "accept") {
      const { purchaseOrder, salesOrder } = await acceptPurchaseOrder(id);
      if (!purchaseOrder) {
        return NextResponse.json(
          { error: "purchase order not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        purchaseOrder,
        salesOrder,
      });
    }
    if (action === "reject") {
      const po = await rejectPurchaseOrder(id);
      if (!po) {
        return NextResponse.json(
          { error: "purchase order not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, purchaseOrder: po });
    }
    return NextResponse.json(
      { error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/sgtx/orders/purchase-order/[id]] PATCH failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
