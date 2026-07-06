// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  predictETA, predictTradeRisk, forecastDemand,
  recommendPSP, negotiatePrice,
  sanctionsRadar, detectDocumentAnomaly,
  optimizeRoute, recommendFxHedging, optimalSettlementTiming, assessCreditRisk
} from "@/lib/sgtx/ai/brain-intelligence";

// POST /api/sgtx/brain/intelligence
// Body: { module: "eta"|"risk"|"demand"|"psp"|"negotiate"|"sanctions"|"document"|"route"|"fx"|"settlement"|"credit", ...params }
// Returns: module-specific intelligence result
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { module, ...params } = body;

    let result;
    switch (module) {
      case "eta":
        result = await predictETA(params);
        break;
      case "risk":
        result = await predictTradeRisk(params);
        break;
      case "demand":
        result = await forecastDemand(params.commodity, params.hsCode, params.targetMonth);
        break;
      case "psp":
        result = await recommendPSP(params);
        break;
      case "negotiate":
        result = await negotiatePrice(params);
        break;
      case "sanctions":
        result = await sanctionsRadar(params);
        break;
      case "document":
        result = await detectDocumentAnomaly(params);
        break;
      case "route":
        result = await optimizeRoute(params);
        break;
      case "fx":
        result = await recommendFxHedging(params);
        break;
      case "settlement":
        result = await optimalSettlementTiming(params);
        break;
      case "credit":
        result = await assessCreditRisk(params);
        break;
      default:
        return NextResponse.json({ error: "Invalid module. Use one of: eta, risk, demand, psp, negotiate, sanctions, document, route, fx, settlement, credit" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, module, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
