// POST /api/sgtx/demurrage/dispute — Create a demurrage dispute
//
// Body:
//   {
//     ustn,                          // required
//     demurrageTrackingId?,          // optional — link to a specific tracking row
//     amountDisputed: number,        // required — USD amount being disputed
//     reason: string,                // required — short reason code (FREE_TIME_MISSED, RATE_MISMATCH, etc.)
//     evidence?: string,             // optional — JSON string of evidence doc URLs/metadata
//     governorDecisionId?
//   }
//
// Response:
//   { ok, disputeId, status }
//
// Status defaults to PENDING. Disputes are resolved via the Governor's
// adjudication pipeline (out of scope for this module — see Governor G2U21).
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

const VALID_REASONS = new Set([
  "FREE_TIME_MISSED",
  "RATE_MISMATCH",
  "WRONG_CONTAINER_TYPE",
  "CARRIER_ERROR",
  "PORT_CONGESTION",
  "FORCE_MAJURE",
  "DOCUMENTATION_ERROR",
  "DOUBLE_CHARGE",
  "OTHER",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      demurrageTrackingId,
      amountDisputed,
      reason,
      evidence,
      governorDecisionId,
    } = body || {};

    // Validate required fields
    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (amountDisputed == null) missing.push("amountDisputed");
    if (!reason) missing.push("reason");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const amount = Number(amountDisputed);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "amountDisputed must be a positive number" }, { status: 400 });
    }

    if (!VALID_REASONS.has(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Valid: ${Array.from(VALID_REASONS).join(", ")}` },
        { status: 400 },
      );
    }

    // Optional: link to tracking row — validate it exists for this USTN.
    if (demurrageTrackingId) {
      const tracking = await (db as any).demurrageTracking.findUnique({
        where: { id: demurrageTrackingId },
        select: { id: true, ustn: true },
      });
      if (!tracking) {
        return NextResponse.json({ error: "demurrageTrackingId not found" }, { status: 404 });
      }
      if (tracking.ustn !== ustn) {
        return NextResponse.json(
          { error: "demurrageTrackingId does not belong to the given ustn" },
          { status: 400 },
        );
      }
    }

    const dispute = await (db as any).demurrageDispute.create({
      data: {
        ustn,
        demurrageTrackingId: demurrageTrackingId || null,
        amountDisputed: +amount.toFixed(2),
        reason,
        evidence: evidence || null,
        status: "PENDING",
        governorDecisionId: governorDecisionId || null,
      },
    });

    logger.info("[demurrage/dispute] created", {
      disputeId: dispute.id, ustn, amountDisputed: amount, reason,
    });

    return NextResponse.json({
      ok: true,
      disputeId: dispute.id,
      status: "PENDING",
    });
  } catch (e: any) {
    logger.error("[demurrage/dispute] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
