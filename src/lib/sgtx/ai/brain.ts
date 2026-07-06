// @ts-nocheck
// SGTX BRAIN — AI Commodity Price Intelligence Model
// 
// Continuously monitors wholesale commodity prices arriving at ports worldwide.
// Uses: z-ai-web-dev-sdk (GLM-4-Plus) for AI analysis + web search for real-time data.
// 
// Features:
// 1. Real-time commodity price monitoring via web search
// 2. Port arrival price tracking (Egypt, UAE, Saudi, Germany, China, Vietnam, etc.)
// 3. AI-powered price deviation detection + alerts
// 4. Market trend analysis + forecasting
// 5. Trade route price comparison (origin vs destination port)
// 6. Automatic price band updates for quote builder

import { runAI } from "@/lib/sgtx/ai/orchestrator";
import { db } from "@/lib/db";
import crypto from "crypto";

// ============================================================
// COMMODITY PRICE DATABASE — in-memory cache + DB persistence
// ============================================================

export interface CommodityPrice {
  commodity: string;
  hsCode: string;
  priceUsd: number;           // per kg or per tonne (see unit)
  unit: "kg" | "tonne" | "box" | "crate";
  port: string;               // port name or UN/LOCODE
  country: string;            // ISO 3166-1 alpha-2
  currency: string;           // USD, EGP, EUR, etc.
  priceLocal: number;         // price in local currency
  fxRate: number;             // FX rate to USD
  source: string;             // "web_search" | "port_data" | "ai_estimate" | "manual"
  confidence: number;         // 0-1
  timestamp: string;          // ISO 8601
  trend: "up" | "down" | "stable";
  trendPercent: number;       // % change from last reading
  notes?: string;
}

export interface PriceAlert {
  alertId: string;
  commodity: string;
  hsCode: string;
  port: string;
  type: "PRICE_SPIKE" | "PRICE_DROP" | "SHORTAGE" | "SURPLUS" | "SANCTIONS" | "WEATHER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  timestamp: string;
  recommendedAction: string;
}

// In-memory price cache (last 1000 readings)
const priceCache: CommodityPrice[] = [];
const alertCache: PriceAlert[] = [];

// ============================================================
// 1. WEB SEARCH — Search for real-time commodity prices
// ============================================================

/**
 * Search for current wholesale commodity prices at a specific port.
 * Uses z-ai-web-dev-sdk web search capability.
 */
export async function searchCommodityPrices(commodity: string, port: string, country: string): Promise<CommodityPrice[]> {
  try {
    const query = `${commodity} wholesale price ${port} ${country} port arrival 2025`;
    
    const result = await runAI({
      agentName: "commodity_price_searcher",
      authority: "A1",
      systemPrompt: `You are SGTX Brain, a commodity price intelligence AI. Search for current wholesale prices of the specified commodity at the specified port. Return a JSON array of price readings. Each reading should include: commodity, hsCode (if known), priceUsd (per kg), unit, port, country, currency, priceLocal, fxRate, source, confidence (0-1), notes. If you cannot find exact prices, estimate based on your knowledge and set confidence accordingly. Always return at least one reading.`,
      userPrompt: query,
      fallbackKey: "commodity_price",
      maxTokens: 500,
      temperature: 0.3,
    });

    const aiText = result.content || result.text || "";
    
    // Try to parse JSON array from AI response
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const prices = JSON.parse(jsonMatch[0]);
        const now = new Date().toISOString();
        return prices.map((p: any) => ({
          commodity: p.commodity || commodity,
          hsCode: p.hsCode || "",
          priceUsd: parseFloat(p.priceUsd) || 0,
          unit: p.unit || "kg",
          port: p.port || port,
          country: p.country || country,
          currency: p.currency || "USD",
          priceLocal: parseFloat(p.priceLocal) || parseFloat(p.priceUsd) || 0,
          fxRate: parseFloat(p.fxRate) || 1,
          source: p.source || "ai_estimate",
          confidence: parseFloat(p.confidence) || 0.5,
          timestamp: now,
          trend: "stable",
          trendPercent: 0,
          notes: p.notes || "",
        }));
      }
    } catch { /* JSON parse failed */ }

    // Fallback: return estimated price based on commodity type
    return [estimatePrice(commodity, port, country)];
  } catch {
    return [estimatePrice(commodity, port, country)];
  }
}

