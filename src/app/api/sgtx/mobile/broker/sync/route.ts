// @ts-nocheck
// SGTX v17 §16.8.12 — CBR Document Receipt App · declaration submit + sync endpoint
// POST /api/sgtx/mobile/broker/sync
//   body (action=submit_declaration): {
//     action: "submit_declaration",
//     declarationId?: string,
//     data: { tradeId, brokerGtid, regime?, etaXml? }
//   }
//   → 200 { ok, submitted: boolean, trackingId: string, declarationNo?: string }
//
// POST /api/sgtx/mobile/broker/sync (action=sync)
//   body: { action: "sync", brokerGtid: string, queuedActions: QueuedAction[] }
//   → 200 { ok, synced, conflicts, stale, remaining, serverTimestamp }
//
// Two actions on one endpoint — saves a route in the API surface. The
// `action` field discriminates which handler runs.

import { NextRequest, NextResponse } from "next/server";
import { submitDeclaration, syncOfflineDeclarations } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const action = String(body.action ?? "sync");
    if (action === "submit_declaration") {
      const data = body.data ?? {};
      if (!data.tradeId || !data.brokerGtid) {
        return NextResponse.json(
          { ok: false, error: "data.tradeId + data.brokerGtid required" },
          { status: 400 },
        );
      }
      const result = await submitDeclaration(
        String(body.declarationId ?? ""),
        {
          tradeId: String(data.tradeId),
          brokerGtid: String(data.brokerGtid),
          regime: data.regime ? String(data.regime) : "IMPORT",
          etaXml: data.etaXml ? String(data.etaXml) : undefined,
        },
      );
      return NextResponse.json({ ok: true, ...result });
    }

    // Default action = sync
    const brokerGtid = String(body.brokerGtid ?? "");
    if (!brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "brokerGtid required" },
        { status: 400 },
      );
    }
    const queuedActions = Array.isArray(body.queuedActions) ? body.queuedActions : [];
    const result = await syncOfflineDeclarations(brokerGtid, queuedActions);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.broker.sync.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}
