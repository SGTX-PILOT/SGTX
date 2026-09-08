// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §24 Phase 4 — Verify a USTN across all sovereign nodes
// ═══════════════════════════════════════════════════════════════════════════════
//
// POST /api/sgtx/mutual-ustn/verify
//   body: { ustn: "USTN-EG-2024-00001" }
//
// Verifies a USTN across every sovereign node on the network. The USTN format
// encodes the issuing country: USTN-{COUNTRY}-{YEAR}-{SERIAL}. The function
// looks up the issuing node for the country, then for every other node checks
// whether an ACTIVE recognition agreement exists between them.
//
// Returns:
//   {
//     ustn, recognizedBy: [], rejectedBy: [],
//     consensus: UNANIMOUS_RECOGNITION | UNANIMOUS_REJECTION | SPLIT,
//     issuingNode, totalNodes, recognitionRate
//   }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyUstnAcrossNodes } from "@/lib/sgtx/mutual-ustn";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustn: string = body?.ustn || "";

    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "body.ustn must be a non-empty string",
          example: { ustn: "USTN-EG-2024-00001" },
        },
        { status: 400 },
      );
    }

    const result = verifyUstnAcrossNodes(ustn);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/mutual-ustn/verify] POST failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
