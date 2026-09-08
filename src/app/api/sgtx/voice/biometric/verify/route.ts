// @ts-nocheck
// SGTX v17 §16.6 — Voice Command API · biometric verify endpoint
// POST /api/sgtx/voice/biometric/verify
//   body: {
//     userGtid: string,
//     voicePrintHash?: string,
//     fingerprintHash?: string,
//     deviceAttestation?: string
//   }
//   → 200 {
//       ok,
//       biometric: { verified, confidence, factors[], expiresAt, simulated }
//     }
//
// Simulated ZITADEL biometric verification. Real ZITADEL would call the
// session/biometric-check API with the enrolled template. Confidence ≥ 0.85
// and at least one factor → verified.

import { NextRequest, NextResponse } from "next/server";
import { verifyBiometric } from "@/lib/sgtx/voice";
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
    const userGtid = String(body.userGtid ?? "");
    if (!userGtid) {
      return NextResponse.json(
        { ok: false, error: "userGtid required" },
        { status: 400 },
      );
    }
    const biometricData = {
      voicePrintHash: body.voicePrintHash,
      fingerprintHash: body.fingerprintHash,
      deviceAttestation: body.deviceAttestation,
    };
    const result = await verifyBiometric(userGtid, biometricData);
    return NextResponse.json({ ok: true, biometric: result });
  } catch (err) {
    logger.error("voice.biometric.route.failed", { err: String(err) });
    return NextResponse.json(
      { ok: false, error: "biometric verification failed" },
      { status: 500 },
    );
  }
}
