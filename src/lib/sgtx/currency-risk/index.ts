// SGTX Add-On 14 — Currency Risk Management
//
// Pure calculation engine + persistence helpers for tracking FX exposure on
// cross-currency trade commitments (invoices, LCs, freight contracts). The
// SGTX platform settles most trades in USD but tenants routinely face
// receivables / payables in EGP, SAR, AED, EUR, GBP, CNY — exposing them to
// spot-rate movements between contract lock and settlement.
//
// Models (already in schema.prisma):
//   CurrencyExposure        — one row per open foreign-currency position
//   HedgingRecommendation   — recommended hedge % + estimated cost
//   FxRate                  — current spot rates (synced by fx-rates-sync.ts)
//
// The `calculateCurrencyExposure()` function is a PURE-ish function — it does
// one DB read (latest FxRate) to resolve the current rate, then returns the
// derived exposure metrics. Persistence is left to the caller (the API route).
//
// Risk thresholds (industry rules-of-thumb, intentionally conservative):
//   exposureAmount >= $250k OR 30-day vol > 6%  →  HIGH risk
//   exposureAmount >= $50k  OR 30-day vol > 3%  →  MEDIUM risk
//   otherwise                                    →  LOW risk
//
// Hedge recommendation follows a tiered ladder:
//   HIGH   → hedge 70–90% (forward contract preferred)
//   MEDIUM → hedge 40–60% (partial forward + optional option)
//   LOW    → hedge 0–20% (natural hedge acceptable, optional spot)

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface CurrencyExposureInput {
  ustn?: string | null;
  baseCurrency: string;       // e.g., "USD" — the currency the tenant reports in
  exposureCurrency: string;   // e.g., "EGP" — the currency of the receivable/payable
  exposureAmount: number;      // amount in exposureCurrency
  lockedRate?: number | null;  // rate agreed in the contract (base/quote), if any
  hedgeType?: string | null;   // FORWARD | OPTION | NATURAL | NONE
  hedgedPercentage?: number | null; // 0..100, current hedge coverage
}

export interface CurrencyExposureResult {
  baseCurrency: string;
  exposureCurrency: string;
  currencyPair: string;            // "USD/EGP"
  exposureAmount: number;
  currentRate: number | null;      // latest FxRate(base, quote)
  lockedRate: number | null;
  baseValueAtCurrentRate: number | null;   // exposure converted at current rate
  baseValueAtLockedRate: number | null;    // exposure converted at locked rate (if locked)
  unrealisedGainLoss: number | null;       // baseValueAtCurrentRate − baseValueAtLockedRate
  unhedgedPercentage: number;                // 100 − hedgedPercentage (0..100)
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendedHedgePercentage: number;        // 0..100
  estimatedHedgeCostPct: number;             // approx cost as % of exposure
  explanation: string;
  fxRateSource: string | null;
  fxRateStaleHours: number | null;           // age of the FxRate row in hours
}

// ============ Constants ============

const HIGH_RISK_AMOUNT = 250_000;
const MEDIUM_RISK_AMOUNT = 50_000;
const HIGH_VOL_THRESHOLD = 0.06;
const MEDIUM_VOL_THRESHOLD = 0.03;

// Default 30-day annualized volatility estimates by currency (rough rules-of-thumb
// vs USD; only used when no live vol is supplied). Values are 0..1.
const DEFAULT_VOLATILITY: Record<string, number> = {
  USD: 0.0,  EUR: 0.06, GBP: 0.07, JPY: 0.08, CHF: 0.05,
  CNY: 0.03, HKD: 0.02, SGD: 0.03, AUD: 0.09, CAD: 0.07,
  EGP: 0.18, SAR: 0.02, AED: 0.02, TRY: 0.25, INR: 0.07,
  BRL: 0.12, ZAR: 0.15, RUB: 0.20, MXN: 0.10,
};

// Approximate annual cost of hedging (%) — forward points + option premium
// scaled to tenor. These are deliberately conservative; real implementations
// should query a treasury management system.
const HEDGE_COST_PCT: Record<string, number> = {
  FORWARD: 0.5,  // ~50 bps annualized (cost is mostly forward points)
  OPTION: 1.5,   // ~150 bps for an at-the-money option
  NATURAL: 0.0,
  NONE: 0.0,
};

// ============ Helpers ============

function estimateVolatility(exposureCurrency: string): number {
  return DEFAULT_VOLATILITY[exposureCurrency.toUpperCase()] ?? 0.10;
}

