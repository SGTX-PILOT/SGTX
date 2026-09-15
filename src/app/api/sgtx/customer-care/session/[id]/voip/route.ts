// @ts-nocheck
// SGTX v17 §16.7 — Customer Care Chatbot · VoIP escalation endpoint
// POST /api/sgtx/customer-care/session/<id>/voip
//   body: { userGtid: string }
//   → 200 {
//       ok,
//       callId,
//       dialInNumber,        // simulated Janus gateway dial-in
//       participantCode,     // 6-char hex
//       startedAt: string,
//       simulated: true
//     }
//
// Real Janus gateway would allocate a room ID + return SFU URLs; here we
// simulate the dial-in number with a deterministic format. The chat
// session remains open while the call is in progress (chat.status →
// "VOIP_ACTIVE").

import { NextRequest, NextResponse } from "next/server";
import { requestVoIPCall } from "@/lib/sgtx/customer-care";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const userGtid = String(body?.userGtid ?? "");
    const result = requestVoIPCall(id, userGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("customer-care.voip.post.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "voip escalation failed" }, { status: 500 });
  }
}
