// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validateQESForJurisdiction } from "@/lib/sgtx/digital-signature-legality";

export const dynamic = "force-dynamic";

// POST /api/sgtx/signature-legality/validate — Validate a QES for a jurisdiction (v17 §20.111)
//
// Body:
//   {
//     "country": "EG",
//     "signature": {
//       "type": "SIMPLE"|"ADVANCED"|"QUALIFIED",
//       "provider"?: "Adobe Sign",
//       "certificateId"?: "...",
//       "certificateFp"?: "...",
//       "algorithm"?: "ed25519"|"SM2"|"..."
//     }
//   }
//
// Returns:
//   {
//     "valid": true,
//     "meetsLegalStandard": true,
//     "jurisdictionSpecific": [...],
//     "signatureType": "QUALIFIED",
//     "country": "EG",
//     "warnings": [...]
//   }
//
// Public read endpoint. Rate-limited 50 req/min/IP via the middleware
// anonymous bucket.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { country, signature } = body;
    if (!country) {
      return NextResponse.json({ error: "country required" }, { status: 400 });
    }
    if (!signature || !signature.type) {
      return NextResponse.json(
        { error: "signature.type required (one of SIMPLE, ADVANCED, QUALIFIED)" },
        { status: 400 },
      );
    }
    const upper = String(signature.type).toUpperCase();
    if (!["SIMPLE", "ADVANCED", "QUALIFIED"].includes(upper)) {
      return NextResponse.json(
        { error: "signature.type must be one of: SIMPLE, ADVANCED, QUALIFIED" },
        { status: 400 },
      );
    }
    const result = validateQESForJurisdiction(
      { ...signature, type: upper as any },
      country,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e: any) {
    logger.error("[api/sgtx/signature-legality/validate] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Signature validation failed" },
      { status: 500 },
    );
  }
}
