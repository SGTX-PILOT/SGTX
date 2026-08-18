// POST /api/sgtx/broker-liability/verify
//
// Mark a broker liability insurance policy as verified (sets verified=true
// and verifiedAt=now).
//
// Body:
//   { policyId }
//
// Response:
//   { ok, policyId, verified }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyPolicy } from "@/lib/sgtx/broker-liability";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { policyId } = body || {};
    if (!policyId) {
      return NextResponse.json({ error: "Missing required field: policyId" }, { status: 400 });
    }

    const result = await verifyPolicy(policyId);
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Policy not found or verification failed (see server logs)" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, policyId: result.id, verified: result.verified });
  } catch (e: any) {
    logger.error("[broker-liability/verify] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
