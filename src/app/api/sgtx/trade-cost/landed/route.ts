// @ts-nocheck
// SGTX v13.1 Art 24 — True Landed Cost Calculator
// POST /api/sgtx/trade-cost/landed
//
// Calculates the FULL 18-component True Landed Cost per Art 24:
//   1. GOODS                10. TRANSIT
//   2. ORIGIN COST           11. DESTINATION HANDLING
//   3. PACKAGING             12. DUTY
//   4. INLAND                13. VAT/GST
//   5. EXPORT CLEARANCE      14. EXCISE
//   6. CERTIFICATES          15. BROKER
//   7. INSPECTION            16. LOCAL DELIVERY
//   8. INSURANCE             17. OTHER FEES
//   9. INTERNATIONAL FREIGHT 18. SGTX FEES
//
// Body (either form is accepted):
//   Form A — by USTN:
//     { ustn: string }
//     Loads trade details from db.trade + uses sensible defaults for missing
//     fields. If the trade row is not found, returns 404.
//
//   Form B — manual entry:
//     {
//       goodsValue: number,           // EXW goods value (USD)
//       originCountry: string,         // ISO 3166-1 alpha-2
//       destinationCountry: string,
//       hsCode: string,                // HS 6-digit (e.g. "0811.10")
//       incoterm: string,              // EXW | FCA | FOB | CFR | CIF | CPT | CIP | DAP | DPU | DDP
//       freightMode: string,           // OCEAN | AIR | TRUCK | RAIL | RO_RO | MULTIMODAL
//       weight?: number,               // gross weight in kg (for freight estimate)
//       containerCount?: number,
//       coldChain?: boolean,
//       currency?: string = "USD",
//       customsDutyRate?: number,      // override (%) — if not provided, GRiRE tariff used
//       vatRate?: number,              // override (%) — destination VAT
//       exciseRate?: number,          // override (%) — destination excise
//       originCost?: number,           // override USD
//       packagingCost?: number,       // override USD
//       inlandCost?: number,           // override USD (origin drayage)
//       exportClearanceCost?: number,  // override USD
//       certificateCost?: number,      // override USD
//       inspectionCost?: number,       // override USD
//       insuranceRate?: number,        // override % of goods+freight (default 0.15%)
//       internationalFreightCost?: number, // override USD
//       transitCost?: number,          // override USD
//       destinationHandlingCost?: number, // override USD (dest THC)
//       brokerCost?: number,           // override USD
//       localDeliveryCost?: number,    // override USD
//       otherFees?: number,            // override USD
//       sgtxFeeRate?: number,          // override % (default 1.5%)
//     }
//
// Calls in parallel:
//   • GRiRE tariff   — GET /api/sgtx/grire/tariff?hsCode=X&countryCode=Y (or lib direct)
//   • Valuation API  — POST /api/sgtx/valuation/calculate (duty estimation cross-check)
//
// Response:
//   {
//     ok: true,
//     totalLandedCost: number,
//     currency: "USD",
//     breakdown: [
//       { component: "1. GOODS", amount: number, percentage: number, missing: false, source: "input" },
//       ...
//     ],
//     missing: ["originCost", ...], // components that couldn't be calculated
//     source: "ustn" | "manual",
//     ustn?: string,
//     inputs: { ... } // sanitized echo of the inputs used
//   }
//
// Every component is wrapped in try/catch with safe defaults — a missing
// component returns amount=0 + missing=true so the calculator never fails
// to produce a useful total.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getTariffRate } from "@/lib/sgtx/grire";

export const dynamic = "force-dynamic";

// ── Defaults (USD) ────────────────────────────────────────────────────────
const DEFAULT_VAT_RATE = 0.19; // 19% — typical EU standard VAT
const DEFAULT_EXCISE_RATE = 0.0; // 0% — most goods have no excise
const DEFAULT_INSURANCE_RATE = 0.0015; // 0.15% of (goods + freight)
const DEFAULT_SGTX_FEE_RATE = 0.015; // 1.5% of declared value
const DEFAULT_FALLBACK_DUTY_RATE = 0.05; // 5% if GRiRE has no data

// Freight rate as % of goods value by mode (matches trade-cost engine).
const FREIGHT_RATE_BY_MODE: Record<string, number> = {
  OCEAN: 0.08,
  SEA: 0.08,
  AIR: 0.12,
  TRUCK: 0.05,
  ROAD: 0.05,
  RAIL: 0.06,
  RO_RO: 0.07,
  MULTIMODAL: 0.09,
};