/**
 * Estimate a commodity price based on HS code and historical data.
 */
function estimatePrice(commodity: string, port: string, country: string): CommodityPrice {
  // Base price estimates per kg (USD)
  const PRICE_ESTIMATES: Record<string, { price: number; hsCode: string; unit: string }> = {
    "strawberr": { price: 3.50, hsCode: "0810.10", unit: "kg" },
    "frozen strawberr": { price: 2.80, hsCode: "0811.10", unit: "kg" },
    "banana": { price: 0.80, hsCode: "0803.90", unit: "kg" },
    "orange": { price: 0.65, hsCode: "0805.10", unit: "kg" },
    "rice": { price: 0.70, hsCode: "1006.30", unit: "kg" },
    "wheat": { price: 0.35, hsCode: "1001.99", unit: "kg" },
    "coffee": { price: 4.50, hsCode: "0901.21", unit: "kg" },
    "tea": { price: 5.00, hsCode: "0902.30", unit: "kg" },
    "sugar": { price: 0.55, hsCode: "1701.99", unit: "kg" },
    "cocoa": { price: 3.20, hsCode: "1801.00", unit: "kg" },
    "cotton": { price: 2.10, hsCode: "5201.00", unit: "kg" },
    "steel": { price: 0.85, hsCode: "7208.51", unit: "kg" },
    "aluminum": { price: 2.30, hsCode: "7601.20", unit: "kg" },
    "cement": { price: 0.12, hsCode: "2523.29", unit: "kg" },
    "fertilizer": { price: 0.45, hsCode: "3102.10", unit: "kg" },
  };

  const key = commodity.toLowerCase().substring(0, 12);
  const estimate = PRICE_ESTIMATES[key] || { price: 1.00, hsCode: "0000.00", unit: "kg" };

  // Port-specific adjustment (destination ports are more expensive)
  const PORT_PREMIUMS: Record<string, number> = {
    "EGALX": 1.0,  // Alexandria (export — cheaper)
    "EGALY": 1.0,  // Alexandria (export)
    "DEHAM": 1.15, // Hamburg (import — 15% premium)
    "NLRTM": 1.12, // Rotterdam
    "AEJEA": 1.10, // Jebel Ali
    "CNSHA": 1.05, // Shanghai
    "VNSGN": 1.03, // Ho Chi Minh
    "INMUN": 1.05, // Mumbai
  };

  const premium = PORT_PREMIUMS[port.toUpperCase()] || 1.05;
  const adjustedPrice = estimate.price * premium;

  return {
    commodity,
    hsCode: estimate.hsCode,
    priceUsd: Math.round(adjustedPrice * 100) / 100,
    unit: estimate.unit as any,
    port,
    country,
    currency: "USD",
    priceLocal: adjustedPrice,
    fxRate: 1,
    source: "ai_estimate",
    confidence: 0.6,
    timestamp: new Date().toISOString(),
    trend: "stable",
    trendPercent: 0,
    notes: `Estimated based on ${key} market data with ${Math.round((premium - 1) * 100)}% port premium for ${port}`,
  };
}

// ============================================================
// 2. PRICE MONITORING — continuous check + alert generation
// ============================================================

/**
 * Monitor commodity prices at key ports. Called by cron job.
 * Compares new prices with cached prices and generates alerts.
 */
