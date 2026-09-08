// @ts-nocheck
// SGTX v17 §16.6 — Voice Command API · transcribe endpoint
// POST /api/sgtx/voice/transcribe
//   body: { audioBase64: string, language?: "en"|"ar"|... , userGtid, role?, currentScreen? }
//   → 200 { ok, transcript: { text, confidence, language, durationMs, words, simulated } }
//
// Real Vosk would stream partial results; here we simulate the final
// transcript deterministically (see src/lib/sgtx/voice/index.ts).

import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/sgtx/voice";
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
    const audioBase64 = body.audioBase64;
    if (!audioBase64) {
      return NextResponse.json(
        { ok: false, error: "audioBase64 required" },
        { status: 400 },
      );
    }
    const language = body.language || "en";
    const result = await transcribeAudio(audioBase64, language);
    return NextResponse.json({ ok: true, transcript: result });
  } catch (err) {
    logger.error("voice.transcribe.route.failed", { err: String(err) });
    return NextResponse.json(
      { ok: false, error: "transcription failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/sgtx/voice/transcribe",
    body: { audioBase64: "string (base64 or raw bytes)", language: "en|ar|fr|es|zh|de (default en)" },
    returns: {
      transcript: "{ text, confidence, language, durationMs, words, simulated }",
    },
    simulated: true,
  });
}
