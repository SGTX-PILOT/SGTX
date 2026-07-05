// 8.9.1 — Auto-Revoke on Event endpoint.
// POST /api/sgtx/release/auto-revoke
// Body: { ustn, eventType }
// eventType ∈ { DISPUTE_RAISED, PAYMENT_REVERSAL, CUSTOMS_HOLD, SANCTIONS_FLAG }
// Calls autoRevokeOnEvent() which revokes ALL active authorisations for the
// USTN (across all containers) with the appropriate reason, and emits a Smart
// Inbox alert to the shipping line. Designed to be called by upstream event
// producers (dispute service, payment service, customs integration, sanctions
// screening job).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { autoRevokeOnEvent, AutoRevokeEventType } from "@/lib/sgtx/release";

const ALLOWED_EVENTS: AutoRevokeEventType[] = [
  "DISPUTE_RAISED",
  "PAYMENT_REVERSAL",
  "CUSTOMS_HOLD",
  "SANCTIONS_FLAG",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, eventType } = body as { ustn?: string; eventType?: string };

    if (!ustn || !eventType) {
      return NextResponse.json(
        { error: "ustn and eventType required. eventType must be one of: " + ALLOWED_EVENTS.join(", ") },
        { status: 400 }
      );
    }
    if (!ALLOWED_EVENTS.includes(eventType as AutoRevokeEventType)) {
      return NextResponse.json(
        { error: `Invalid eventType. Allowed: ${ALLOWED_EVENTS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await autoRevokeOnEvent(ustn, eventType as AutoRevokeEventType);

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[release/auto-revoke] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
