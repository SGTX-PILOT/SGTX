// @ts-nocheck
/**
 * SGTX v17 §20 — Customs Valuation Engine API
 * GET /api/sgtx/engines/customs-valuation
 *   No params → list valuation methods
 *   ?action=calculate&transactionValue=X&transportCosts=Y&insurance=Z&currency=USD → calculate customs value
 *   ?action=getMethod&relatedParty=true&isNewProduct=false → recommend valuation method
 *   ?action=validate&declaredValue=X&customsValue=Y → validate declared vs calculated
 *
 * POST /api/sgtx/engines/customs-valuation
 *   Body: { action, transactionValue, adjustments: [{description, amount, direction}], transportCosts, insurance, currency, forceMethod }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateCustomsValue, getValuationMethod, validateValuation, listValuationMethods,
  type ValuationAdjustment, type ValuationMethod,
} from "@/lib/sgtx/engines/customs-valuation-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, methods: listValuationMethods(), note: "Use ?action=calculate|getMethod|validate" });
    }
    if (action === "calculate") {
      const txValue = Number(searchParams.get("transactionValue") || 0);
      const transport = Number(searchParams.get("transportCosts") || 0);
      const insurance = Number(searchParams.get("insurance") || 0);
      const currency = searchParams.get("currency") || "USD";
      const forceMethod = (searchParams.get("forceMethod") || undefined) as ValuationMethod | undefined;
      return NextResponse.json({
        ok: true,
        result: calculateCustomsValue(txValue, [], transport, insurance, { currency, forceMethod }),
      });
    }
    if (action === "getMethod") {
      return NextResponse.json({
        ok: true,
        result: getValuationMethod({
          relatedPartySale: searchParams.get("relatedParty") === "true",
          isNewProduct: searchParams.get("isNewProduct") === "true",
          consignmentSale: searchParams.get("consignment") === "true",
          noComparableData: searchParams.get("noComparableData") === "true",
        }),
      });
    }
    if (action === "validate") {
      const declared = Number(searchParams.get("declaredValue") || 0);
      const customs = Number(searchParams.get("customsValue") || 0);
      return NextResponse.json({ ok: true, result: validateValuation(declared, customs) });
    }
    if (action === "listMethods") {
      return NextResponse.json({ ok: true, result: listValuationMethods() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/customs-valuation] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "calculate") {
      const adj: ValuationAdjustment[] = Array.isArray(body.adjustments) ? body.adjustments : [];
      return NextResponse.json({
        ok: true,
        result: calculateCustomsValue(Number(body.transactionValue) || 0, adj, body.transportCosts, body.insurance, {
          currency: body.currency, forceMethod: body.forceMethod, basis: body.basis,
        }),
      });
    }
    if (action === "getMethod") {
      return NextResponse.json({
        ok: true,
        result: getValuationMethod({
          relatedPartySale: body.relatedPartySale,
          isNewProduct: body.isNewProduct,
          consignmentSale: body.consignmentSale,
          noComparableData: body.noComparableData,
          description: body.description,
        }),
      });
    }
    if (action === "validate") {
      return NextResponse.json({
        ok: true,
        result: validateValuation(Number(body.declaredValue) || 0, Number(body.customsValue) || 0),
      });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/customs-valuation] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