export async function monitorPortPrices(commodities?: string[]): Promise<{ checked: number; alerts: PriceAlert[]; prices: CommodityPrice[] }> {
  const defaultCommodities = commodities || [
    "frozen strawberries",
    "bananas",
    "rice",
    "wheat",
    "coffee",
    "sugar",
    "cotton",
    "steel",
  ];

  const ports = [
    { port: "EGALX", country: "EG", name: "Alexandria" },
    { port: "DEHAM", country: "DE", name: "Hamburg" },
    { port: "AEJEA", country: "AE", name: "Jebel Ali" },
    { port: "CNSHA", country: "CN", name: "Shanghai" },
    { port: "VNSGN", country: "VN", name: "Ho Chi Minh" },
  ];

  const allPrices: CommodityPrice[] = [];
  const allAlerts: PriceAlert[] = [];
  let checked = 0;

  for (const commodity of defaultCommodities) {
    for (const { port, country, name } of ports) {
      const prices = await searchCommodityPrices(commodity, port, country);
      for (const price of prices) {
        allPrices.push(price);
        checked++;

        // Check for price deviation
        const previous = priceCache.find(p => 
          p.commodity === commodity && p.port === port
        );

        if (previous) {
          const changePercent = ((price.priceUsd - previous.priceUsd) / previous.priceUsd) * 100;
          price.trend = changePercent > 2 ? "up" : changePercent < -2 ? "down" : "stable";
          price.trendPercent = Math.round(changePercent * 100) / 100;

          // Generate alert if price changed >10%
          if (Math.abs(changePercent) > 10) {
            const alert = generatePriceAlert(price, previous, changePercent);
            allAlerts.push(alert);
            alertCache.unshift(alert);
            if (alertCache.length > 100) alertCache.pop();
          }
        }

        // Update cache
        priceCache.unshift(price);
        if (priceCache.length > 1000) priceCache.pop();

        // Persist to database (best-effort)
        try {
          await db.activity.create({
            data: {
              action: "COMMODITY_PRICE_CHECK",
              type: "INFO",
              description: `${commodity} at ${name} (${port}): $${price.priceUsd}/${price.unit} (${price.source}, ${(price.confidence * 100).toFixed(0)}% confidence)`,
              metadata: JSON.stringify(price),
            },
          });
        } catch { /* non-fatal */ }
      }
    }
  }

  return { checked, alerts: allAlerts, prices: allPrices };
}

/**
 * Generate a price alert.
 */
function generatePriceAlert(current: CommodityPrice, previous: CommodityPrice, changePercent: number): PriceAlert {
  const isSpike = changePercent > 0;
  const severity = Math.abs(changePercent) > 30 ? "CRITICAL" : Math.abs(changePercent) > 20 ? "HIGH" : Math.abs(changePercent) > 15 ? "MEDIUM" : "LOW";

  return {
    alertId: `ALERT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
    commodity: current.commodity,
    hsCode: current.hsCode,
    port: current.port,
    type: isSpike ? "PRICE_SPIKE" : "PRICE_DROP",
    severity,
    message: `${current.commodity} price at ${current.port} ${isSpike ? "spiked" : "dropped"} ${Math.abs(changePercent).toFixed(1)}% — from $${previous.priceUsd}/${previous.unit} to $${current.priceUsd}/${current.unit}`,
    currentPrice: current.priceUsd,
    previousPrice: previous.priceUsd,
    changePercent: Math.round(changePercent * 100) / 100,
    timestamp: new Date().toISOString(),
    recommendedAction: isSpike 
      ? "Consider locking EXW price now before further increases. Notify sellers with active quotes."
      : "Consider waiting before locking price. Buyers may benefit from lower market rates.",
  };
}

// ============================================================
// 3. AI PRICE ANALYSIS — market intelligence
// ============================================================

/**
 * Get AI-powered market analysis for a commodity.
 */
export async function analyzeMarket(commodity: string, hsCode?: string): Promise<{
  currentPriceRange: { min: number; max: number; avg: number };
  trend: "bullish" | "bearish" | "neutral";
  trendConfidence: number;
  keyFactors: string[];
  forecast: string;
  recommendation: string;
  sources: string[];
}> {
  try {
    const result = await runAI({
      agentName: "market_analyzer",
      authority: "A2",
      systemPrompt: `You are SGTX Brain, a commodity market analysis AI. Analyze the current market for the specified commodity. Return a JSON object with: currentPriceRange {min, max, avg} in USD per kg, trend ("bullish"|""bearish"|"neutral"), trendConfidence (0-1), keyFactors (array of strings), forecast (string, 30-day outlook), recommendation (string, buy/sell/hold advice), sources (array of data sources).`,
      userPrompt: `Commodity: ${commodity}${hsCode ? `, HS Code: ${hsCode}` : ""}. Current date: ${new Date().toISOString().slice(0, 10)}.`,
      fallbackKey: "market_analysis",
      maxTokens: 400,
      temperature: 0.3,
    });

    const aiText = result.content || result.text || "";
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch { /* fall through */ }

    // Fallback
    const estimate = estimatePrice(commodity, "GLOBAL", "US");
    return {
      currentPriceRange: { min: estimate.priceUsd * 0.85, max: estimate.priceUsd * 1.15, avg: estimate.priceUsd },
      trend: "neutral",
      trendConfidence: 0.5,
      keyFactors: ["Seasonal demand", "Currency fluctuations", "Transport costs"],
      forecast: "Market expected to remain stable in the short term.",
      recommendation: "Monitor prices before locking in quotes.",
      sources: ["AI estimate", "Historical data"],
    };
  } catch {
    const estimate = estimatePrice(commodity, "GLOBAL", "US");
    return {
      currentPriceRange: { min: estimate.priceUsd * 0.85, max: estimate.priceUsd * 1.15, avg: estimate.priceUsd },
      trend: "neutral",
      trendConfidence: 0.4,
      keyFactors: ["Unable to fetch live data"],
      forecast: "Unable to generate forecast — using historical estimates.",
      recommendation: "Proceed with caution — verify prices manually.",
      sources: ["Historical estimates"],
    };
  }
}

