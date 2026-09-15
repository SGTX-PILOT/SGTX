// @ts-nocheck
// SGTX v17 §16.6 — Voice Command API · interpret endpoint
// POST /api/sgtx/voice/interpret
//   body: { text: string, userGtid, role?, currentScreen?, sessionUstn? }
//   → 200 { ok, intent: { intent, entities, action, confidence, raw } }
//
// Uses the LLM (z-ai-web-dev-sdk) for NLU with a deterministic rule-based
// fallback. See src/lib/sgtx/voice/index.ts.

import { NextRequest, NextResponse } from "next/server";
import { interpretCommand } from "@/lib/sgtx/voice";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON body" },
        { status: 400 },
      );
    }
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "text required" },
        { status: 400 },
      );
    }
    const context = {
      userGtid: String(body.userGtid ?? "anon"),
      role: body.role,
      currentScreen: body.currentScreen,
      sessionUstn: body.sessionUstn,
    };
    const result = await interpretCommand(text, context);
    return NextResponse.json({ ok: true, intent: result });
  } catch (err) {
    logger.error("voice.interpret.route.failed", { err: String(err) });
    return NextResponse.json(
      { ok: false, error: "interpretation failed" },
      { status: 500 },
    );
  }
}
