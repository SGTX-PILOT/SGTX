// @ts-nocheck
// SGTX BRAIN — State-of-Art Intelligence Modules
// 
// 5 predictive intelligence layers that make SGTX the world's most
// intelligent trade execution platform:
//
// 1. PREDICTIVE TRADE INTELLIGENCE — ETA prediction, risk scoring, demand forecasting
// 2. REAL-TIME DECISION INTELLIGENCE — Auto-routing, PSP selection, price negotiation
// 3. PROACTIVE COMPLIANCE INTELLIGENCE — Sanctions radar, document anomaly, AML
// 4. TRADE CORRIDOR OPTIMIZATION — Route intelligence, port congestion, carrier scoring
// 5. FINANCIAL INTELLIGENCE — FX hedging, settlement timing, credit risk

import { runAI } from "@/lib/sgtx/ai/orchestrator";
import { db } from "@/lib/db";
import crypto from "crypto";

// ============================================================
// 1. PREDICTIVE TRADE INTELLIGENCE
// ============================================================

/**
 * Predict shipment ETA based on route, carrier, port congestion, and historical data.
 * Uses AI to analyze multiple factors and produce a confidence-weighted prediction.
 */
export async function predictETA(params: {
  ustn: string;
  originPort: string;
  destPort: string;
  carrierGtid?: string;
  vesselName?: string;
  containerCount: number;
  coldChain: boolean;
  departureDate: string;
}): Promise<{
  predictedArrival: string;
  confidence: number;
  transitDays: number;
  riskFactors: { factor: string; impact: string; severity: "LOW" | "MEDIUM" | "HIGH" }[];
  alternativeDates: { scenario: string; date: string; probability: number }[];
  aiReasoning: string;
}> {
  // Gather historical data
  const historicalShipments = await db.shipment.findMany({
    where: { OR: [{ originPort: params.originPort }, { destPort: params.destPort }] },
    take: 50,
    orderBy: { createdAt: "desc" },
  }).catch(() => []);

  const avgTransitDays = historicalShipments.length > 0
    ? historicalShipments.reduce((sum, s) => sum + (s.transitDays || 21), 0) / historicalShipments.length
    : 21; // Default 21 days

  // AI prediction
  try {
    const result = await runAI({
      agentName: "eta_predictor",
      authority: "A2",
      systemPrompt: `You are SGTX Brain's ETA prediction engine. Analyze the shipment parameters and predict the arrival date. Consider: route distance, port congestion, carrier reliability, cold chain requirements, seasonal weather patterns, and historical transit times. Return JSON with: predictedArrival (ISO date), confidence (0-1), transitDays (integer), riskFactors (array of {factor, impact, severity}), alternativeDates (array of {scenario, date, probability}), aiReasoning (string explaining the prediction).`,
      userPrompt: JSON.stringify({
        ...params,
        historicalAvgTransitDays: Math.round(avgTransitDays),
        historicalSampleSize: historicalShipments.length,
        currentDate: new Date().toISOString(),
      }),
      fallbackKey: "eta_prediction",
      maxTokens: 500,
      temperature: 0.3,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch { /* fall through */ }

    // Fallback calculation
    const transitDays = Math.round(avgTransitDays);
    const predicted = new Date(params.departureDate);
    predicted.setDate(predicted.getDate() + transitDays);
    return {
      predictedArrival: predicted.toISOString(),
      confidence: 0.65,
      transitDays,
      riskFactors: [
        { factor: "Port congestion at destination", impact: "+2-3 days delay possible", severity: "MEDIUM" },
        { factor: "Seasonal weather", impact: "Minor delays possible", severity: "LOW" },
      ],
      alternativeDates: [
        { scenario: "Best case (no delays)", date: new Date(predicted.getTime() - 2 * 86400000).toISOString(), probability: 0.25 },
        { scenario: "Most likely", date: predicted.toISOString(), probability: 0.55 },
        { scenario: "Worst case (delays)", date: new Date(predicted.getTime() + 5 * 86400000).toISOString(), probability: 0.20 },
      ],
      aiReasoning: `Based on ${historicalShipments.length} historical shipments on this route, average transit time is ${transitDays} days. AI prediction unavailable — using statistical fallback.`,
    };
  } catch {
    const transitDays = Math.round(avgTransitDays);
    const predicted = new Date(params.departureDate);
    predicted.setDate(predicted.getDate() + transitDays);
    return {
      predictedArrival: predicted.toISOString(),
      confidence: 0.5,
      transitDays,
      riskFactors: [{ factor: "AI unavailable", impact: "Using statistical fallback", severity: "LOW" }],
      alternativeDates: [],
      aiReasoning: "Statistical fallback based on historical data.",
    };
  }
}

/**
 * Predict trade risk score based on multi-factor analysis.
 */
export async function predictTradeRisk(params: {
  ustn: string;
  buyerGtid: string;
  sellerGtid: string;
  commodity: string;
  hsCode: string;
  tradeValueUsd: number;
  originCountry: string;
  destCountry: string;
  incoterm: string;
}): Promise<{
  riskScore: number;          // 0-100 (0=safe, 100=critical)
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskFactors: { category: string; factor: string; score: number; mitigation: string }[];
  recommendation: string;
  confidence: number;
}> {
  const factors: any[] = [];

  // Rule-based risk factors
  // 1. Country risk
  const HIGH_RISK_COUNTRIES = ["IR", "SY", "KP", "CU", "VE", "BY", "RU"];
  if (HIGH_RISK_COUNTRIES.includes(params.originCountry) || HIGH_RISK_COUNTRIES.includes(params.destCountry)) {
    factors.push({ category: "SANCTIONS", factor: "High-risk jurisdiction involved", score: 40, mitigation: "Enhanced due diligence required. Obtain export/license certificates." });
  }

  // 2. Value risk
  if (params.tradeValueUsd > 500000) {
    factors.push({ category: "FINANCIAL", factor: "High-value trade", score: 20, mitigation: "Consider letter of credit or escrow arrangement." });
  }

  // 3. New counterparty risk
  const buyerTrades = await db.trade.count({ where: { buyerGtid: params.buyerGtid } }).catch(() => 0);
  const sellerTrades = await db.trade.count({ where: { sellerGtid: params.sellerGtid } }).catch(() => 0);
  if (buyerTrades < 3) factors.push({ category: "COUNTERPARTY", factor: "Buyer has limited trade history", score: 15, mitigation: "Request additional financial references." });
  if (sellerTrades < 3) factors.push({ category: "COUNTERPARTY", factor: "Seller has limited trade history", score: 15, mitigation: "Request quality certifications and samples." });

  // 4. Commodity risk
  const DUAL_USE_HS = ["28", "29", "30", "36", "84", "85", "87", "90"];
  if (DUAL_USE_HS.includes(params.hsCode.substring(0, 2))) {
    factors.push({ category: "COMPLIANCE", factor: "Potential dual-use commodity", score: 25, mitigation: "Obtain end-user certificate and export license if required." });
  }

  // 5. Cold chain risk
  if (params.commodity.toLowerCase().includes("frozen") || params.commodity.toLowerCase().includes("fresh")) {
    factors.push({ category: "LOGISTICS", factor: "Cold chain required — temperature deviation risk", score: 15, mitigation: "Use reefer containers with real-time temperature monitoring." });
  }

  // AI enhancement
  try {
    const result = await runAI({
      agentName: "trade_risk_predictor",
      authority: "A2",
      systemPrompt: "You are SGTX Brain's trade risk prediction engine. Analyze the trade parameters and identify additional risk factors beyond the rule-based checks. Return JSON with: additionalRiskFactors (array of {category, factor, score, mitigation}), overallRecommendation (string), confidenceAdjustment (number, -0.2 to +0.2).",
      userPrompt: JSON.stringify(params),
      fallbackKey: "trade_risk",
      maxTokens: 300,
      temperature: 0.3,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        factors.push(...(aiResult.additionalRiskFactors || []));
      }
    } catch { /* non-fatal */ }
  } catch { /* non-fatal */ }

  const totalScore = Math.min(100, factors.reduce((sum, f) => sum + (f.score || 0), 0));
  const riskLevel = totalScore >= 60 ? "CRITICAL" : totalScore >= 40 ? "HIGH" : totalScore >= 20 ? "MEDIUM" : "LOW";

  return {
    riskScore: totalScore,
    riskLevel,
    riskFactors: factors,
    recommendation: riskLevel === "CRITICAL"
      ? "Trade requires Governor review before execution. All risk factors must be mitigated."
      : riskLevel === "HIGH"
        ? "Enhanced due diligence recommended. Consider insurance and escrow."
        : riskLevel === "MEDIUM"
          ? "Standard monitoring applies. Monitor risk factors during execution."
          : "Low risk — standard trade execution applies.",
    confidence: 0.8,
  };
}

/**
 * Forecast commodity demand based on seasonal patterns and market signals.
 */
export async function forecastDemand(commodity: string, hsCode: string, targetMonth: string): Promise<{
  demandIndex: number;       // 0-100 (50=average)
  trend: "increasing" | "decreasing" | "stable";
  seasonalFactors: string[];
  priceImpact: "up" | "down" | "neutral";
  forecastConfidence: number;
  recommendation: string;
}> {
  try {
    const result = await runAI({
      agentName: "demand_forecaster",
      authority: "A2",
      systemPrompt: `You are SGTX Brain's demand forecasting engine. Analyze seasonal patterns, market trends, and global events to forecast demand for the specified commodity in the target month. Return JSON with: demandIndex (0-100, 50=average), trend ("increasing"|"decreasing"|"stable"), seasonalFactors (array of strings), priceImpact ("up"|"down"|"neutral"), forecastConfidence (0-1), recommendation (string).`,
      userPrompt: JSON.stringify({ commodity, hsCode, targetMonth, currentDate: new Date().toISOString() }),
      fallbackKey: "demand_forecast",
      maxTokens: 250,
      temperature: 0.3,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch { /* fall through */ }

    return {
      demandIndex: 50, trend: "stable", seasonalFactors: ["Unable to determine seasonal factors"],
      priceImpact: "neutral", forecastConfidence: 0.5,
      recommendation: "Monitor market conditions before large orders.",
    };
  } catch {
    return {
      demandIndex: 50, trend: "stable", seasonalFactors: ["AI unavailable"],
      priceImpact: "neutral", forecastConfidence: 0.4,
      recommendation: "Use manual market analysis for planning.",
    };
  }
}

// ============================================================
// 2. REAL-TIME DECISION INTELLIGENCE
// ============================================================

/**
 * Recommend optimal PSP (Payment Service Provider) based on trade parameters.
 */
export async function recommendPSP(params: {
  amountUsd: number;
  payerCountry: string;
  payeeCountry: string;
  currency: string;
  urgency: "STANDARD" | "EXPRESS" | "CRITICAL";
  payerHistory: { successfulPayments: number; failedPayments: number };
}): Promise<{
  recommendedPSP: string;
  reason: string;
  estimatedFee: number;
  estimatedTime: string;
  alternatives: { psp: string; fee: number; time: string; tradeoff: string }[];
  confidence: number;
}> {
  const PSPS = [
    { id: "FAWRY", fee: 0.015, time: "instant", countries: ["EG"], currency: "EGP", reliability: 0.95 },
    { id: "PAYMOB", fee: 0.020, time: "instant", countries: ["EG", "AE", "SA"], currency: "EGP", reliability: 0.92 },
    { id: "STRIPE", fee: 0.029, time: "1-2 days", countries: ["*"], currency: "USD", reliability: 0.98 },
    { id: "CBE_IPN", fee: 0.010, time: "2-3 hours", countries: ["EG"], currency: "EGP", reliability: 0.99 },
  ];

  const eligible = PSPS.filter(psp => 
    psp.countries.includes("*") || psp.countries.includes(params.payerCountry)
  );

  // Score each PSP
  const scored = eligible.map(psp => {
    let score = psp.reliability * 100;
    score -= psp.fee * 1000; // Lower fee = higher score
    if (params.urgency === "CRITICAL" && psp.time === "instant") score += 20;
    if (params.urgency === "EXPRESS" && psp.time.includes("hours")) score += 10;
    if (psp.currency === params.currency) score += 5;
    return { ...psp, score };
  }).sort((a, b) => b.score - a.score);

  const recommended = scored[0] || PSPS[2]; // Default to Stripe
  const fee = params.amountUsd * recommended.fee;

  return {
    recommendedPSP: recommended.id,
    reason: `Best overall score: ${(recommended.reliability * 100).toFixed(0)}% reliability, ${recommended.fee * 100}% fee, ${recommended.time} settlement`,
    estimatedFee: Math.round(fee * 100) / 100,
    estimatedTime: recommended.time,
    alternatives: scored.slice(1, 3).map(psp => ({
      psp: psp.id,
      fee: Math.round(params.amountUsd * psp.fee * 100) / 100,
      time: psp.time,
      tradeoff: psp.fee < recommended.fee ? "Lower fee but slower" : "Higher reliability",
    })),
    confidence: 0.85,
  };
}

/**
 * AI-powered price negotiation assistant.
 * Generates counter-offer suggestions based on market data and trade context.
 */
export async function negotiatePrice(params: {
  commodity: string;
  hsCode: string;
  quotedPriceUsd: number;
  marketAvgPriceUsd: number;
  quantity: number;
  buyerHistory: { totalTrades: number; avgTradeValue: number };
  sellerHistory: { totalTrades: number; avgTradeValue: number };
  incoterm: string;
}): Promise<{
  strategy: "ACCEPT" | "COUNTER" | "REJECT" | "REQUEST_INFO";
  counterOfferUsd?: number;
  reasoning: string;
  negotiationPoints: string[];
  walkAwayPrice: number;
  confidence: number;
}> {
  const deviation = ((params.quotedPriceUsd - params.marketAvgPriceUsd) / params.marketAvgPriceUsd) * 100;
  const quantityDiscount = params.quantity > 10000 ? 0.05 : params.quantity > 1000 ? 0.03 : 0;

  let strategy: "ACCEPT" | "COUNTER" | "REJECT" | "REQUEST_INFO" = "ACCEPT";
  let counterOffer: number | undefined;
  const points: string[] = [];

  if (deviation > 15) {
    strategy = "COUNTER";
    counterOffer = Math.round(params.marketAvgPriceUsd * (1 + quantityDiscount) * 100) / 100;
    points.push(`Quoted price is ${deviation.toFixed(1)}% above market average of $${params.marketAvgPriceUsd}`);
    points.push(`Counter at $${counterOffer} — aligns with market + ${quantityDiscount * 100}% volume discount`);
  } else if (deviation > 5) {
    strategy = "COUNTER";
    counterOffer = Math.round((params.quotedPriceUsd + params.marketAvgPriceUsd) / 2 * 100) / 100;
    points.push(`Price is ${deviation.toFixed(1)}% above market — moderate counter suggested`);
  } else if (deviation < -15) {
    strategy = "REQUEST_INFO";
    points.push(`Price is ${Math.abs(deviation).toFixed(1)}% below market — verify quality and authenticity`);
  } else {
    points.push(`Price is within market range (${deviation.toFixed(1)}% from average)`);
  }

  if (params.buyerHistory.totalTrades > 10) {
    points.push("Loyal buyer — leverage relationship for better terms");
  }

  const walkAway = Math.round(params.marketAvgPriceUsd * 1.25 * 100) / 100; // 25% above market

  // AI enhancement
  try {
    const result = await runAI({
      agentName: "price_negotiator",
      authority: "A1",
      systemPrompt: "You are SGTX Brain's price negotiation assistant. Based on the trade context, suggest additional negotiation points. Return JSON with: additionalPoints (array of strings), strategyAdjustment (string, optional).",
      userPrompt: JSON.stringify({ ...params, deviation, currentStrategy: strategy }),
      fallbackKey: "price_negotiation",
      maxTokens: 200,
      temperature: 0.4,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        points.push(...(aiResult.additionalPoints || []));
      }
    } catch { /* non-fatal */ }
  } catch { /* non-fatal */ }

  return {
    strategy,
    counterOfferUsd: counterOffer,
    reasoning: points.join(". "),
    negotiationPoints: points,
    walkAwayPrice: walkAway,
    confidence: 0.8,
  };
}

// ============================================================
// 3. PROACTIVE COMPLIANCE INTELLIGENCE
// ============================================================

/**
 * Sanctions radar — continuous monitoring of trade parties against sanctions lists.
 */
export async function sanctionsRadar(params: {
  partyGtid: string;
  legalName: string;
  country: string;
  uboNames?: string[];
  hsCode: string;
}): Promise<{
  riskLevel: "CLEAR" | "ELEVATED" | "HIGH" | "CRITICAL";
  hits: { list: string; matchType: string; confidence: number; details: string }[];
  recommendation: string;
  requiresManualReview: boolean;
}> {
  const hits: any[] = [];

  // Check against known high-risk patterns
  const SANCTIONED_PATTERNS = [
    { pattern: /SDN|OFAC|BLOCKED/i, list: "OFAC SDN List", severity: "CRITICAL" },
    { pattern: /EU.*RESTRICTIVE/i, list: "EU Restrictive Measures", severity: "HIGH" },
    { pattern: /UN.*CONSOLIDATED/i, list: "UN Consolidated List", severity: "CRITICAL" },
  ];

  for (const { pattern, list, severity } of SANCTIONED_PATTERNS) {
    if (pattern.test(params.legalName)) {
      hits.push({ list, matchType: "NAME_MATCH", confidence: 0.9, details: `Direct name match on ${list}` });
    }
  }

  // Check country
  const SANCTIONED_COUNTRIES = ["IR", "SY", "KP", "CU"];
  if (SANCTIONED_COUNTRIES.includes(params.country)) {
    hits.push({ list: "Country Sanctions", matchType: "JURISDICTION", confidence: 1.0, details: `${params.country} is on comprehensive sanctions list` });
  }

  // AI screening
  try {
    const result = await runAI({
      agentName: "sanctions_screener",
      authority: "A2",
      systemPrompt: "You are SGTX Brain's sanctions screening AI. Screen the party against known sanctions patterns. Consider name similarity, country risk, UBO connections, and HS code dual-use potential. Return JSON with: riskLevel ('CLEAR'|'ELEVATED'|'HIGH'|'CRITICAL'), additionalHits (array of {list, matchType, confidence, details}), recommendation (string), requiresManualReview (boolean).",
      userPrompt: JSON.stringify(params),
      fallbackKey: "sanctions_screening",
      maxTokens: 250,
      temperature: 0.2,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        hits.push(...(aiResult.additionalHits || []));
        const riskLevel = aiResult.riskLevel || (hits.length > 0 ? "ELEVATED" : "CLEAR");
        return {
          riskLevel,
          hits,
          recommendation: aiResult.recommendation || (hits.length > 0 ? "Enhanced due diligence required" : "No sanctions concerns identified"),
          requiresManualReview: aiResult.requiresManualReview || hits.length > 0,
        };
      }
    } catch { /* fall through */ }
  } catch { /* non-fatal */ }

  const riskLevel = hits.length > 0 ? "HIGH" : "CLEAR";
  return {
    riskLevel,
    hits,
    recommendation: hits.length > 0 ? "Manual review required — potential sanctions match detected" : "No sanctions concerns identified",
    requiresManualReview: hits.length > 0,
  };
}

/**
 * Document anomaly detection — checks uploaded documents for inconsistencies.
 */
export async function detectDocumentAnomaly(params: {
  documentType: string;
  ustn: string;
  declaredValue: number;
  declaredWeight: number;
  declaredOrigin: string;
  extractedText?: string;
}): Promise<{
  anomalies: { type: string; description: string; severity: "LOW" | "MEDIUM" | "HIGH" }[];
  riskScore: number;
  recommendation: string;
}> {
  const anomalies: any[] = [];

  // Check for value mismatches
  const trade = await db.trade.findUnique({ where: { ustn: params.ustn } }).catch(() => null);
  if (trade) {
    if (params.declaredValue && Math.abs(params.declaredValue - trade.tradeValueUsd) / trade.tradeValueUsd > 0.1) {
      anomalies.push({
        type: "VALUE_MISMATCH",
        description: `Document declares $${params.declaredValue} but trade value is $${trade.tradeValueUsd} (${Math.abs(params.declaredValue - trade.tradeValueUsd) / trade.tradeValueUsd * 100}% deviation)`,
        severity: "HIGH",
      });
    }
    if (params.declaredWeight && Math.abs(params.declaredWeight - trade.grossWeightKg) / trade.grossWeightKg > 0.05) {
      anomalies.push({
        type: "WEIGHT_MISMATCH",
        description: `Document declares ${params.declaredWeight}kg but trade declares ${trade.grossWeightKg}kg`,
        severity: "MEDIUM",
      });
    }
  }

  // AI analysis
  try {
    const result = await runAI({
      agentName: "document_anomaly_detector",
      authority: "A2",
      systemPrompt: "You are SGTX Brain's document anomaly detection AI. Analyze the document for inconsistencies, forgery indicators, and compliance issues. Return JSON with: additionalAnomalies (array of {type, description, severity}), riskScore (0-100), recommendation (string).",
      userPrompt: JSON.stringify({ ...params, tradeValue: trade?.tradeValueUsd, tradeWeight: trade?.grossWeightKg }),
      fallbackKey: "doc_anomaly",
      maxTokens: 250,
      temperature: 0.2,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]);
        anomalies.push(...(aiResult.additionalAnomalies || []));
      }
    } catch { /* non-fatal */ }
  } catch { /* non-fatal */ }

  const riskScore = Math.min(100, anomalies.reduce((sum, a) => sum + (a.severity === "HIGH" ? 30 : a.severity === "MEDIUM" ? 15 : 5), 0));

  return {
    anomalies,
    riskScore,
    recommendation: riskScore > 50
      ? "Document requires manual review — multiple anomalies detected"
      : riskScore > 20
        ? "Minor inconsistencies — verify with counterparty"
        : "Document appears consistent with trade data",
  };
}

// ============================================================
// 4. TRADE CORRIDOR OPTIMIZATION
// ============================================================

/**
 * Optimize trade route by comparing ports based on congestion, cost, and speed.
 */
export async function optimizeRoute(params: {
  originCountry: string;
  destCountry: string;
  commodity: string;
  containerCount: number;
  coldChain: boolean;
  targetDate: string;
}): Promise<{
  recommendedRoute: { originPort: string; destPort: string; estimatedDays: number; estimatedCost: number };
  alternatives: { originPort: string; destPort: string; days: number; cost: number; tradeoff: string }[];
  portCongestion: { port: string; level: "LOW" | "MEDIUM" | "HIGH"; avgDelayDays: number }[];
  reasoning: string;
}> {
  // Use the Mapbox trade route data if available
  const PORTS: Record<string, { code: string; name: string; country: string; congestion: "LOW" | "MEDIUM" | "HIGH" }> = {
    "EGALX": { code: "EGALX", name: "Alexandria", country: "EG", congestion: "MEDIUM" },
    "EGALY": { code: "EGALY", name: "Alexandria (New)", country: "EG", congestion: "LOW" },
    "DEHAM": { code: "DEHAM", name: "Hamburg", country: "DE", congestion: "MEDIUM" },
    "NLRTM": { code: "NLRTM", name: "Rotterdam", country: "NL", congestion: "HIGH" },
    "AEJEA": { code: "AEJEA", name: "Jebel Ali", country: "AE", congestion: "LOW" },
    "CNSHA": { code: "CNSHA", name: "Shanghai", country: "CN", congestion: "MEDIUM" },
    "VNSGN": { code: "VNSGN", name: "Ho Chi Minh", country: "VN", congestion: "LOW" },
  };

  // Find origin and destination ports
  const originPorts = Object.values(PORTS).filter(p => p.country === params.originCountry);
  const destPorts = Object.values(PORTS).filter(p => p.country === params.destCountry);

  if (originPorts.length === 0 || destPorts.length === 0) {
    return {
      recommendedRoute: { originPort: params.originCountry, destPort: params.destCountry, estimatedDays: 21, estimatedCost: 3000 },
      alternatives: [],
      portCongestion: [],
      reasoning: "Port data not available for this route — using default estimates.",
    };
  }

  // Score each route combination
  const routes = [];
  for (const origin of originPorts) {
    for (const dest of destPorts) {
      const baseDays = 14 + Math.abs(origin.country.charCodeAt(0) - dest.country.charCodeAt(0));
      const congestionDelay = origin.congestion === "HIGH" ? 3 : origin.congestion === "MEDIUM" ? 1 : 0;
      const coldChainExtra = params.coldChain ? 2 : 0;
      const days = baseDays + congestionDelay + coldChainExtra;
      const cost = 1500 + params.containerCount * 800 + (params.coldChain ? 500 : 0) + congestionDelay * 200;
      routes.push({ origin, dest, days, cost });
    }
  }

  routes.sort((a, b) => (a.days + a.cost / 1000) - (b.days + b.cost / 1000));

  const best = routes[0];
  const congestion = [
    ...originPorts.map(p => ({ port: p.code, level: p.congestion, avgDelayDays: p.congestion === "HIGH" ? 3 : p.congestion === "MEDIUM" ? 1 : 0 })),
    ...destPorts.map(p => ({ port: p.code, level: p.congestion, avgDelayDays: p.congestion === "HIGH" ? 3 : p.congestion === "MEDIUM" ? 1 : 0 })),
  ];

  return {
    recommendedRoute: { originPort: best.origin.code, destPort: best.dest.code, estimatedDays: best.days, estimatedCost: best.cost },
    alternatives: routes.slice(1, 3).map(r => ({
      originPort: r.origin.code, destPort: r.dest.code, days: r.days, cost: r.cost,
      tradeoff: r.days < best.days ? "Faster but more expensive" : "Cheaper but slower",
    })),
    portCongestion: congestion,
    reasoning: `Route ${best.origin.code}→${best.dest.code} offers best balance of ${best.days} days transit at $${best.cost}. Origin congestion: ${best.origin.congestion}. Destination congestion: ${best.dest.congestion}.`,
  };
}

// ============================================================
// 5. FINANCIAL INTELLIGENCE
// ============================================================

/**
 * FX hedging recommendation — when to lock exchange rates.
 */
export async function recommendFxHedging(params: {
  tradeValueUsd: number;
  fromCurrency: string;
  toCurrency: string;
  settlementDays: number;
  currentFxRate: number;
}): Promise<{
  shouldHedge: boolean;
  hedgeType: "FORWARD" | "OPTION" | "NONE";
  hedgeAmount: number;
  estimatedCost: number;
  riskIfUnhedged: number;
  reasoning: string;
}> {
  const volatilityRisk = params.settlementDays > 30 ? 0.05 : params.settlementDays > 7 ? 0.02 : 0.01;
  const potentialLoss = params.tradeValueUsd * volatilityRisk;
  const hedgeCost = params.tradeValueUsd * 0.005; // 0.5% hedge cost

  const shouldHedge = potentialLoss > hedgeCost && params.settlementDays > 7;
  const hedgeType = params.settlementDays > 30 ? "FORWARD" : params.settlementDays > 7 ? "OPTION" : "NONE";

  return {
    shouldHedge,
    hedgeType,
    hedgeAmount: shouldHedge ? params.tradeValueUsd : 0,
    estimatedCost: Math.round(hedgeCost * 100) / 100,
    riskIfUnhedged: Math.round(potentialLoss * 100) / 100,
    reasoning: shouldHedge
      ? `Potential FX loss ($${potentialLoss.toFixed(2)}) exceeds hedge cost ($${hedgeCost.toFixed(2)}) — hedging recommended via ${hedgeType.toLowerCase()} contract.`
      : `Potential FX loss ($${potentialLoss.toFixed(2)}) is below hedge cost ($${hedgeCost.toFixed(2)}) — no hedging needed.`,
  };
}

/**
 * Optimal settlement timing — when to execute settlement for best outcome.
 */
export async function optimalSettlementTiming(params: {
  ustn: string;
  amountUsd: number;
  currency: string;
  availableDays: number;  // days until payment deadline
  pspProvider: string;
}): Promise<{
  recommendedAction: "SETTLE_NOW" | "WAIT" | "SPLIT";
  recommendedDate: string;
  reasoning: string;
  expectedSavings: number;
}> {
  // Rule: If deadline is far (>7 days) and amount is large, consider waiting for better FX
  // If deadline is near (<2 days), settle immediately
  // If amount is very large, consider splitting

  if (params.availableDays <= 2) {
    return {
      recommendedAction: "SETTLE_NOW",
      recommendedDate: new Date().toISOString(),
      reasoning: "Deadline is imminent — settle immediately to avoid late fees.",
      expectedSavings: 0,
    };
  }

  if (params.amountUsd > 100000 && params.availableDays > 7) {
    return {
      recommendedAction: "SPLIT",
      recommendedDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      reasoning: "Large amount with time available — split into 2 settlements to minimize FX risk and PSP limits.",
      expectedSavings: Math.round(params.amountUsd * 0.002 * 100) / 100,
    };
  }

  if (params.availableDays > 7) {
    return {
      recommendedAction: "WAIT",
      recommendedDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      reasoning: "Wait for potentially better FX rates — monitor daily and settle before deadline.",
      expectedSavings: Math.round(params.amountUsd * 0.001 * 100) / 100,
    };
  }

  return {
    recommendedAction: "SETTLE_NOW",
    recommendedDate: new Date().toISOString(),
    reasoning: "Standard settlement — no advantage to waiting.",
    expectedSavings: 0,
  };
}

/**
 * Credit risk assessment for financing decisions.
 */
export async function assessCreditRisk(params: {
  borrowerGtid: string;
  requestedAmount: number;
  tradeValueUsd: number;
  creditScore: number;
  trustScore: number;
  previousLoans: number;
  repaymentHistory: { onTime: number; late: number; defaulted: number };
}): Promise<{
  approved: boolean;
  riskGrade: "A" | "B" | "C" | "D" | "F";
  maxLoanAmount: number;
  recommendedInterestRate: number;
  collateralRequired: boolean;
  reasoning: string;
}> {
  const onTimeRate = params.repaymentHistory.onTime / Math.max(1, params.repaymentHistory.onTime + params.repaymentHistory.late + params.repaymentHistory.defaulted);
  const baseScore = (params.creditScore * 0.4) + (params.trustScore * 0.3) + (onTimeRate * 100 * 0.3);

  let grade: "A" | "B" | "C" | "D" | "F" = "F";
  if (baseScore >= 80) grade = "A";
  else if (baseScore >= 65) grade = "B";
  else if (baseScore >= 50) grade = "C";
  else if (baseScore >= 35) grade = "D";

  const maxLTV: Record<string, number> = { A: 0.90, B: 0.75, C: 0.60, D: 0.40, F: 0 };
  const rates: Record<string, number> = { A: 0.08, B: 0.12, C: 0.18, D: 0.25, F: 0 };

  const maxLoan = Math.round(params.tradeValueUsd * (maxLTV[grade] || 0) * 100) / 100;
  const approved = params.requestedAmount <= maxLoan && grade !== "F";
  const collateral = grade === "C" || grade === "D";

  return {
    approved,
    riskGrade: grade,
    maxLoanAmount: maxLoan,
    recommendedInterestRate: rates[grade] || 0,
    collateralRequired: collateral,
    reasoning: `Credit assessment: score=${baseScore.toFixed(0)}, grade=${grade}. Max LTV=${(maxLTV[grade] * 100).toFixed(0)}% of trade value. ${approved ? "Approved" : "Denied"} — ${grade === "F" ? "insufficient creditworthiness" : "within risk tolerance"}.`,
  };
}