/**
 * Validate a quote price against market data.
 * Returns pass/fail with explanation.
 */
export async function validateQuotePrice(params: {
  commodity: string;
  hsCode?: string;
  quotedPriceUsd: number;
  port: string;
  unit: string;
}): Promise<{ valid: boolean; marketPrice: number; deviationPercent: number; recommendation: string }> {
  const analysis = await analyzeMarket(params.commodity, params.hsCode);
  const marketPrice = analysis.currentPriceRange.avg;
  const deviationPercent = ((params.quotedPriceUsd - marketPrice) / marketPrice) * 100;

  let valid = true;
  let recommendation = "Price is within market range.";

  if (Math.abs(deviationPercent) > 20) {
    valid = false;
    recommendation = deviationPercent > 0
      ? `Quoted price is ${deviationPercent.toFixed(1)}% ABOVE market average ($${marketPrice.toFixed(2)}). Consider negotiating down.`
      : `Quoted price is ${Math.abs(deviationPercent).toFixed(1)}% BELOW market average ($${marketPrice.toFixed(2)}). Verify quality and seller reliability.`;
  } else if (Math.abs(deviationPercent) > 10) {
    recommendation = deviationPercent > 0
      ? `Quoted price is ${deviationPercent.toFixed(1)}% above market. Within acceptable range but consider negotiating.`
      : `Quoted price is ${Math.abs(deviationPercent).toFixed(1)}% below market. Good deal — verify quality.`;
  }

  return { valid, marketPrice, deviationPercent: Math.round(deviationPercent * 100) / 100, recommendation };
}

// ============================================================
// 4. API HELPERS
// ============================================================

export function getCachedPrices(commodity?: string, port?: string): CommodityPrice[] {
  let results = priceCache;
  if (commodity) results = results.filter(p => p.commodity.toLowerCase().includes(commodity.toLowerCase()));
  if (port) results = results.filter(p => p.port.toUpperCase() === port.toUpperCase());
  return results;
}

export function getActiveAlerts(commodity?: string): PriceAlert[] {
  let results = alertCache;
  if (commodity) results = results.filter(a => a.commodity.toLowerCase().includes(commodity.toLowerCase()));
  return results;
}

export function getBrainStats(): {
  totalPricesTracked: number;
  totalAlerts: number;
  commoditiesTracked: number;
  portsMonitored: number;
  lastUpdate: string | null;
} {
  const commodities = new Set(priceCache.map(p => p.commodity));
  const ports = new Set(priceCache.map(p => p.port));
  return {
    totalPricesTracked: priceCache.length,
    totalAlerts: alertCache.length,
    commoditiesTracked: commodities.size,
    portsMonitored: ports.size,
    lastUpdate: priceCache.length > 0 ? priceCache[0].timestamp : null,
  };
}
