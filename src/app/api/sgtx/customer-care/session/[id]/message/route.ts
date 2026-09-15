// @ts-nocheck
// SGTX v17 §16.7 — Customer Care Chatbot · send message endpoint
// POST /api/sgtx/customer-care/session/<id>/message
//   body: { message: string }
//   → 200 { ok, response, aiAssisted, humanAgent, mode, status }

import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/sgtx/customer-care";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ ok: false, error: "message required" }, { status: 400 });
    }
    const result = await sendMessage(id, message);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("customer-care.message.post.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "send failed" }, { status: 500 });
  }
}
