// @ts-nocheck
// SGTX v17 §16.8.12 — CBR Document Receipt App · acknowledge endpoint
// POST /api/sgtx/mobile/broker/acknowledge
//   body: { docId: string, brokerGtid: string }
//   → 200 { ok, acknowledged: boolean, reason?: string }
//
// Marks a Document row as VERIFIED (broker has received it) + creates an
// Activity log entry as an audit trail.

import { NextRequest, NextResponse } from "next/server";
import { acknowledgeDocument } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const docId = String(body.docId ?? "");
    const brokerGtid = String(body.brokerGtid ?? "");
    if (!docId || !brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "docId + brokerGtid required" },
        { status: 400 },
      );
    }
    const result = await acknowledgeDocument(docId, brokerGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.broker.acknowledge.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "acknowledge failed" }, { status: 500 });
  }
}