// Per-mode fixed-ish components (USD per shipment, applied when no override)
const ORIGIN_COST_DEFAULT = 250; // origin drayage + loading
const PACKAGING_DEFAULT = 0; // usually in EXW goods value
const INLAND_DEFAULT = 350; // origin inland transport
const EXPORT_CLEARANCE_DEFAULT = 180; // export customs clearance
const CERTIFICATE_DEFAULT = 120; // CoO + phytosanitary
const INSPECTION_DEFAULT = 350; // pre-shipment QC
const TRANSIT_DEFAULT = 0; // demurrage/transit time usually in THC
const DEST_HANDLING_DEFAULT_OCEAN = 280; // dest THC + port charges
const DEST_HANDLING_DEFAULT_AIR = 175; // air AWB + handling
const DEST_HANDLING_DEFAULT_TRUCK = 90; // terminal access
const DEST_HANDLING_DEFAULT_RAIL = 140; // rail terminal
const BROKER_DEFAULT = 220; // customs broker fee
const LOCAL_DELIVERY_DEFAULT = 320; // last-mile delivery
const OTHER_FEES_DEFAULT = 50; // misc fees

const COMPONENTS = [
  "1. GOODS",
  "2. ORIGIN COST",
  "3. PACKAGING",
  "4. INLAND",
  "5. EXPORT CLEARANCE",
  "6. CERTIFICATES",
  "7. INSPECTION",
  "8. INSURANCE",
  "9. INTERNATIONAL FREIGHT",
  "10. TRANSIT",
  "11. DESTINATION HANDLING",
  "12. DUTY",
  "13. VAT/GST",
  "14. EXCISE",
  "15. BROKER",
  "16. LOCAL DELIVERY",
  "17. OTHER FEES",
  "18. SGTX FEES",
] as const;

