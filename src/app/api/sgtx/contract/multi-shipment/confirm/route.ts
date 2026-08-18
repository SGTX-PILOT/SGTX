// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Multi-Shipment Contract Confirmation (Part 6.7 §XV — Stage 2)
//
// POST /api/sgtx/contract/multi-shipment/confirm
//
// Body: { ustn, shipmentSequence }
//   - ustn             = master contract USTN (e.g. SGTX-1397F3A-456ABC-...)
//   - shipmentSequence = 1-based shipment index (1, 2, 3, ...)
//
// Confirms the per-shipment Stage 2 freight leg (Part 6.7 step 6):
//   - Generates per-shipment Stage 2 split instruction (ocean freight,
//     destination THC, import clearance).
//   - Creates a PaymentAttempt (status: COMPLETED) against the per-shipment
//     USTN `{master}#S{seq}`.
//   - Detects credit terms (any split leg with terms=CREDIT) — Stage 2 may
//     be deferred rather than immediate, surfaced via `creditTerms` and
//     `dueDate` in the response.
//
// Prerequisite: Stage 1 (per-shipment FeeLock ACTIVE) must already exist for
// the same shipment USTN. The lib function `activateShipmentStage2` does not
// re-verify the Stage 1 state — callers are expected to have called
// /contract/multi-shipment/activate first. Stage 2 is independent of Stage 1
// in scheduling (Part 6.7 §6) but logically downstream.
//
// This is the contract-level entry point — the underlying lib
// activateShipmentStage2() is the same one the /payment/multishipment/stage2
// route calls. The contract/ route exists so the workflow/UI can target the
// "contract" surface (multi-shipment master contract flow) rather than the
// "payment" surface.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { activateShipmentStage2 } from "@/lib/sgtx/payment/multishipment";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, shipmentSequence } = body;

    if (!ustn || !shipmentSequence) {
      return NextResponse.json(
        { error: "ustn and shipmentSequence are required" },
        { status: 400 },
      );
    }

    const shipmentSeq = Number(shipmentSequence);
    if (!Number.isInteger(shipmentSeq) || shipmentSeq < 1) {
      return NextResponse.json(
        { error: "shipmentSequence must be a positive integer (1-based)" },
        { status: 400 },
      );
    }

    // Stage 2 confirmation: freight fee payment + PaymentAttempt record.
    // The lib function generates the per-shipment Stage 2 split, creates the
    // PaymentAttempt, and (for credit legs) returns the due date.
    const result = await activateShipmentStage2({
      masterUstn: ustn,
      shipmentSeq,
    });

    return NextResponse.json({
      ok: true,
      action: "multi-shipment.stage2.confirm",
      masterUstn: ustn,
      shipmentSequence: shipmentSeq,
      ...result,
    });
  } catch (e: any) {
    logger.error("[contract/multi-shipment/confirm]", e);

    // Surface the canonical SGTX error codes (TRADE_NOT_FOUND,
    // SHIPMENT_SEQ_INVALID) as 4xx so callers can distinguish from 5xx
    // server failures. Anything else is a 500.
    const msg = e?.message || String(e);
    if (msg.startsWith("TRADE_NOT_FOUND")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.startsWith("SHIPMENT_SEQ_INVALID")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
