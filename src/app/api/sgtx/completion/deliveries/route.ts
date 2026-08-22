// @ts-nocheck
// §1 Delivery Acceptance — list (GET) + create (POST)
// GET  /api/sgtx/completion/deliveries?ustn=X&receiverGtid=Y&status=Z
// POST /api/sgtx/completion/deliveries  body: CreateAcceptanceInput
import { NextResponse } from "next/server";
import {
  listDeliveryAcceptances,
  createDeliveryAcceptance,
} from "@/lib/sgtx/delivery-acceptance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const receiverGtid = url.searchParams.get("receiverGtid") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (receiverGtid) filters.receiverGtid = receiverGtid;
    if (status) filters.status = status;
    const deliveries = await listDeliveryAcceptances(filters);
    return NextResponse.json({ deliveries });
  } catch (err: any) {
    logger.error("[api/completion/deliveries] GET failed", {
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
    if (!body.ustn && !body.tradeId) {
      return NextResponse.json(
        { error: "ustn or tradeId is required" },
        { status: 400 },
      );
    }
    const delivery = await createDeliveryAcceptance(body);
    return NextResponse.json({ delivery });
  } catch (err: any) {
    logger.error("[api/completion/deliveries] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
