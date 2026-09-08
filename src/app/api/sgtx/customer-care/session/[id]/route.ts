// @ts-nocheck
// SGTX v17 §16.7 — Customer Care Chatbot · session detail endpoint
// GET    /api/sgtx/customer-care/session/<id>          → fetch session detail
// PATCH  /api/sgtx/customer-care/session/<id>          → end the session
//   PATCH body: { action: "end", resolution: { solved, rating, feedback? }, endedBy? }

import { NextRequest, NextResponse } from "next/server";
import { getSession, endChatSession } from "@/lib/sgtx/customer-care";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    logger.error("customer-care.session.[id].get.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || body.action !== "end") {
      return NextResponse.json(
        { ok: false, error: 'PATCH supports only { action: "end", resolution: { solved, rating, feedback? } }' },
        { status: 400 },
      );
    }
    if (!body.resolution || typeof body.resolution.solved !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "resolution.solved (boolean) required" },
        { status: 400 },
      );
    }
    const result = endChatSession(
      id,
      {
        solved: body.resolution.solved,
        rating: Number(body.resolution.rating ?? 3),
        feedback: body.resolution.feedback,
      },
      body.endedBy || "system",
    );
    if (!result.endedAt) {
      return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("customer-care.session.[id].patch.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
  }
}
