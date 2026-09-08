// @ts-nocheck
/**
 * SGTX v17 §20 — True Landed Cost Engine
 * ===========================================================================
 *
 * Aggregates ALL costs of importing a shipment — the true landed cost —
 * combining:
 *
 *   EXW value (goods cost from supplier)
 *   + Freight (origin-to-destination transport, all modes)
 *   + Insurance (marine / air / land cargo)
 *   + Customs duty (via tariff-engine.calculateDuty)
 *   + VAT / GST / Excise (via tax-engine.calculateTax)
 *   + Port handling charges (THC, terminal fees)
 *   + Customs broker fee
 *   + Other charges (inspection, fumigation, cold chain, certificates, etc.)
 *
 *   = True Landed Cost (per USTN)
 *
 * Different from `src/lib/sgtx/landed-cost` which is the legacy "trade cost
 * engine" focused on FOB + freight + insurance + customs. This engine
 * EXPLICITLY layers ALL ancillary costs (port handling, broker, certificates)
 * so the buyer + seller see the TRUE total cost before contracting.
 *
 * Sources a USTN (trade) from the DB:
 *   - Trade.commodity / commodityHs / originCountry / destCountry / tradeValueUsd / currency
 *   - Invoices (commercial invoice value)
 *   - LogisticsCosts / LogisticsService / ServiceQuotation (freight, insurance, THC, broker)
 *   - CustomsDeclaration (declared + assessed customs value, duties paid)
 *
 * All amounts returned in USD (with the source currency preserved for traceability).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { calculateCustomsValue, type ValuationAdjustment, type CustomsValueResult } from "@/lib/sgtx/engines/customs-valuation-engine";
import { calculateDuty } from "@/lib/sgtx/compliance/tariff-engine";
import { calculateTax } from "@/lib/sgtx/compliance/tax-engine";

// ── Types ────────────────────────────────────────────────────────────────

export interface LandedCostBreakdownLine {
  category: string; // EXW, FREIGHT, INSURANCE, DUTY, VAT, PORT_HANDLING, BROKER, OTHER
  payer: string; // buyer/seller GTID or "BOTH"
  description: string;
  amountUsd: number;
}

export interface TrueLandedCostResult {
  ustn: string;
  exwValue: number;
  freightUsd: number;
  insuranceUsd: number;
  dutyUsd: number;
  vatUsd: number;
  portHandlingUsd: number;
  brokerFeeUsd: number;
  otherChargesUsd: number;
  totalLandedCostUsd: number;
  breakdown: LandedCostBreakdownLine[];
  customsValueUsd: number;
  valuation: CustomsValueResult | null;
  currency: string;
  source: "live" | "fallback" | "simulated";
  warnings: string[];
  computedAt: string;
}

export interface LandedCostBreakdown {
  byCategory: Record<string, number>;
  byPayer: Record<string, number>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Number((Number(n) || 0).toFixed(2));
}

// Default assumed splits if no DB costs are available (simulated)
const DEFAULT_FREIGHT_RATE_PCT = 6;   // 6% of EXW value (e.g. air freight)
const DEFAULT_INSURANCE_RATE_PCT = 0.5; // 0.5% of EXW + freight
const DEFAULT_PORT_HANDLING_USD = 450; // typical THC per FCL
const DEFAULT_BROKER_FEE_USD = 250;    // typical broker fee per declaration
const DEFAULT_OTHER_USD = 150;          // fumigation + certificate fees + cold chain surcharge

// ── DB loaders ──────────────────────────────────────────────────────────

interface LoadedTrade {
  trade: any;
  invoices: any[];
  shipments: any[];
  quotations: any[];
}

async function loadTrade(ustn: string): Promise<LoadedTrade | null> {
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        shipments: true,
        invoices: true,
        quotations: true,
      },
    }).catch(() => null);
    if (!trade) return null;
    return {
      trade,
      invoices: trade.invoices ?? [],
      shipments: trade.shipments ?? [],
      quotations: trade.quotations ?? [],
    };
  } catch (err: any) {
    logger.warn("[true-landed-cost-engine] loadTrade failed", { ustn, error: err?.message });
    return null;
  }
}

// Extract amounts from quotations (ServiceQuotation) by service type
function extractQuotationAmounts(quotations: any[], buyerGtid?: string, sellerGtid?: string): {
  freight: number; insurance: number; portHandling: number; broker: number; other: number;
  perLine: LandedCostBreakdownLine[];
} {
  let freight = 0, insurance = 0, portHandling = 0, broker = 0, other = 0;
  const perLine: LandedCostBreakdownLine[] = [];
  if (!Array.isArray(quotations)) return { freight, insurance, portHandling, broker, other, perLine };

  for (const q of quotations) {
    const amountUsd = Number(q.feeUsd ?? q.amountUsd ?? q.totalAmountUsd ?? q.amount ?? 0) || 0;
    if (amountUsd <= 0) continue;
    const serviceType = String(q.serviceType ?? q.service ?? "").toUpperCase().trim();
    const payer = String(q.providerGtid ?? q.proposerGtid ?? "BOTH");

    let category = "OTHER";
    let description = q.serviceType ?? q.service ?? "Logistics service";
    if (serviceType.includes("FREIGHT") || serviceType.includes("OCEAN") || serviceType.includes("TRUCKING") || serviceType.includes("AIR_FREIGHT") || serviceType === "AIR") {
      category = "FREIGHT"; freight += amountUsd;
    } else if (serviceType.includes("INSURANCE")) {
      category = "INSURANCE"; insurance += amountUsd;
    } else if (serviceType.includes("THC") || serviceType.includes("TERMINAL") || serviceType.includes("PORT") || serviceType.includes("DESTINATION_HANDLING") || serviceType.includes("HANDLING")) {
      category = "PORT_HANDLING"; portHandling += amountUsd;
    } else if (serviceType.includes("BROKERAGE") || serviceType.includes("CUSTOMS_BROKER") || serviceType.includes("BROKER")) {
      category = "BROKER"; broker += amountUsd;
    } else {
      category = "OTHER"; other += amountUsd;
    }
    perLine.push({ category, payer, description: String(description), amountUsd: round2(amountUsd) });
  }
  return { freight: round2(freight), insurance: round2(insurance), portHandling: round2(portHandling), broker: round2(broker), other: round2(other), perLine };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Calculate the True Landed Cost for a USTN. Chains:
 *   1. EXW value (from commercial invoice) + freight + insurance → CIF/CFR
 *   2. Customs value via customs-valuation-engine (Method 1 default)
 *   3. Customs duty via tariff-engine.calculateDuty (MFN + FTA + AD)
 *   4. VAT/GST via tax-engine.calculateTax (destination country rate)
 *   5. Port handling (THC) + broker fee + other charges from quotations
 *   6. Total Landed Cost = sum of all
 */