function deriveRiskLevel(
  exposureAmount: number,
  exposureCurrency: string,
): { level: "LOW" | "MEDIUM" | "HIGH"; vol: number } {
  const vol = estimateVolatility(exposureCurrency);
  if (exposureAmount >= HIGH_RISK_AMOUNT || vol >= HIGH_VOL_THRESHOLD) {
    return { level: "HIGH", vol };
  }
  if (exposureAmount >= MEDIUM_RISK_AMOUNT || vol >= MEDIUM_VOL_THRESHOLD) {
    return { level: "MEDIUM", vol };
  }
  return { level: "LOW", vol };
}

function recommendHedgePercentage(level: "LOW" | "MEDIUM" | "HIGH"): number {
  switch (level) {
    case "HIGH":   return 80;
    case "MEDIUM":  return 50;
    case "LOW":
    default:        return 10;
  }
}

/**
 * Fetch the most recent FxRate row for a (base, quote) pair from the
 * `FxRate` table (synced by `fx-rates-sync.ts`). Returns null if no rate
 * is available. Defensive — never throws.
 */
export async function getCurrentFxRate(
  base: string,
  quote: string,
): Promise<{ rate: number | null; source: string | null; syncedAt: Date | null }> {
  try {
    const row = await (db as any).fxRate.findFirst({
      where: { base: base.toUpperCase(), quote: quote.toUpperCase() },
      orderBy: { syncedAt: "desc" },
    });
    if (!row) return { rate: null, source: null, syncedAt: null };
    return { rate: row.rate, source: row.source ?? null, syncedAt: row.syncedAt ?? null };
  } catch (e: any) {
    logger.warn("[currency-risk] fxRate lookup failed", {
      base, quote, error: e?.message || String(e),
    });
    return { rate: null, source: null, syncedAt: null };
  }
}

// ============ Core function ============

/**
 * Calculate currency exposure metrics for a single foreign-currency position.
 *
 * Pure-ish: one DB read (latest FxRate) to resolve currentRate. All other
 * math is deterministic. The caller is responsible for persisting the result
 * into `CurrencyExposure` and (optionally) generating a `HedgingRecommendation`.
 */
export async function calculateCurrencyExposure(
  input: CurrencyExposureInput,
): Promise<CurrencyExposureResult> {
  const baseCurrency = input.baseCurrency.toUpperCase();
  const exposureCurrency = input.exposureCurrency.toUpperCase();
  const currencyPair = `${baseCurrency}/${exposureCurrency}`;

  // Same currency → zero exposure by definition.
  if (baseCurrency === exposureCurrency) {
    return {
      baseCurrency,
      exposureCurrency,
      currencyPair,
      exposureAmount: input.exposureAmount,
      currentRate: 1.0,
      lockedRate: input.lockedRate ?? null,
      baseValueAtCurrentRate: input.exposureAmount,
      baseValueAtLockedRate: input.lockedRate ? input.exposureAmount : null,
      unrealisedGainLoss: 0,
      unhedgedPercentage: 100 - (input.hedgedPercentage ?? 0),
      riskLevel: "LOW",
      recommendedHedgePercentage: 0,
      estimatedHedgeCostPct: 0,
      explanation: "Exposure and base currencies are identical — no FX risk.",
      fxRateSource: "IDENTITY",
      fxRateStaleHours: 0,
    };
  }

  // Look up the current rate (one DB read, defensive).
  const fx = await getCurrentFxRate(baseCurrency, exposureCurrency);
  const currentRate = fx.rate;
  const fxRateStaleHours = fx.syncedAt
    ? Math.max(0, (Date.now() - fx.syncedAt.getTime()) / 3_600_000)
    : null;

  const baseValueAtCurrentRate = currentRate !== null
    ? input.exposureAmount / currentRate
    : null;

  const lockedRate = input.lockedRate ?? null;
  const baseValueAtLockedRate = lockedRate !== null
    ? input.exposureAmount / lockedRate
    : null;

  // Unrealised gain/loss — positive = gain in base-currency terms relative to
  // the locked rate (i.e., the exposure is worth more now than when locked).
  let unrealisedGainLoss: number | null = null;
  if (baseValueAtCurrentRate !== null && baseValueAtLockedRate !== null) {
    unrealisedGainLoss = +(baseValueAtCurrentRate - baseValueAtLockedRate).toFixed(2);
  }

  const hedgedPct = Math.max(0, Math.min(100, input.hedgedPercentage ?? 0));
  const unhedgedPercentage = 100 - hedgedPct;

  const { level, vol } = deriveRiskLevel(input.exposureAmount, exposureCurrency);
  const recommendedHedgePercentage = recommendHedgePercentage(level);
  const hedgeType = (input.hedgeType || "FORWARD").toUpperCase();
  const estimatedHedgeCostPct = (HEDGE_COST_PCT[hedgeType] ?? HEDGE_COST_PCT.FORWARD) *
    (recommendedHedgePercentage / 100);

  const explanationParts: string[] = [];
  if (currentRate === null) {
    explanationParts.push(
      `No live FX rate available for ${currencyPair} — sync fx-rates-sync.ts to enable live exposure tracking.`,
    );
  } else {
    explanationParts.push(
      `${currencyPair} spot ${currentRate.toFixed(4)} (source: ${fx.source ?? "unknown"}${
        fxRateStaleHours !== null && fxRateStaleHours > 24 ? `, ${fxRateStaleHours.toFixed(0)}h stale` : ""
      }).`,
    );
  }
  if (lockedRate !== null) {
    explanationParts.push(
      `Locked at ${lockedRate.toFixed(4)} → base value ${baseValueAtLockedRate?.toFixed(2)} vs current ${baseValueAtCurrentRate?.toFixed(2)} (${unrealisedGainLoss! >= 0 ? "gain" : "loss"} ${Math.abs(unrealisedGainLoss!).toFixed(2)} ${baseCurrency}).`,
    );
  } else {
    explanationParts.push(
      `No locked rate — exposure is fully open (unhedged ${unhedgedPercentage}%).`,
    );
  }
  explanationParts.push(
    `Risk: ${level} (est. 30-day vol ${(vol * 100).toFixed(1)}%, exposure ${input.exposureAmount.toLocaleString()} ${exposureCurrency}). ` +
    `Recommend hedging ${recommendedHedgePercentage}% via ${hedgeType} (~${estimatedHedgeCostPct.toFixed(2)}% cost).`,
  );

  return {
    baseCurrency,
    exposureCurrency,
    currencyPair,
    exposureAmount: input.exposureAmount,
    currentRate,
    lockedRate,
    baseValueAtCurrentRate,
    baseValueAtLockedRate,
    unrealisedGainLoss,
    unhedgedPercentage,
    riskLevel: level,
    recommendedHedgePercentage,
    estimatedHedgeCostPct: +estimatedHedgeCostPct.toFixed(4),
    explanation: explanationParts.join(" "),
    fxRateSource: fx.source,
    fxRateStaleHours,
  };
}

