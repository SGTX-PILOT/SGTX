// @ts-nocheck
// SGTX v17 §16.8.12 — CBR Document Receipt App · document queue endpoint
// GET /api/sgtx/mobile/broker/documents?brokerGtid=<gtid>
//   → 200 { ok, documents: BrokerDocumentQueueItem[] }

import { NextRequest, NextResponse } from "next/server";
import { getDocumentQueue } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brokerGtid = searchParams.get("brokerGtid");
    if (!brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "brokerGtid required" },
        { status: 400 },
      );
    }
    const result = await getDocumentQueue(brokerGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.broker.documents.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 500 });
  }
}
