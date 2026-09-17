// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { recordSlaEnd, SLA_TARGETS, SlaType } from "@/lib/sgtx/payment-sla";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/payment/sla/end
// Body: { ustn, legId, slaType }
// Records the end of an SLA timer for a payment leg. Computes the duration,
// determines breach status, accrues credits on breach, and (on breach)
// notifies operations via Smart Inbox.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ustn, legId, slaType } = body;

    if (!ustn || typeof ustn !== "string") {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!legId || typeof legId !== "string") {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    if (!slaType || !(slaType in SLA_TARGETS)) {
      return NextResponse.json(
        { error: `slaType must be one of: ${Object.keys(SLA_TARGETS).join(", ")}` },
        { status: 400 },
      );
    }

    const result = await recordSlaEnd(ustn, legId, slaType as SlaType);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/payment/sla/end] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
