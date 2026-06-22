// SGTX Part 3.19 — Trade Digital Twin (Scenario Simulation)
//
// Advisory-only simulations of external shocks on active and planned trades.
// The platform NEVER blocks or executes trades based on twin output — it only
// surfaces recommendations the human user can one-click apply.
//
// 5 scenario types per blueprint 3.19.2:
//   TARIFF      — tariff change (HS chapter, % delta, effective date)
//   CURRENCY    — currency shock (currency pair, % devaluation/appreciation)
//   REGULATORY  — new document/inspection requirement (delay probability, compliance cost)
//   LOGISTICS   — port closure / carrier strike / weather (rerouting cost, ETA delay)
//   FINANCING   — interest rate change / collateral requirement (APR change, margin call risk)

import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

export type ScenarioType = "TARIFF" | "CURRENCY" | "REGULATORY" | "LOGISTICS" | "FINANCING";

export interface SimulationInput {
  scenarioType: ScenarioType;
  tenantGtid: string;
  ustn?: string;            // single-trade scenario (optional — null for portfolio)
  parameters: {
    // TARIFF
    hsChapter?: string;       // e.g. "08" (citrus)
    tariffPctDelta?: number;  // +15 or -10
    effectiveDate?: string;   // ISO date
    // CURRENCY
    currencyPair?: string;    // "EGP/USD"
    devaluationPct?: number;  // +20 = 20% devaluation of base currency
    // REGULATORY
    newRequirement?: string;  // "phyto_certificate mandatory for HS 08"
    // LOGISTICS
    disruptionType?: string;  // "port_closure" | "carrier_strike" | "weather"
    port?: string;
    durationDays?: number;
    // FINANCING
    rateChangeBps?: number;   // +50 = +0.50% APR
    collateralRequirementPct?: number; // new collateral required as % of facility
  };
}

export interface SimulationResult {
  scenarioId: string;
  scenarioType: ScenarioType;
  ustn: string | null;
  affectedTrades: string[];
  impactForecast: {
    total_landed_cost_increase_pct?: number;
    demand_elasticity_estimate?: number;
    eta_delay_days?: number;
    rerouting_cost_usd?: number;
    apr_delta_bps?: number;
    margin_call_risk?: "LOW" | "MEDIUM" | "HIGH";
    delay_probability?: number;
    compliance_cost_usd?: number;
  };
  recommendation: string;
  confidence: number;
  disclaimer: string;
  acknowledged: boolean;
  appliedAt: string | null;
  createdAt: string;
}

/**
 * Run a digital-twin scenario simulation.
 * 1. Loads affected trades (single USTN or all tenant trades).
 * 2. Computes a deterministic impact forecast using domain heuristics.
 * 3. Calls A1 (Groq/zai) to generate a plain-language recommendation.
 * 4. Persists a TradeDigitalTwinScenario row.
 * 5. Returns the full SimulationResult.
 *
 * Advisory only — never blocks or executes trades.
 */
