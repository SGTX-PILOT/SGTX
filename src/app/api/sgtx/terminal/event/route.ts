// POST /api/sgtx/terminal/event — receive a terminal event (EDI / API webhook)
//
// Body:
//   {
//     ustn?: string,                    // optional — link to a shipment
//     terminalIntegrationId?: string,    // optional — source integration
//     eventType: string,                 // required (GATE_IN, GATE_OUT, etc.)
//     eventData?: object | string,       // optional — payload
//     skipProcessing?: boolean          // optional — skip downstream processing
//   }
//
// Either `ustn` OR `terminalIntegrationId` MUST be provided so the event is
// attributable to at least one entity.
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { receiveTerminalEvent } from "@/lib/sgtx/terminal";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, terminalIntegrationId, eventType, eventData, skipProcessing } = body || {};

    if (!eventType) {
      return NextResponse.json({ error: "Missing required field: eventType" }, { status: 400 });
    }
    if (!ustn && !terminalIntegrationId) {
      return NextResponse.json(
        { error: "Either ustn or terminalIntegrationId is required" },
        { status: 400 },
      );
    }

    // If terminalIntegrationId supplied, validate it exists + is active.
    if (terminalIntegrationId) {
      const integ = await (db as any).terminalIntegration.findUnique({
        where: { id: terminalIntegrationId },
        select: { id: true, isActive: true },
      });
      if (!integ) {
        return NextResponse.json(
          { error: `terminalIntegration not found: ${terminalIntegrationId}` },
          { status: 404 },
        );
      }
      if (!integ.isActive) {
        return NextResponse.json(
          { error: `terminalIntegration is not active: ${terminalIntegrationId}` },
          { status: 409 },
        );
      }
    }

    const event = await receiveTerminalEvent({
      ustn: ustn || null,
      terminalIntegrationId: terminalIntegrationId || null,
      eventType,
      eventData,
      skipProcessing: !!skipProcessing,
    });

    return NextResponse.json({
      ok: true,
      eventId: event.id,
      processed: event.processed,
    });
  } catch (e: any) {
    logger.error("[terminal/event] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
