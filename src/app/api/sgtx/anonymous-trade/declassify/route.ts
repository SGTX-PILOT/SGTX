// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requestDeclassification } from "@/lib/sgtx/anonymous-trade";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/anonymous-trade/declassify — request declassification (3-of-5 multisig).
// Body: { anonymousUstn, reason, requesterGtid }
//   → { ok, declassificationRequestId, requiredApprovals, authorizedApproverGtids }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.anonymousUstn || !body.reason || !body.requesterGtid) {
    return NextResponse.json(
      { error: "anonymousUstn, reason, requesterGtid required" },
      { status: 400 },
    );
  }
  try {
    const result = await requestDeclassification(
      body.anonymousUstn,
      body.reason,
      body.requesterGtid,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/anonymous-trade/declassify] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "request failed" }, { status: 400 });
  }
}
