// @ts-nocheck
// POST /api/sgtx/air/cargo-xml/receive
// Body: { messageId, messageType?, payload? }
// Receives a Cargo-XML message. Currently MANUAL_REQUIRED — the platform
// parses incoming Cargo-XML but does not auto-apply state transitions.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const messageId = String(body.messageId);
    const messageType = String(body.messageType || "RES").toUpperCase();
    const payload = body.payload;

    // Look up the original message (stored as AirReconciliationEvent by the send endpoint)
    let originalMessage: any = null;
    try {
      originalMessage = await db.airReconciliationEvent.findFirst({
        where: { actualValue: messageId },
      });
    } catch (e: any) {
      logger.warn("[api/air/cargo-xml/receive] original message lookup failed", { error: e?.message });
    }

    // If the message has a USTN, update the related reconciliation event status
    if (originalMessage?.ustn) {
      try {
        await db.airReconciliationEvent.update({
          where: { id: originalMessage.id },
          data: {
            expectedValue: `${originalMessage.expectedValue}_ACK_${messageType}`,
            status: "RESOLVED",
            resolvedAt: new Date(),
          },
        });
      } catch (e: any) {
        logger.warn("[api/air/cargo-xml/receive] ack update failed", { error: e?.message });
      }
    }

    logger.info("[api/air/cargo-xml/receive] POST received", {
      messageId,
      messageType,
      ustn: originalMessage?.ustn,
    });

    return NextResponse.json({
      ok: true,
      messageId,
      messageType,
      receivedAt: new Date().toISOString(),
      matchedOriginalMessage: !!originalMessage,
      ustn: originalMessage?.ustn || null,
      payload,
      note: "Cargo-XML adapter is MANUAL_REQUIRED — message is acknowledged internally; operator must reconcile manually if payload requires state changes.",
    });
  } catch (err: any) {
    logger.error("[api/air/cargo-xml/receive] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
