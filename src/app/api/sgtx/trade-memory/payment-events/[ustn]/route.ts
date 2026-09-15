// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPaymentEvents, PAYMENT_EVENT_TYPES, PaymentEventType } from "@/lib/sgtx/trade-memory-payment";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/trade-memory/payment-events/[ustn]
// Query: ?eventType=PAYMENT_LEG_SETTLED&limit=N&sinceIso=...
// Lists all payment memory events for a specific USTN. Optional filters:
//   - eventType  — restrict to a single event type
//   - limit      — cap on number of events returned (default 200)
//   - sinceIso   — only events recorded at-or-after this timestamp
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const sp = req.nextUrl.searchParams;
    const eventTypeStr = sp.get("eventType");
    const sinceIso = sp.get("sinceIso") ?? undefined;
    const limit = sp.get("limit") ? Number(sp.get("limit")) : 200;

    let eventType: PaymentEventType | undefined;
    if (eventTypeStr) {
      if (!(PAYMENT_EVENT_TYPES as readonly string[]).includes(eventTypeStr)) {
        return NextResponse.json(
          { error: `eventType must be one of: ${PAYMENT_EVENT_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
      eventType = eventTypeStr as PaymentEventType;
    }

    const result = await getPaymentEvents(ustn, { eventType, limit, sinceIso });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/trade-memory/payment-events/[ustn]] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
