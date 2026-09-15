// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { escalateToManualReview } from "@/lib/sgtx/payment-resilience";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/payment/[id]/escalate
// Body: { reason }
// Moves a leg into manual review — creates a Smart Inbox item assigned to
// operations and flips the resolution state to ESCALATED. The URL `id`
// segment is the payment leg ID.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "Manual escalation by operations";

    const result = await escalateToManualReview(legId, reason);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    logger.error("[api/payment/[id]/escalate] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