export async function calculateTrueLandedCost(ustn: string): Promise<TrueLandedCostResult> {
  const computedAt = new Date().toISOString();
  const warnings: string[] = [];

  if (!ustn) {
    return _fallback(ustn, "USTN is required", warnings, computedAt);
  }

  const loaded = await loadTrade(ustn);
  if (!loaded || !loaded.trade) {
    return _fallback(ustn, `No trade found for USTN ${ustn}`, warnings, computedAt);
  }

  const t = loaded.trade;
  const hsCode = String(t.commodityHs ?? "").trim();
  const originCountry = String(t.originCountry ?? "").toUpperCase().trim();
  const destCountry = String(t.destCountry ?? "").toUpperCase().trim();
  const buyerGtid = String(t.buyerGtid ?? "");
  const sellerGtid = String(t.sellerGtid ?? "");

  // EXW value — prefer commercial invoice amount, else Trade.tradeValueUsd
  let exwValue = Number(t.tradeValueUsd) || 0;
  const commInvoice = loaded.invoices.find((i) => String(i.type ?? "").toUpperCase().includes("COMMERCIAL"));
  if (commInvoice && Number(commInvoice.amountUsd) > 0) {
    exwValue = Number(commInvoice.amountUsd) || exwValue;
  }

  if (exwValue <= 0) {
    warnings.push("EXW value not found in trade or commercial invoice; defaulting to 0.");
  }

  // Quotations for freight/insurance/handling/broker/other
  const quoteAmounts = extractQuotationAmounts(loaded.quotations, buyerGtid, sellerGtid);

  let freightUsd = quoteAmounts.freight;
  let insuranceUsd = quoteAmounts.insurance;
  let portHandlingUsd = quoteAmounts.portHandling;
  let brokerFeeUsd = quoteAmounts.broker;
  let otherChargesUsd = quoteAmounts.other;

  // If no quotation amounts, use simulated defaults
  let usedSimulated = false;
  if (freightUsd <= 0) { freightUsd = round2(exwValue * DEFAULT_FREIGHT_RATE_PCT / 100); usedSimulated = true; }
  if (insuranceUsd <= 0) { insuranceUsd = round2((exwValue + freightUsd) * DEFAULT_INSURANCE_RATE_PCT / 100); usedSimulated = true; }
  if (portHandlingUsd <= 0) { portHandlingUsd = DEFAULT_PORT_HANDLING_USD; usedSimulated = true; }
  if (brokerFeeUsd <= 0) { brokerFeeUsd = DEFAULT_BROKER_FEE_USD; usedSimulated = true; }
  if (otherChargesUsd <= 0) { otherChargesUsd = DEFAULT_OTHER_USD; usedSimulated = true; }
  if (usedSimulated) warnings.push("Some cost lines defaulted to simulated values — supply ServiceQuotation rows for accuracy.");

  // Customs value (CIF for method 1) — transaction value + freight + insurance
  let valuation: CustomsValueResult | null = null;
  let customsValueUsd = round2(exwValue + freightUsd + insuranceUsd);
  if (hsCode && originCountry && destCountry) {
    try {
      valuation = calculateCustomsValue(exwValue, [
        { description: "Transport to port of entry (freight)", amount: freightUsd, direction: "ADD" },
        { description: "Insurance (marine/air cargo)", amount: insuranceUsd, direction: "ADD" },
      ], undefined, undefined, { currency: "USD" });
      customsValueUsd = valuation.customsValue;
    } catch (err: any) {
      warnings.push(`Customs valuation failed: ${err?.message ?? "unknown"}. Falling back to CIF proxy.`);
    }
  } else {
    warnings.push("HS code / origin / destination missing — skipping customs-valuation-engine (using CIF proxy).");
  }

  // Customs duty + VAT via tariff-engine + tax-engine
  let dutyUsd = 0;
  let vatUsd = 0;

  if (hsCode && originCountry && destCountry && customsValueUsd > 0) {
    try {
      const duty = await calculateDuty(hsCode, originCountry, destCountry, customsValueUsd);
      dutyUsd = round2(duty.totalDuty);
      vatUsd = round2(duty.totalTax);
    } catch (err: any) {
      warnings.push(`Tariff/Tax calculation failed: ${err?.message ?? "unknown"}. Duty + VAT defaulted to 0.`);
    }
  } else {
    warnings.push("HS code / origin / destination / customs value missing — skipping tariff+tax calculation.");
  }

  // Total landed cost
  const total = round2(
    exwValue + freightUsd + insuranceUsd + dutyUsd + vatUsd + portHandlingUsd + brokerFeeUsd + otherChargesUsd,
  );

  // Build breakdown
  const breakdown: LandedCostBreakdownLine[] = [
    { category: "EXW", payer: buyerGtid || "BUYER", description: `EXW value — ${t.commodity || "commodity"}`, amountUsd: exwValue },
    { category: "FREIGHT", payer: "BOTH", description: "Origin-to-destination transport", amountUsd: freightUsd },
    { category: "INSURANCE", payer: "BOTH", description: "Marine/air cargo insurance", amountUsd: insuranceUsd },
    { category: "DUTY", payer: buyerGtid || "BUYER", description: "Customs duty (MFN + preferential + AD)", amountUsd: dutyUsd },
    { category: "VAT", payer: buyerGtid || "BUYER", description: "VAT/GST/Excise", amountUsd: vatUsd },
    { category: "PORT_HANDLING", payer: "BOTH", description: "THC + terminal handling charges", amountUsd: portHandlingUsd },
    { category: "BROKER", payer: buyerGtid || "BUYER", description: "Customs broker fee", amountUsd: brokerFeeUsd },
    { category: "OTHER", payer: "BOTH", description: "Inspection, fumigation, certificates, cold chain", amountUsd: otherChargesUsd },
  ];

  return {
    ustn,
    exwValue: round2(exwValue),
    freightUsd,
    insuranceUsd,
    dutyUsd,
    vatUsd,
    portHandlingUsd,
    brokerFeeUsd,
    otherChargesUsd,
    totalLandedCostUsd: total,
    breakdown,
    customsValueUsd,
    valuation,
    currency: String(t.currency ?? "USD"),
    source: warnings.length > 0 ? (usedSimulated ? "simulated" : "live") : "live",
    warnings,
    computedAt,
  };
}

