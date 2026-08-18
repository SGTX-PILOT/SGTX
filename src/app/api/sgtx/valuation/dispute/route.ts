// POST /api/sgtx/valuation/dispute
//
// Create a valuation dispute (status=PENDING) — used when an importer or
// broker contests a customs reassessment of declared value.
//
// Body:
//   {
//     ustn, declaredValue, customsReassessedValue?, disputeReason,
//     evidence?, governorDecisionId?
//   }
//
// Response:
//   { ok, disputeId }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createValuationDispute } from "@/lib/sgtx/valuation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, declaredValue, customsReassessedValue, disputeReason, evidence, governorDecisionId } = body || {};

    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (typeof declaredValue !== "number" || declaredValue <= 0) missing.push("declaredValue (must be positive number)");
    if (!disputeReason) missing.push("disputeReason");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing or invalid fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await createValuationDispute({
      ustn,
      declaredValue,
      customsReassessedValue,
      disputeReason,
      evidence,
      governorDecisionId,
    });

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Persistence failed (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, disputeId: result.id });
  } catch (e: any) {
    logger.error("[valuation/dispute] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
