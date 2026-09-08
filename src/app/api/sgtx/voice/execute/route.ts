// @ts-nocheck
// SGTX v17 §16.6 — Voice Command API · execute endpoint
// POST /api/sgtx/voice/execute
//   body: {
//     intent: "navigate"|"confirm_milestone"|"search"|"approve"|"help"|"read_aloud"|"unknown",
//     entities?: { ustn?, screen?, milestone?, target? },
//     userGtid: string,
//     biometric?: { verified, confidence, expiresAt, factors[] }  // required for sensitive intents
//   }
//   → 200 { ok, execution: { result, feedback, feedbackLocalized?, actionTaken?, data? } }
//
// Sensitive intents (approve, confirm_milestone) require biometric.verified=true.

import { NextRequest, NextResponse } from "next/server";
import {
  executeVoiceCommand,
  recordVoiceCommand,
  type VoiceIntent,
  type BiometricVerificationResult,
  type VoiceCommandContext,
} from "@/lib/sgtx/voice";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_INTENTS = new Set<VoiceIntent>([
  "navigate",
  "confirm_milestone",
  "search",
  "approve",
  "help",
  "read_aloud",
  "unknown",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON body" },
        { status: 400 },
      );
    }
    const intent = String(body.intent ?? "unknown") as VoiceIntent;
    if (!VALID_INTENTS.has(intent)) {
      return NextResponse.json(
        { ok: false, error: `invalid intent: ${intent}` },
        { status: 400 },
      );
    }
    const entities = body.entities ?? {};
    const userGtid = String(body.userGtid ?? "anon");

    // Optional biometric context (already-verified by the caller via
    // /api/sgtx/voice/biometric/verify).
    let biometric: BiometricVerificationResult | undefined;
    if (body.biometric && typeof body.biometric === "object") {
      biometric = body.biometric as BiometricVerificationResult;
    }

    const result = await executeVoiceCommand(intent, entities, userGtid, biometric);

    // Audit-trail
    const ctx: VoiceCommandContext = {
      userGtid,
      role: body.role,
      currentScreen: body.currentScreen,
      sessionUstn: body.sessionUstn,
    };
    recordVoiceCommand(userGtid, ctx, body.transcript ?? "", intent, body.confidence ?? 0, result);

    return NextResponse.json({ ok: true, execution: result });
  } catch (err) {
    logger.error("voice.execute.route.failed", { err: String(err) });
    return NextResponse.json(
      { ok: false, error: "execution failed" },
      { status: 500 },
    );
  }
}