/**
 * Persist a CurrencyExposure row. Defensive — returns null on failure.
 */
export async function persistCurrencyExposure(
  input: CurrencyExposureInput,
  calc: CurrencyExposureResult,
): Promise<{ id: string } | null> {
  try {
    const row = await (db as any).currencyExposure.create({
      data: {
        ustn: input.ustn ?? null,
        baseCurrency: calc.baseCurrency,
        exposureCurrency: calc.exposureCurrency,
        exposureAmount: calc.exposureAmount,
        lockedRate: calc.lockedRate,
        currentRate: calc.currentRate,
        unrealisedGainLoss: calc.unrealisedGainLoss,
        hedgedPercentage: input.hedgedPercentage ?? null,
        hedgeType: input.hedgeType ?? null,
      },
    });
    return { id: row.id };
  } catch (e: any) {
    logger.error("[currency-risk] persistCurrencyExposure failed", {
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Build and persist a HedgingRecommendation for a tenant + currency pair.
 * Returns the created row or null on failure.
 */
export async function createHedgingRecommendation(input: {
  tenantGtid: string;
  currencyPair: string;
  exposureAmount: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendedHedgePercentage?: number;
  estimatedCost?: number;
  explanation?: string;
  validUntilDays?: number; // default 7
}): Promise<{ id: string; validUntil: Date } | null> {
  try {
    const riskLevel = input.riskLevel;
    const recommendedHedgePercentage = input.recommendedHedgePercentage ?? recommendHedgePercentage(riskLevel);
    const validUntil = new Date(Date.now() + (input.validUntilDays ?? 7) * 86_400_000);
    const row = await (db as any).hedgingRecommendation.create({
      data: {
        tenantGtid: input.tenantGtid,
        currencyPair: input.currencyPair.toUpperCase(),
        exposureAmount: input.exposureAmount,
        riskLevel,
        recommendedHedgePercentage,
        estimatedCost: input.estimatedCost ?? null,
        explanation: input.explanation ?? null,
        validUntil,
      },
    });
    return { id: row.id, validUntil };
  } catch (e: any) {
    logger.error("[currency-risk] createHedgingRecommendation failed", {
      error: e?.message || String(e),
    });
    return null;
  }
}
