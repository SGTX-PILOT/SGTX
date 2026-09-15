// @ts-nocheck
/**
 * SGTX v18 §9.27 — Dynamic Fee Engine — ESTIMATE route (advisory, pre-calculation)
 * ============================================================================
 *
 * POST /api/sgtx/fees/estimate
 *
 * Body:
 *   {
 *     ustn?:              string   (optional — if provided, server loads the trade
 *                                            snapshot from the DB and merges with
 *                                            the body overrides)
 *     exw_value?:         number   (USD — required if no ustn)
 *     logistics_costs?:   LogisticsCostInput[]   (per-line seller logistics)
 *     incoterm?:          string   (EXW | FCA | FOB | CFR | CIF | ... — defaults
 *                                            to EXW if absent)
 *     estimated_margin_pct?: number (optional — used for affordability preview)
 *   }
 *
 * Returns:
 *   {
 *     estimated_cfb:           number
 *     estimated_fair_rate:      number
 *     estimated_fee_range:     { low, mid, high }
 *     economic_classes:        string[]
 *     primary_class:          string
 *     exw_value:              number
 *     eligible_logistics:     number
 *     eligible_logistics_lines: { service, amount, payer }[]
 *     exclusions:             { reason, lines }
 *     incoterm:               string
 *     formula_version:        string
 *     policy_version:         string
 *   }
 *
 * PUBLIC route (anonymous callers can POST — tenant scoping by body params).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  computeCFB,
  classifyEconomics,
  scoreCostToServe,
  scoreRisk,
  scoreValueDelivered,
  scoreEfficiency,
  calculateFairnessScore,
  calculateBaseFairRate,
} from "@/lib/sgtx/fee-engine";
import {
  RATE_FLOOR,
  RATE_CEILING,
  FEE_POLICY_VERSION,
  FEE_FORMULA_VERSION,
} from "@/lib/sgtx/fee-engine/constants";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustn = String(body?.ustn || "").trim();
    let exwValue = Number(body?.exw_value);
    let logisticsCosts = Array.isArray(body?.logistics_costs) ? body.logistics_costs : [];
    let incoterm = String(body?.incoterm || "EXW").toUpperCase();
    let estimatedMarginPct = Number(body?.estimated_margin_pct) || 12;

    // If ustn provided, load the trade and merge (body overrides take precedence).
    if (ustn) {
      try {
        const trade = await db.trade.findUnique({ where: { ustn } });
        if (trade) {
          if (!Number.isFinite(exwValue) || exwValue <= 0) {
            exwValue = Number(trade.tradeValueUsd) || 0;
          }
          if (!incoterm || incoterm === "EXW") {
            incoterm = (trade.incoterm || "EXW").toUpperCase();
          }
          if (logisticsCosts.length === 0 && trade.logisticsRfqSummary) {
            try {
              const parsed = JSON.parse(trade.logisticsRfqSummary);
              if (Array.isArray(parsed)) logisticsCosts = parsed;
              else if (parsed && Array.isArray(parsed.costs)) logisticsCosts = parsed.costs;
              else if (parsed && Array.isArray(parsed.lines)) logisticsCosts = parsed.lines;
            } catch {
              // ignore
            }
          }
        }
      } catch (err: any) {
        logger.warn("[fees/estimate] trade lookup failed", { ustn, error: err?.message });
      }
    }

    if (!Number.isFinite(exwValue) || exwValue < 0) {
      return NextResponse.json(
        { error: "exw_value must be a non-negative number (or provide a valid ustn)" },
        { status: 400 },
      );
    }

    // ── Layer 1 — CFB ──────────────────────────────────────────────────────
    const cfb = computeCFB(exwValue, logisticsCosts, incoterm);

    // ── Economic classification ─────────────────────────────────────────────
    const econ = classifyEconomics({
      exwValue,
      commodity: String(body?.commodity || ""),
      commodityHs: String(body?.commodity_hs || ""),
      grossWeightKg: Number(body?.gross_weight_kg) || 0,
      containerCount: Number(body?.container_count) || 1,
      coldChain: Boolean(body?.cold_chain),
      transportMode: String(body?.transport_mode || ""),
      equipmentType: String(body?.equipment_type || ""),
      bankInstrument: String(body?.bank_instrument || "") || null,
      multiShipment: Boolean(body?.multi_shipment),
      parentUstn: String(body?.parent_ustn || "") || null,
      originCountry: String(body?.origin_country || ""),
      destCountry: String(body?.dest_country || ""),
      status: String(body?.status || ""),
      tradeCriticality: String(body?.trade_criticality || "") || null,
      estimatedMarginPct,
    });

    // ── Estimate the four scores using defaults / heuristics ───────────────
    const cts = scoreCostToServe({
      multiShipment: Boolean(body?.multi_shipment),
      transportMode: String(body?.transport_mode || ""),
      originTier: 2,
      destTier: 2,
      integrationCount: 2,
    });
    const risk = scoreRisk({
      sanctionsProximityScore: 10,
      jurisdictionRiskScore: 30,
      commodityRiskScore: 20,
      perishabilityScore: Boolean(body?.cold_chain) ? 60 : 10,
      valueAtRiskScore: exwValue > 0 ? Math.min(100, exwValue / 1_000_000 * 100) : 0,
      counterpartyTriScore: 40,
    });
    const value = scoreValueDelivered({
      timeSavedDays: 5,
      documentAutomationPct: 60,
      financingAccessScore: body?.bank_instrument ? 70 : 30,
      complianceCoveragePct: 80,
      auditTrailQualityScore: 75,
      tradeHealthImprovement: 5,
    });
    const efficiency = scoreEfficiency({
      apiIntegrationDepthScore: 60,
      automationLevelPct: 50,
      dataQualityScore: 70,
      straightThroughProcessingPct: 40,
      exceptionRatePct: 20,
    });

    const fairness = calculateFairnessScore(cts.score, risk.score, value.score, efficiency.score);
    const baseFairRate = calculateBaseFairRate(fairness.score);

    // ── Compute the fee range (low / mid / high) ───────────────────────────
    // low  = CFB × RATE_FLOOR (absolute floor — pessimistic)
    // mid  = CFB × BASE_FAIR_RATE (the engine's mid estimate)
    // high = CFB × RATE_CEILING (absolute ceiling — worst case)
    const low = cfb.cfb * RATE_FLOOR;
    const mid = cfb.cfb * baseFairRate.rate;
    const high = cfb.cfb * RATE_CEILING;

    return NextResponse.json({
      estimated_cfb: cfb.cfb,
      estimated_fair_rate: baseFairRate.rate,
      estimated_fee_range: {
        low: Math.round(low * 100) / 100,
        mid: Math.round(mid * 100) / 100,
        high: Math.round(high * 100) / 100,
      },
      economic_classes: econ.classes,
      primary_class: econ.primaryClass,
      exw_value: cfb.exwValue,
      eligible_logistics: cfb.eligibleLogisticsUsd,
      eligible_logistics_lines: cfb.eligibleLogisticsLines,
      exclusions: cfb.exclusions,
      incoterm: cfb.incoterm,
      fairness_score: fairness.score,
      layer_scores: {
        cts: cts.score,
        risk: risk.score,
        value: value.score,
        efficiency: efficiency.score,
      },
      formula_version: FEE_FORMULA_VERSION,
      policy_version: FEE_POLICY_VERSION,
    });
  } catch (err: any) {
    logger.error("[fees/estimate] unhandled error", { error: err?.message });
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || "Unknown" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/sgtx/fees/estimate",
    method: "POST",
    description: "Dynamic Fee Engine — advisory estimate (pre-calculation).",
    body_shape: {
      ustn: "string (optional)",
      exw_value: "number (USD, required if no ustn)",
      logistics_costs: "LogisticsCostInput[] (per-line seller logistics)",
      incoterm: "string (default EXW)",
      estimated_margin_pct: "number (default 12)",
    },
    returns: {
      estimated_cfb: "number",
      estimated_fair_rate: "number",
      estimated_fee_range: "{ low, mid, high }",
      economic_classes: "string[]",
      primary_class: "string",
    },
    formula_version: FEE_FORMULA_VERSION,
    policy_version: FEE_POLICY_VERSION,
  });
}
