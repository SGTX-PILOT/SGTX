// @ts-nocheck
// SGTX v17 §14.2 — Generate MicroUSTN + create MicroContract
//
// POST /api/sgtx/distressed/micro-ustn/generate
//   Body: { parent_ustn, distressed_sale_amount, country_factor?, sellerGtid?,
//           buyerGtid?, commodity?, quantityKg?, tradeId?, listingId? }
//   Returns: { micro_ustn, micro_contract_id, fee_usd, fee_rate, country_factor,
//              parent_ustn }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createMicroContract, generateMicroUstn } from "@/lib/sgtx/distressed/micro-ustn";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { parent_ustn, distressed_sale_amount, country_factor } = body ?? {};

    if (!parent_ustn) {
      return NextResponse.json(
        { error: "parent_ustn is required" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(Number(distressed_sale_amount)) || Number(distressed_sale_amount) <= 0) {
      return NextResponse.json(
        { error: "distressed_sale_amount must be a positive number" },
        { status: 400 },
      );
    }

    const result = await createMicroContract({
      parentUstn: parent_ustn,
      distressedSaleAmount: Number(distressed_sale_amount),
      countryFactor: country_factor !== undefined ? Number(country_factor) : undefined,
      sellerGtid: body.sellerGtid || body.seller_gtid,
      buyerGtid: body.buyerGtid || body.buyer_gtid,
      commodity: body.commodity,
      quantityKg: body.quantityKg || body.quantity_kg,
      tradeId: body.tradeId || body.trade_id,
      listingId: body.listingId || body.listing_id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      micro_ustn: result.microUstn,
      micro_contract_id: result.microContractId,
      fee_usd: result.feeUsd,
      fee_rate: result.feeRate,
      country_factor: result.countryFactor,
      parent_ustn: result.parentUstn,
    });
  } catch (e: any) {
    logger.error("[distressed/micro-ustn/generate]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
