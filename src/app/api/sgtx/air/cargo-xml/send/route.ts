// @ts-nocheck
// POST /api/sgtx/air/cargo-xml/send
// Body: { ustn?, messageType, payload, recipientAirline?, awbNumber? }
// Sends an IATA Cargo-XML message (XNB, FBR, FZL, CXM, etc.) via the airline adapter.
// Currently MANUAL_REQUIRED — generates an internal messageId and persists a
// placeholder row in AirReconciliationEvent for tracking.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getAirlineAdapter } from "@/lib/sgtx/air-cargo/adapters";

export const dynamic = "force-dynamic";

const VALID_MSG_TYPES = new Set([
  "XNB",   // AWB number allocation
  "FBR",   // Flight booking request
  "FZL",   // Flight zoning/list
  "CXM",   // Cargo manifest
  "CSC",   // Capacity sales contract
  "FWB",   // Freight waybill
  "FHL",   // House waybill
  "RES",   // Response
  "STAT",  // Status update
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.messageType) {
      return NextResponse.json({ error: "messageType required" }, { status: 400 });
    }
    if (!body?.payload) {
      return NextResponse.json({ error: "payload required" }, { status: 400 });
    }
    const msgType = String(body.messageType).toUpperCase();
    if (!VALID_MSG_TYPES.has(msgType)) {
      return NextResponse.json(
        { error: `invalid messageType: ${msgType}. Valid: ${Array.from(VALID_MSG_TYPES).join(", ")}` },
        { status: 400 },
      );
    }

    // Generate internal message ID
    const internalMessageId = `SGTX-CXML-${msgType}-${Date.now().toString(36).toUpperCase()}`;

    // Try the airline adapter if recipientAirline is provided
    let adapterResult: any = null;
    if (body.recipientAirline) {
      try {
        const adapter = getAirlineAdapter(body.recipientAirline);
        adapterResult = await adapter.sendMessage(msgType, body.payload);
      } catch (e: any) {
        logger.warn("[api/air/cargo-xml/send] adapter call failed", { error: e?.message });
      }
    }

    // Persist a tracking row in AirReconciliationEvent (reusing it as a message log)
    if (body.ustn) {
      try {
        await db.airReconciliationEvent.create({
          data: {
            ustn: body.ustn,
            reconciliationType: "MANIFEST_MISMATCH" as any,
            expectedValue: `CXML_${msgType}_SENT`,
            actualValue: internalMessageId,
            status: "OPEN",
          },
        });
      } catch (e: any) {
        logger.warn("[api/air/cargo-xml/send] tracking row persist failed", { error: e?.message });
      }
    }

    logger.info("[api/air/cargo-xml/send] POST sent", {
      messageId: internalMessageId,
      messageType: msgType,
      recipientAirline: body.recipientAirline,
      adapterStatus: adapterResult?.status,
    });

    return NextResponse.json({
      ok: true,
      messageId: internalMessageId,
      messageType: msgType,
      recipientAirline: body.recipientAirline || null,
      adapterResult,
      note: "Cargo-XML adapter is MANUAL_REQUIRED — message is queued internally; operator must submit via airline portal.",
    });
  } catch (err: any) {
    logger.error("[api/air/cargo-xml/send] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
