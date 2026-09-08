// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requestVoipCallback } from "@/lib/sgtx/help-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/help-center/callback — request a VoIP callback from a human agent.
// Body: { tenantGtid, phone, preferredTime?, topic? }
//   → { ok, ticketId, reference }
//   (Agent response SLA: 4 hours.)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.tenantGtid || !body.phone) {
    return NextResponse.json({ error: "tenantGtid and phone required" }, { status: 400 });
  }
  try {
    const result = await requestVoipCallback({
      tenantGtid: body.tenantGtid,
      phone: body.phone,
      preferredTime: body.preferredTime,
      topic: body.topic,
    });
    return NextResponse.json({ ok: true, ...result, sla: "4 hours" });
  } catch (e: any) {
    logger.error("[api/help-center/callback] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "callback failed" }, { status: 400 });
  }
}