/**
 * Return the breakdown aggregated by category + by payer — useful for cost
 * allocation between buyer + seller.
 */
export async function getLandedCostBreakdown(ustn: string): Promise<{ byCategory: Record<string, number>; byPayer: Record<string, number> }> {
  const result = await calculateTrueLandedCost(ustn);
  const byCategory: Record<string, number> = {};
  const byPayer: Record<string, number> = {};
  for (const line of result.breakdown) {
    byCategory[line.category] = round2((byCategory[line.category] ?? 0) + line.amountUsd);
    byPayer[line.payer] = round2((byPayer[line.payer] ?? 0) + line.amountUsd);
  }
  return { byCategory, byPayer };
}

// ── Fallback (no USTN or no trade) ───────────────────────────────────────

function _fallback(ustn: string, msg: string, warnings: string[], computedAt: string): TrueLandedCostResult {
  warnings.push(msg);
  return {
    ustn: ustn || "",
    exwValue: 0, freightUsd: 0, insuranceUsd: 0, dutyUsd: 0, vatUsd: 0,
    portHandlingUsd: 0, brokerFeeUsd: 0, otherChargesUsd: 0,
    totalLandedCostUsd: 0, breakdown: [], customsValueUsd: 0,
    valuation: null, currency: "USD", source: "fallback", warnings, computedAt,
  };
}
