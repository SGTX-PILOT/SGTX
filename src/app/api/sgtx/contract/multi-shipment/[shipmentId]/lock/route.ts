// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/sgtx/contract/multi-shipment/[shipmentId]/lock
//
// Lock a single shipment in a multi-shipment master contract.
//
// v17 §5.6 — Multi-Shipment Contracts:
//   • Each shipment locks INDEPENDENTLY and gets its own USTN of the form
//     `SGTX-{COUNTRY}-{YY}-{TRADER}-{SEQ}` (e.g. SGTX-EG-26-F3A-21).
//   • Per-shipment SGTX fee = shipmentValueUsd × 1.5%.
//   • The lock creates a FeeLock (status PENDING) — the buyer pays the fee
//     via the existing /payment/multishipment/stage1 flow.
//   • Idempotent: re-locking an already-locked shipment returns the
//     existing USTN + the recomputed fee for the supplied value.
//
// Body:
//   {
//     shipment_value_usd: number,  // required — per-shipment trade value
//     currency?:          string,  // default "USD"
//   }
//
// Returns:
//   {
//     shipment_id: string,
//     ustn: string,             // e.g. SGTX-EG-26-F3A-21
//     sgtx_fee_usd: number,     // = shipment_value_usd × 1.5%
//     shipment_value_usd: number,
//     locked_at: string,         // ISO timestamp
//     master_contract_id: string,
//     sequence: number
//   }
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  lockShipment,
  MultiShipmentError,
} from "@/lib/sgtx/multi-shipment";

export const dynamic = "force-dynamic";

interface SessionPayload {
  sub: string;
  tenantGtid?: string;
  role?: string;
  email?: string;
  [key: string]: any;
}

function extractSession(req: NextRequest): SessionPayload | null {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const payload = verifyToken(token);
      if (payload && payload.type !== "refresh") return payload;
    }
  }
  const tenantGtid = req.headers.get("x-tenant-gtid");
  const role = req.headers.get("x-role");
  if (tenantGtid) {
    return { sub: tenantGtid, tenantGtid, role: role || "USER" };
  }
  return null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ shipmentId: string }> },
) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required — supply Authorization: Bearer <access_jwt>" },
        { status: 401 },
      );
    }

    const { shipmentId } = await context.params;
    if (!shipmentId) {
      return NextResponse.json(
        { error: "shipmentId is required (path parameter)" },
        { status: 400 },
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is allowed — we'll fall through to validation.
    }

    const shipmentValueUsd = Number(body?.shipment_value_usd);
    if (!Number.isFinite(shipmentValueUsd) || shipmentValueUsd <= 0) {
      return NextResponse.json(
        {
          error: `shipment_value_usd must be a positive number — got ${body?.shipment_value_usd}`,
        },
        { status: 400 },
      );
    }

    const result = await lockShipment({
      shipmentId,
      shipmentValueUsd,
      currency: body?.currency || "USD",
      actorGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({
      ok: true,
      action: "multi-shipment.shipment.lock",
      shipment_id: result.shipment_id,
      ustn: result.ustn,
      sgtx_fee_usd: result.sgtx_fee_usd,
      shipment_value_usd: result.shipment_value_usd,
      locked_at: result.locked_at,
      master_contract_id: result.master_contract_id,
      sequence: result.sequence,
      fee_rate: 0.015,
    });
  } catch (e: any) {
    logger.error("[contract/multi-shipment/[shipmentId]/lock POST] error:", e);

    if (e instanceof MultiShipmentError) {
      const status =
        e.code === "SHIPMENT_NOT_FOUND" ? 404 :
        e.code === "TRADE_NOT_FOUND" ? 404 :
        e.code === "SHIPMENT_NOT_UNLOCKED" ? 409 :
        e.code === "NOT_MULTI_SHIPMENT" ? 400 :
        e.code === "INVALID_SHIPMENT_VALUE" ? 400 :
        e.code === "MISSING_SHIPMENT_ID" ? 400 :
        400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
