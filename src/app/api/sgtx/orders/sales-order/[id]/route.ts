// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 2: Sales Orders (by id)
// GET   /api/sgtx/orders/sales-order/[id]   — fetch SO
// PATCH /api/sgtx/orders/sales-order/[id]   — lifecycle transition
//   body: { action: "accept" | "fulfill" }
import { NextRequest, NextResponse } from "next/server";
import {
  getSalesOrder,
  acceptSalesOrder,
  fulfillSalesOrder,
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
    const so = await getSalesOrder(id);
    if (!so) {
      return NextResponse.json(
        { error: "sales order not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, salesOrder: so });
  } catch (err: any) {
    logger.error("[api/sgtx/orders/sales-order/[id]] GET failed", {
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
        { error: "action required (accept | fulfill)" },
        { status: 400 },
      );
    }
    if (action === "accept") {
      const so = await acceptSalesOrder(id);
      if (!so) {
        return NextResponse.json(
          { error: "sales order not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, salesOrder: so });
    }
    if (action === "fulfill") {
      const so = await fulfillSalesOrder(id);
      if (!so) {
        return NextResponse.json(
          { error: "sales order not found or update failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, salesOrder: so });
    }
    return NextResponse.json(
      { error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/sgtx/orders/sales-order/[id]] PATCH failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
