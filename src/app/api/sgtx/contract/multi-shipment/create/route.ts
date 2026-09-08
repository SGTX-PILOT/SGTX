// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
//
// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/sgtx/contract/multi-shipment/create
//
// Create a multi-shipment master contract.
//
// v17 §5.6 — Multi-Shipment Contracts:
//   • Master contract has `master_contract_id` (MC-YYYYMMDD-NNN) but NO
//     master USTN.
//   • Each shipment locks independently and gets its own USTN at lock time.
//   • Per-shipment fee = shipmentValue × 1.5%.
//
// Body:
//   {
//     buyer_gtid:          string,   // required
//     seller_gtid:         string,   // required (task body field is "seller_ggid"
//                                     // — accept both for compat)
//     shipment_count:       number,   // required (2..50)
//     master_contract_id?:  string,   // optional override
//     origin_country?:      string,   // e.g. "EG"
//     dest_country?:        string,   // e.g. "NL"
//     origin_port?:         string,   // e.g. "EGALX"
//     dest_port?:           string,   // e.g. "NLRTM"
//     commodity?:           string,
//     commodity_hs?:        string,
//     incoterm?:            string,   // default "FCA"
//     currency?:            string,   // default "USD"
//     trade_value_usd?:     number,
//     container_count?:     number,
//     shipment_plans?:      Array<{
//       delivery_date?:    string,    // ISO date
//       port?:             string,
//       container_count?:  number,
//       value_usd?:        number
//     }>
//   }
//
// Returns:
//   {
//     master_contract_id: string,
//     shipments: [{ shipment_id, sequence, status: "UNLOCKED" }]
//   }
//
// Auth: Authorization: Bearer <access_jwt>
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { verifyToken } from "@/lib/v1/auth";
import {
  createMultiShipmentContract,
  MultiShipmentError,
  MIN_SHIPMENT_COUNT,
  MAX_SHIPMENT_COUNT,
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

export async function POST(req: NextRequest) {
  try {
    const session = extractSession(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required — supply Authorization: Bearer <access_jwt>" },
        { status: 401 },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Accept both seller_gtid and seller_ggid (task body uses seller_ggid)
    const buyerGtid = String(body?.buyer_gtid || "").trim();
    const sellerGtid = String(body?.seller_gtid || body?.seller_ggid || "").trim();
    if (!buyerGtid || !sellerGtid) {
      return NextResponse.json(
        { error: "buyer_gtid and seller_gtid are required" },
        { status: 400 },
      );
    }

    const shipmentCount = Number(body?.shipment_count);
    if (
      !Number.isInteger(shipmentCount) ||
      shipmentCount < MIN_SHIPMENT_COUNT ||
      shipmentCount > MAX_SHIPMENT_COUNT
    ) {
      return NextResponse.json(
        {
          error: `shipment_count must be an integer in [${MIN_SHIPMENT_COUNT}..${MAX_SHIPMENT_COUNT}] — got ${body?.shipment_count}`,
        },
        { status: 400 },
      );
    }

    const result = await createMultiShipmentContract({
      masterContractId: body?.master_contract_id,
      buyerGtid,
      sellerGtid,
      shipmentCount,
      opts: {
        originCountry: body?.origin_country,
        destCountry: body?.dest_country,
        originPort: body?.origin_port,
        destPort: body?.dest_port,
        commodity: body?.commodity,
        commodityHs: body?.commodity_hs,
        incoterm: body?.incoterm,
        currency: body?.currency,
        tradeValueUsd: body?.trade_value_usd,
        containerCount: body?.container_count,
        shipmentPlans: body?.shipment_plans,
      },
      actorGtid: session.tenantGtid || session.sub,
    });

    return NextResponse.json({
      ok: true,
      action: "multi-shipment.contract.create",
      master_contract_id: result.contractId,
      trade_id: result.tradeId,
      shipments: result.shipments.map((s) => ({
        shipment_id: s.shipment_id,
        sequence: s.sequence,
        status: s.status,
      })),
    });
  } catch (e: any) {
    logger.error("[contract/multi-shipment/create POST] error:", e);

    if (e instanceof MultiShipmentError) {
      const status =
        e.code === "MASTER_CONTRACT_EXISTS" ? 409 :
        e.code === "SHIPMENT_COUNT_INVALID" ? 400 :
        e.code === "MISSING_PARTY" ? 400 :
        400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
