// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Multi-Shipment Contract Activation (Part 6.7 §XV — Stage 1)
//
// POST /api/sgtx/contract/multi-shipment/activate
//
// Body: { ustn, shipmentSequence }
//   - ustn             = master contract USTN (e.g. SGTX-1397F3A-456ABC-...)
//   - shipmentSequence = 1-based shipment index (1, 2, 3, ...)
//
// Performs the canonical Part 6.7 shipment activation sequence in a single
// backend call (blueprint steps 1-5):
//   1. Seller clicks "Ready for Shipment X"
//   2. Buyer confirms
//   3. Seller receives per-shipment Stage 1 payment request
//   4. Seller pays per-shipment fee (PSP confirmation simulated server-side)
//   5. System generates per-shipment USTN: {master}#S{seq}
//      + creates per-shipment FeeLock (PENDING → ACTIVE)
//
// Each shipment's FeeLock is independent — a delay in one shipment does not
// affect others (Part 6.7 idempotent invariant).
//
// This is the contract-level entry point — the underlying lib
// activateShipmentStage1() is the same one the /payment/multishipment/stage1
// route calls. The contract/ route exists so the workflow/UI can target the
// "contract" surface (multi-shipment master contract flow) rather than the
// "payment" surface; both delegate to the same canonical logic.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { activateShipmentStage1 } from "@/lib/sgtx/payment/multishipment";

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

    // Map the contract-level field names to the lib function's input shape.
    // `ustn` here is the master contract USTN — per-shipment USTN is derived
    // inside activateShipmentStage1 as `{master}#S{seq}`.
    const result = await activateShipmentStage1({
      masterUstn: ustn,
      shipmentSeq,
    });

    return NextResponse.json({
      ok: true,
      action: "multi-shipment.stage1.activate",
      masterUstn: ustn,
      shipmentSequence: shipmentSeq,
      ...result,
    });
  } catch (e: any) {
    logger.error("[contract/multi-shipment/activate]", e);

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
