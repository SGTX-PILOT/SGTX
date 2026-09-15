// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  recordPaymentEvent,
  getPaymentEvents,
  listAllPaymentEvents,
  PAYMENT_EVENT_TYPES,
  PaymentEventType,
} from "@/lib/sgtx/trade-memory-payment";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/trade-memory/payment-events
// Body: { ustn, eventType, eventData, tenantGtid? }
// Records a payment lifecycle event into the Trade Memory layer under
// category "PAYMENT". See PAYMENT_EVENT_TYPES for the allowed enum values.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, eventType, eventData, tenantGtid } = body;

    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!eventType || !(PAYMENT_EVENT_TYPES as readonly string[]).includes(eventType)) {
      return NextResponse.json(
        { error: `eventType must be one of: ${PAYMENT_EVENT_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    if (!eventData || typeof eventData !== "object") {
      return NextResponse.json({ error: "eventData object required" }, { status: 400 });
    }

    const result = await recordPaymentEvent({
      ustn,
      eventType: eventType as PaymentEventType,
      eventData,
      tenantGtid: tenantGtid ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/trade-memory/payment-events] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

// GET /api/sgtx/trade-memory/payment-events
// Query: ?tenantGtid=X&limit=N&offset=N
// Lists all payment memory events (cross-USTN) for a tenant, or all events
// if no tenant filter is provided.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tenantGtid = sp.get("tenantGtid") ?? undefined;
    const limit = sp.get("limit") ? Number(sp.get("limit")) : 100;
    const offset = sp.get("offset") ? Number(sp.get("offset")) : 0;
    const result = await listAllPaymentEvents({ tenantGtid, limit, offset });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/trade-memory/payment-events] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