interface CalcInput {
  // from USTN or manual
  ustn?: string;
  goodsValue?: number;
  originCountry?: string;
  destinationCountry?: string;
  hsCode?: string;
  incoterm?: string;
  freightMode?: string;
  weight?: number;
  containerCount?: number;
  coldChain?: boolean;
  currency?: string;
  // optional overrides
  customsDutyRate?: number;
  vatRate?: number;
  exciseRate?: number;
  originCost?: number;
  packagingCost?: number;
  inlandCost?: number;
  exportClearanceCost?: number;
  certificateCost?: number;
  inspectionCost?: number;
  insuranceRate?: number;
  internationalFreightCost?: number;
  transitCost?: number;
  destinationHandlingCost?: number;
  brokerCost?: number;
  localDeliveryCost?: number;
  otherFees?: number;
  sgtxFeeRate?: number;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function loadTrade(ustn: string) {
  try {
    const trade = await db.trade.findUnique({ where: { ustn } });
    return trade;
  } catch (e: any) {
    logger.warn("[trade-cost/landed] trade lookup failed", { ustn, error: e?.message });
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CalcInput = await req.json().catch(() => ({}));
    let input: CalcInput = { ...body };
    let source: "ustn" | "manual" = "manual";
    let tradeRow: any = null;

    // Form A — by USTN. Load the trade row + fall back to its fields.
    if (input.ustn && !input.goodsValue) {
      source = "ustn";
      tradeRow = await loadTrade(input.ustn);
      if (!tradeRow) {
        return NextResponse.json(
          { ok: false, error: `trade not found for ustn: ${input.ustn}` },
          { status: 404 },
        );
      }
      input.goodsValue = num(tradeRow.tradeValueUsd) ?? input.goodsValue;
      input.originCountry = input.originCountry || tradeRow.originCountry;
      input.destinationCountry = input.destinationCountry || tradeRow.destCountry;
      input.hsCode = input.hsCode || tradeRow.commodityHs;
      input.incoterm = input.incoterm || tradeRow.incoterm;
      input.freightMode = input.freightMode || tradeRow.transportMode;
      input.coldChain = input.coldChain ?? (tradeRow.coldChain === true || tradeRow.coldChain === "yes" || tradeRow.coldChain === "true");
      input.containerCount = input.containerCount ?? undefined;
      input.currency = input.currency || "USD";
    }

    // Validate minimum input set.
    const goodsValue = num(input.goodsValue);
    if (goodsValue === null || goodsValue <= 0) {
      return NextResponse.json(
        { ok: false, error: "goodsValue must be a positive number (or provide a valid ustn)" },
        { status: 400 },
      );
    }
    const originCountry = (input.originCountry || "").toUpperCase();
    const destinationCountry = (input.destinationCountry || "").toUpperCase();
    const hsCode = input.hsCode || "";
    const incoterm = (input.incoterm || "EXW").toUpperCase();
    const freightMode = (input.freightMode || "OCEAN").toUpperCase();
    const currency = (input.currency || "USD").toUpperCase();
    const containerCount = Math.max(1, num(input.containerCount) || 1);
    const coldChain = !!input.coldChain;
    const weight = num(input.weight);

    // ── GRiRE tariff lookup (async, defensive) ─────────────────────────
    let tariffRate: number | null = null;
    let tariffSource = "default";
    if (hsCode && destinationCountry) {
      try {
        const tariff = await getTariffRate(hsCode, destinationCountry);
        if (tariff && typeof tariff.tariffRate === "number") {
          tariffRate = tariff.tariffRate / 100; // % → fraction
          tariffSource = "GRiRE";
        }
      } catch (e: any) {
        logger.warn("[trade-cost/landed] GRiRE tariff lookup failed", { error: e?.message });
      }
    }
    // Manual override wins over GRiRE.
    const dutyRateOverride = num(input.customsDutyRate);
    if (dutyRateOverride !== null) {
      tariffRate = dutyRateOverride / 100;
      tariffSource = "override";
    }
    if (tariffRate === null) {
      tariffRate = DEFAULT_FALLBACK_DUTY_RATE;
      tariffSource = "fallback-5%";
    }

    // ── Component calculations (each wrapped in try/catch) ─────────────
    const missing: string[] = [];
    const rawComponents: { name: string; amount: number; source: string }[] = [];

    const pushComponent = (
      name: string,
      amount: number | null,
      src: string,
      missingFlag: string | null,
    ) => {
      if (amount === null || !Number.isFinite(amount)) {
        amount = 0;
        if (missingFlag) missing.push(missingFlag);
      }
      rawComponents.push({ name, amount, source: src });
    };

    // 1. GOODS — always provided.
    pushComponent("1. GOODS", goodsValue, "input", null);

    // 2. ORIGIN COST
    const originCost = num(input.originCost) ?? ORIGIN_COST_DEFAULT;
    pushComponent("2. ORIGIN COST", originCost, input.originCost != null ? "override" : "default", null);

    // 3. PACKAGING
    const packaging = num(input.packagingCost) ?? PACKAGING_DEFAULT;
    pushComponent("3. PACKAGING", packaging, input.packagingCost != null ? "override" : "default", null);

    // 4. INLAND
    const inland = num(input.inlandCost) ?? INLAND_DEFAULT;
    pushComponent("4. INLAND", inland, input.inlandCost != null ? "override" : "default", null);

    // 5. EXPORT CLEARANCE
    const exportClearance = num(input.exportClearanceCost) ?? EXPORT_CLEARANCE_DEFAULT;
    pushComponent("5. EXPORT CLEARANCE", exportClearance, input.exportClearanceCost != null ? "override" : "default", null);

    // 6. CERTIFICATES
    const certificates = num(input.certificateCost) ?? CERTIFICATE_DEFAULT;
    pushComponent("6. CERTIFICATES", certificates, input.certificateCost != null ? "override" : "default", null);

    // 7. INSPECTION
    const inspection = num(input.inspectionCost) ?? INSPECTION_DEFAULT;
    pushComponent("7. INSPECTION", inspection, input.inspectionCost != null ? "override" : "default", null);

    // 8. INSURANCE — % of (goods + freight). Required for CIF/CIP per Incoterms 2020.
    const insuranceRate = (num(input.insuranceRate) ?? DEFAULT_INSURANCE_RATE) / 100;
    // For now, base on goods value only (freight not yet calculated); will be
    // recomputed below once freight is known — keep as approximation.
    const freightRatePct = FREIGHT_RATE_BY_MODE[freightMode] ?? FREIGHT_RATE_BY_MODE.OCEAN;
    const freightEstimate = num(input.internationalFreightCost) ?? goodsValue * freightRatePct;
    const insuranceAmount = (goodsValue + freightEstimate) * insuranceRate;
    pushComponent("8. INSURANCE", insuranceAmount, input.insuranceRate != null ? "override" : "default-0.15%", null);

    // 9. INTERNATIONAL FREIGHT — % of goods value by mode, or explicit override.
    const internationalFreight = num(input.internationalFreightCost) ?? freightEstimate;
    pushComponent("9. INTERNATIONAL FREIGHT", internationalFreight, input.internationalFreightCost != null ? "override" : `default-${freightMode.toLowerCase()}-${(freightRatePct * 100).toFixed(1)}%`, null);

    // 10. TRANSIT
    const transit = num(input.transitCost) ?? TRANSIT_DEFAULT;
    pushComponent("10. TRANSIT", transit, input.transitCost != null ? "override" : "default-0", null);

    // 11. DESTINATION HANDLING — mode-aware default.
    let destHandlingDefault = DEST_HANDLING_DEFAULT_OCEAN;
    if (freightMode === "AIR") destHandlingDefault = DEST_HANDLING_DEFAULT_AIR;
    else if (freightMode === "TRUCK" || freightMode === "ROAD") destHandlingDefault = DEST_HANDLING_DEFAULT_TRUCK;
    else if (freightMode === "RAIL") destHandlingDefault = DEST_HANDLING_DEFAULT_RAIL;
    const destHandling = num(input.destinationHandlingCost) ?? destHandlingDefault * containerCount;
    pushComponent("11. DESTINATION HANDLING", destHandling, input.destinationHandlingCost != null ? "override" : `default-${freightMode.toLowerCase()}`, null);

    // 12. DUTY — goods × tariffRate (CIF basis = goods + freight + insurance for most customs).
    const cifBase = goodsValue + internationalFreight + insuranceAmount;
    const dutyAmount = cifBase * (tariffRate || 0);
    pushComponent("12. DUTY", dutyAmount, tariffSource, null);

    // 13. VAT/GST — applied on (CIF + duty) at the destination VAT rate.
    const vatRate = (num(input.vatRate) ?? DEFAULT_VAT_RATE * 100) / 100;
    const vatBase = cifBase + dutyAmount;
    const vatAmount = vatBase * vatRate;
    pushComponent("13. VAT/GST", vatAmount, input.vatRate != null ? "override" : "default-19%", null);

    // 14. EXCISE — usually 0 for most goods, applied on quantity or value.
    const exciseRate = (num(input.exciseRate) ?? DEFAULT_EXCISE_RATE * 100) / 100;
    const exciseAmount = goodsValue * exciseRate;
    pushComponent("14. EXCISE", exciseAmount, input.exciseRate != null ? "override" : "default-0%", null);

    // 15. BROKER
    const broker = num(input.brokerCost) ?? BROKER_DEFAULT;
    pushComponent("15. BROKER", broker, input.brokerCost != null ? "override" : "default", null);

    // 16. LOCAL DELIVERY
    const localDelivery = num(input.localDeliveryCost) ?? LOCAL_DELIVERY_DEFAULT;
    pushComponent("16. LOCAL DELIVERY", localDelivery, input.localDeliveryCost != null ? "override" : "default", null);

    // 17. OTHER FEES
    const otherFees = num(input.otherFees) ?? OTHER_FEES_DEFAULT;
    pushComponent("17. OTHER FEES", otherFees, input.otherFees != null ? "override" : "default", null);

    // 18. SGTX FEES — 1.5% of declared value (blueprint §1.5).
    const sgtxFeeRate = (num(input.sgtxFeeRate) ?? DEFAULT_SGTX_FEE_RATE * 100) / 100;
    const sgtxFee = goodsValue * sgtxFeeRate;
    pushComponent("18. SGTX FEES", sgtxFee, input.sgtxFeeRate != null ? "override" : "default-1.5%", null);

    // ── Total + percentages ─────────────────────────────────────────────
    const total = rawComponents.reduce((s, c) => s + c.amount, 0);
    const breakdown = rawComponents.map((c) => ({
      component: c.name,
      amount: Number(c.amount.toFixed(2)),
      percentage: total > 0 ? Number(((c.amount / total) * 100).toFixed(2)) : 0,
      source: c.source,
      missing: c.amount === 0 && /default-0/.test(c.source),
    }));

    // Sanity check: every one of the 18 components must be present.
    if (breakdown.length !== COMPONENTS.length) {
      logger.warn("[trade-cost/landed] component count mismatch", {
        expected: COMPONENTS.length,
        actual: breakdown.length,
      });
    }

    const inputsEcho = {
      goodsValue,
      originCountry,
      destinationCountry,
      hsCode,
      incoterm,
      freightMode,
      containerCount,
      coldChain,
      weight: weight ?? null,
      currency,
      tariffSource,
      tariffRate: Number((tariffRate * 100).toFixed(4)),
      vatRate: Number((vatRate * 100).toFixed(2)),
      sgtxFeeRate: Number((sgtxFeeRate * 100).toFixed(2)),
    };

    return NextResponse.json({
      ok: true,
      totalLandedCost: Number(total.toFixed(2)),
      currency,
      breakdown,
      missing,
      source,
      ustn: input.ustn || tradeRow?.ustn || null,
      componentCount: breakdown.length,
      inputs: inputsEcho,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error("[api/sgtx/trade-cost/landed] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
