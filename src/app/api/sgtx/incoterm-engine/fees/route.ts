// @ts-nocheck
/**
 * SGTX v17 Phase 2 — Incoterm Fee Calculator API
 * GET /api/sgtx/incoterm-engine/fees
 *   ?incoterm=X&trade_value=Y&logistics_costs=JSON&buyer_on_platform=1&seller_on_platform=1
 *
 * Returns the per-incoterm fee allocation:
 *   {
 *     incoterm, exw_value_usd, mandatory_logistics_usd, total_trade_value_usd,
 *     sgtx_fee_usd, sgtx_fee_rate, buyer_pays_usd, seller_pays_usd,
 *     buyer_pays: [...], seller_pays: [...], breakdown: [...]
 *   }
 *
 * Public so the buyer wizard + seller workflow can call without a session
 * cookie (the demo login has no session cookie). Rate-limited by the
 * anonymous API bucket (50 req/min) above.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateIncotermFees,
  getTotalTradeValue,
  getMandatoryLogisticsCosts,
  SGTX_FEE_RATE,
  type LogisticsCost,
} from "@/lib/sgtx/incoterm-engine/fee-calculator";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const incoterm = (searchParams.get("incoterm") || "").trim().toUpperCase();
    const tradeValueParam = searchParams.get("trade_value") || searchParams.get("trade_value_usd");
    const logisticsCostsParam = searchParams.get("logistics_costs");
    const buyerOnParam = searchParams.get("buyer_on_platform");
    const sellerOnParam = searchParams.get("seller_on_platform");
    const rateParam = searchParams.get("sgtx_fee_rate");

    if (!incoterm) {
      return NextResponse.json(
        {
          ok: false,
          error: "incoterm is required (one of EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF).",
        },
        { status: 400 },
      );
    }
    const tradeValue = Number(tradeValueParam);
    if (!Number.isFinite(tradeValue) || tradeValue < 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "trade_value (USD) is required and must be a non-negative number.",
        },
        { status: 400 },
      );
    }

    let logisticsCosts: LogisticsCost[] = [];
    if (logisticsCostsParam) {
      try {
        logisticsCosts = JSON.parse(logisticsCostsParam);
        if (!Array.isArray(logisticsCosts)) {
          return NextResponse.json(
            { ok: false, error: "logistics_costs must be a JSON array of cost lines." },
            { status: 400 },
          );
        }
      } catch (e: any) {
        return NextResponse.json(
          {
            ok: false,
            error: "logistics_costs must be valid JSON. Example: [{\"serviceType\":\"TRUCKING\",\"amountUsd\":450},{\"serviceType\":\"OCEAN_FREIGHT\",\"amountUsd\":2800}]",
          },
          { status: 400 },
        );
      }
    }

    const buyerOn = buyerOnParam !== null ? buyerOnParam !== "0" && buyerOnParam !== "false" : true;
    const sellerOn = sellerOnParam !== null ? sellerOnParam !== "0" && sellerOnParam !== "false" : true;
    const rate = rateParam ? Number(rateParam) : SGTX_FEE_RATE;

    const result = calculateIncotermFees(incoterm, tradeValue, logisticsCosts, {
      buyerOnPlatform: buyerOn,
      sellerOnPlatform: sellerOn,
      sgtxFeeRate: Number.isFinite(rate) && rate > 0 ? rate : SGTX_FEE_RATE,
    });

    return NextResponse.json({
      ok: true,
      incoterm: result.incoterm,
      exw_value_usd: result.exwValueUsd,
      mandatory_logistics_usd: result.mandatoryLogisticsUsd,
      total_trade_value_usd: result.totalTradeValueUsd,
      sgtx_fee_usd: result.sgtxFeeUsd,
      sgtx_fee_rate: result.sgtxFeeRate,
      buyer_pays_usd: result.buyerPaysUsd,
      seller_pays_usd: result.sellerPaysUsd,
      buyer_pays: result.buyerPays,
      seller_pays: result.sellerPays,
      breakdown: result.breakdown,
      warnings: result.warnings,
      non_marketplace: true,
    });
  } catch (err: any) {
    logger.error("[api/incoterm-engine/fees] GET failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const incoterm = (body.incoterm || "").trim().toUpperCase();
    const tradeValue = Number(body.trade_value ?? body.trade_value_usd);
    const logisticsCosts: LogisticsCost[] = Array.isArray(body.logistics_costs) ? body.logistics_costs : [];
    const buyerOn = body.buyer_on_platform !== false;
    const sellerOn = body.seller_on_platform !== false;
    const rate = body.sgtx_fee_rate ? Number(body.sgtx_fee_rate) : SGTX_FEE_RATE;

    if (!incoterm) {
      return NextResponse.json(
        { ok: false, error: "incoterm is required." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(tradeValue) || tradeValue < 0) {
      return NextResponse.json(
        { ok: false, error: "trade_value (USD) is required and must be a non-negative number." },
        { status: 400 },
      );
    }

    const result = calculateIncotermFees(incoterm, tradeValue, logisticsCosts, {
      buyerOnPlatform: buyerOn,
      sellerOnPlatform: sellerOn,
      sgtxFeeRate: Number.isFinite(rate) && rate > 0 ? rate : SGTX_FEE_RATE,
    });

    return NextResponse.json({
      ok: true,
      incoterm: result.incoterm,
      exw_value_usd: result.exwValueUsd,
      mandatory_logistics_usd: result.mandatoryLogisticsUsd,
      total_trade_value_usd: result.totalTradeValueUsd,
      sgtx_fee_usd: result.sgtxFeeUsd,
      sgtx_fee_rate: result.sgtxFeeRate,
      buyer_pays_usd: result.buyerPaysUsd,
      seller_pays_usd: result.sellerPaysUsd,
      buyer_pays: result.buyerPays,
      seller_pays: result.sellerPays,
      breakdown: result.breakdown,
      warnings: result.warnings,
      non_marketplace: true,
    });
  } catch (err: any) {
    logger.error("[api/incoterm-engine/fees] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