export async function simulateScenario(input: SimulationInput): Promise<SimulationResult> {
  const scenarioId = `twin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  // 1. Load affected trades
  let trades: any[] = [];
  try {
    if (input.ustn) {
      const t = await db.trade.findUnique({ where: { ustn: input.ustn } });
      trades = t ? [t] : [];
    } else {
      trades = await db.trade.findMany({
        where: {
          OR: [{ buyerGtid: input.tenantGtid }, { sellerGtid: input.tenantGtid }],
          status: { notIn: ["CANCELLED", "COMPLETED"] },
        },
        take: 50,
      });
    }
  } catch (e) {
    // db error → simulate with empty trade set
    trades = [];
  }

  const affectedTrades = trades.map(t => t.ustn);

  // 2. Deterministic impact forecast based on scenario type
  const impactForecast = computeImpactForecast(input, trades);

  // 3. AI-generated plain-language recommendation (A1 advisory)
  let recommendation = "";
  let confidence = 0.7;
  try {
    const prompt = buildPrompt(input, impactForecast, affectedTrades.length);
    const aiRes = await callAI({
      agent: "tradeDigitalTwin",
      tenant: input.tenantGtid,
      prompt,
    });
    recommendation = aiRes.content;
    // Parse confidence from response if available
    const confMatch = aiRes.content.match(/confidence[:\s]+([0-9.]+)/i);
    if (confMatch) confidence = Math.max(0, Math.min(1, parseFloat(confMatch[1])));
  } catch {
    recommendation = generateFallbackRecommendation(input, impactForecast);
  }

  // 4. Persist scenario row
  let persistedId: string | undefined;
  try {
    const persisted = await db.tradeDigitalTwinScenario.create({
      data: {
        scenarioType: input.scenarioType,
        ustn: input.ustn || null,
        tenantGtid: input.tenantGtid,
        inputParameters: JSON.stringify(input.parameters),
        affectedTrades: JSON.stringify(affectedTrades),
        impactForecast: JSON.stringify(impactForecast),
        recommendation,
        confidence,
        disclaimer: "Advisory only — not a guarantee.",
        acknowledged: false,
      },
    });
    persistedId = persisted.id;
  } catch (e) {
    // persistence is best-effort — return result anyway
  }

  return {
    scenarioId: persistedId || scenarioId,
    scenarioType: input.scenarioType,
    ustn: input.ustn || null,
    affectedTrades,
    impactForecast,
    recommendation,
    confidence,
    disclaimer: "Advisory only — not a guarantee.",
    acknowledged: false,
    appliedAt: null,
    createdAt,
  };
}

/**
 * Deterministic impact forecast.
 * Computes a baseline impact using domain heuristics — no AI required.
 * AI is used only for the recommendation narrative.
 */
function computeImpactForecast(input: SimulationInput, trades: any[]): SimulationResult["impactForecast"] {
  const params = input.parameters;
  switch (input.scenarioType) {
    case "TARIFF": {
      const pct = params.tariffPctDelta ?? 0;
      const tariffPassThrough = 0.7; // 70% of tariff passes through to landed cost
      const demandElasticity = -0.4; // default for agricultural commodities
      return {
        total_landed_cost_increase_pct: Math.round(pct * tariffPassThrough * 10) / 10,
        demand_elasticity_estimate: demandElasticity,
      };
    }
    case "CURRENCY": {
      const pct = params.devaluationPct ?? 0;
      // 50% of currency shock passes through to import cost (partial hedging assumed)
      const costImpact = pct * 0.5;
      return {
        total_landed_cost_increase_pct: Math.round(costImpact * 10) / 10,
        demand_elasticity_estimate: -0.3,
      };
    }
    case "REGULATORY": {
      // New document requirement adds 2-5 day delay + $200-800 compliance cost
      return {
        delay_probability: 0.65,
        compliance_cost_usd: 450,
      };
    }
    case "LOGISTICS": {
      const durationDays = params.durationDays ?? 7;
      // Rerouting cost scales with duration × $350/day base
      const reroutingCost = durationDays * 350;
      return {
        eta_delay_days: durationDays,
        rerouting_cost_usd: reroutingCost,
      };
    }
    case "FINANCING": {
      const bps = params.rateChangeBps ?? 0;
      const collateralPct = params.collateralRequirementPct ?? 0;
      let marginCallRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
      if (collateralPct >= 20) marginCallRisk = "HIGH";
      else if (collateralPct >= 10) marginCallRisk = "MEDIUM";
      return {
        apr_delta_bps: bps,
        margin_call_risk: marginCallRisk,
      };
    }
    default:
      return {};
  }
}

function buildPrompt(input: SimulationInput, forecast: any, affectedCount: number): string {
  const lines = [
    `You are the SGTX Trade Digital Twin (advisory only). Analyze this scenario and produce a JSON response:`,
    ``,
    `Scenario type: ${input.scenarioType}`,
    `Parameters: ${JSON.stringify(input.parameters, null, 2)}`,
    `Affected trades: ${affectedCount} active shipment(s)`,
    `Computed impact forecast: ${JSON.stringify(forecast, null, 2)}`,
    ``,
    `Return JSON ONLY with this shape:`,
    `{`,
    `  "recommendation": "2-4 sentence plain-language recommendation. Mention specific actions: accelerate shipment, hedge, switch corridor, increase collateral, etc.",`,
    `  "confidence": 0.0 to 1.0`,
    `  "one_click_actions": ["optional list of suggested one-click actions"]`,
    `}`,
    ``,
    `SGTX is a NON-MARKETPLACE system. Never recommend specific counterparties. Advisory only.`,
  ];
  return lines.join("\n");
}

function generateFallbackRecommendation(input: SimulationInput, forecast: any): string {
  switch (input.scenarioType) {
    case "TARIFF":
      return `Tariff change of ${input.parameters.tariffPctDelta}% on HS chapter ${input.parameters.hsChapter} is projected to increase total landed cost by ${forecast.total_landed_cost_increase_pct}%. Demand elasticity estimate: ${forecast.demand_elasticity_estimate}. Consider accelerating shipments before the effective date (${input.parameters.effectiveDate || "TBD"}) and reviewing pricing strategy.`;
    case "CURRENCY":
      return `Currency shock of ${input.parameters.devaluationPct}% on ${input.parameters.currencyPair} is projected to increase landed cost by ${forecast.total_landed_cost_increase_pct}%. Consider hedging future shipments and reviewing pricing with the counterparty.`;
    case "REGULATORY":
      return `New regulatory requirement ("${input.parameters.newRequirement}") is projected to cause a ${Math.round(forecast.delay_probability * 100)}% delay probability and $${forecast.compliance_cost_usd} compliance cost per shipment. Update document requirements proactively.`;
    case "LOGISTICS":
      return `Logistics disruption (${input.parameters.disruptionType} at ${input.parameters.port}, ${input.parameters.durationDays} days) is projected to cause ${forecast.eta_delay_days} day ETA delay and $${forecast.rerouting_cost_usd} rerouting cost. Consider alternative ports or carriers.`;
    case "FINANCING":
      return `Financing impact: APR change of +${forecast.apr_delta_bps} bps, margin call risk: ${forecast.margin_call_risk}. ${forecast.margin_call_risk !== "LOW" ? "Top up collateral proactively to avoid margin call." : "No immediate collateral action required."}`;
    default:
      return "Scenario simulation completed. Review impact forecast for details.";
  }
}

/**
 * Acknowledge a scenario (mark as seen by the tenant).
 * Does NOT apply the recommendation — that requires a separate explicit action.
 */
export async function acknowledgeScenario(scenarioId: string): Promise<{ ok: boolean; scenarioId: string }> {
  try {
    await db.tradeDigitalTwinScenario.update({
      where: { id: scenarioId },
      data: { acknowledged: true },
    });
    return { ok: true, scenarioId };
  } catch (e: any) {
    return { ok: false, scenarioId };
  }
}

/**
 * Mark a scenario as applied (one-click action was taken by the tenant).
 * The actual application (e.g., creating a hedging instrument) happens via
 * separate domain endpoints — this just records the acknowledgment.
 */
export async function applyScenario(scenarioId: string): Promise<{ ok: boolean; scenarioId: string; appliedAt: string }> {
  const appliedAt = new Date().toISOString();
  try {
    await db.tradeDigitalTwinScenario.update({
      where: { id: scenarioId },
      data: { acknowledged: true, appliedAt: new Date() },
    });
    return { ok: true, scenarioId, appliedAt };
  } catch (e: any) {
    return { ok: false, scenarioId, appliedAt };
  }
}

/**
 * List scenarios for a tenant (optionally filtered by USTN or scenario type).
 */
export async function listScenarios(filter: {
  tenantGtid?: string;
  ustn?: string;
  scenarioType?: ScenarioType;
  limit?: number;
}): Promise<SimulationResult[]> {
  const where: any = {};
  if (filter.tenantGtid) where.tenantGtid = filter.tenantGtid;
  if (filter.ustn) where.ustn = filter.ustn;
  if (filter.scenarioType) where.scenarioType = filter.scenarioType;

  const rows = await db.tradeDigitalTwinScenario.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 20,
  });

  return rows.map((r: any) => ({
    scenarioId: r.id,
    scenarioType: r.scenarioType as ScenarioType,
    ustn: r.ustn,
    affectedTrades: JSON.parse(r.affectedTrades || "[]"),
    impactForecast: JSON.parse(r.impactForecast || "{}"),
    recommendation: r.recommendation,
    confidence: r.confidence,
    disclaimer: r.disclaimer,
    acknowledged: r.acknowledged,
    appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Returns the 5 supported scenario types with their input parameter schemas.
 * Used by the frontend "Scenario Analysis" button to render the scenario picker.
 */
export const SCENARIO_TYPES: Array<{
  type: ScenarioType;
  label: string;
  description: string;
  parameters: Array<{ key: string; label: string; type: string; required: boolean }>;
}> = [
  {
    type: "TARIFF",
    label: "Tariff Change",
    description: "Simulate a tariff increase or decrease on an HS chapter.",
    parameters: [
      { key: "hsChapter", label: "HS Chapter (2-digit)", type: "string", required: true },
      { key: "tariffPctDelta", label: "Tariff % Delta (+/-)", type: "number", required: true },
      { key: "effectiveDate", label: "Effective Date", type: "date", required: false },
    ],
  },
  {
    type: "CURRENCY",
    label: "Currency Shock",
    description: "Simulate a devaluation or appreciation of a currency pair.",
    parameters: [
      { key: "currencyPair", label: "Currency Pair (e.g. EGP/USD)", type: "string", required: true },
      { key: "devaluationPct", label: "Devaluation % (+/-)", type: "number", required: true },
    ],
  },
  {
    type: "REGULATORY",
    label: "Regulatory Change",
    description: "Simulate a new document or inspection requirement.",
    parameters: [
      { key: "newRequirement", label: "New Requirement Description", type: "text", required: true },
    ],
  },
  {
    type: "LOGISTICS",
    label: "Logistics Disruption",
    description: "Simulate a port closure, carrier strike, or weather event.",
    parameters: [
      { key: "disruptionType", label: "Disruption Type", type: "string", required: true },
      { key: "port", label: "Port", type: "string", required: false },
      { key: "durationDays", label: "Duration (days)", type: "number", required: true },
    ],
  },
  {
    type: "FINANCING",
    label: "Financing Impact",
    description: "Simulate an interest rate change or new collateral requirement.",
    parameters: [
      { key: "rateChangeBps", label: "Rate Change (bps)", type: "number", required: true },
      { key: "collateralRequirementPct", label: "New Collateral Required (%)", type: "number", required: false },
    ],
  },
];
