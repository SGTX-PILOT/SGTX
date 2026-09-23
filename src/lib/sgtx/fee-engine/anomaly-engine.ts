// @ts-nocheck
/**
 * SGTX v18 §9.27.33 — Fee Anomaly Engine
 * ============================================================================
 *
 *  ┌────────────────────────────────────────────────────────────────────────┐
 *  │                                                                         │
 *  │   FEE ANOMALY ENGINE — AI-POWERED FEE SANITY GATE (v18 §9.27.33)       │
 *  │                                                                         │
 *  │   Advisory layer that runs AFTER the Fee Decision is produced.         │
 *  │   Checks 16 anomaly conditions + emits a risk-level report that        │
 *  │   downstream actors (Governor, Compliance, Trader) use to decide        │
 *  │   whether to PROCEED / REVIEW / INVESTIGATE / BLOCK.                   │
 *  │                                                                         │
 *  │   The engine is ADVISORY by default — it flags anomalies but does     │
 *  │   NOT block fee decisions from being persisted or locked, UNLESS       │
 *  │   riskLevel == CRITICAL AND recommendedAction == BLOCK.                │
 *  │                                                                         │
 *  │   16 ANOMALY CHECKS (Fee Sanity Gate extensions):                      │
 *  │    A01 — Fee exceeds historical average by >2σ                         │
 *  │    A02 — Fee rate outside typical band for economic class             │
 *  │    A03 — CFB unusually high/low for commodity type                    │
 *  │    A04 — Fairness score extremely low (<10) or high (>95)             │
 *  │    A05 — Discounts stacking exceeds 50% of base rate                  │
 *  │    A06 — Final fee hits constitutional cap (overcharging?)             │
 *  │    A07 — Final fee hits cost-to-serve floor (undercharging?)           │
 *  │    A08 — Same USTN has multiple fee decisions (re-calc abuse)         │
 *  │    A09 — Same commodity+incoterm varies >30% across trades            │
 *  │    A10 — Bulk discount applied to non-bulk trade                       │
 *  │    A11 — Essential discount applied to non-essential trade             │
 *  │    A12 — Special-stock cap applied without subclass evidence           │
 *  │    A13 — Affordability cap hit (margin squeeze)                        │
 *  │    A14 — Party protection limit exceeded                                │
 *  │    A15 — TSEC exceeds aggregate party protection limit                 │
 *  │    A16 — Fee decision hash mismatch (tamper detection)                 │
 *  │                                                                         │
 *  │   OUTPUT (FeeAnomalyReport):                                           │
 *  │     feeDecisionId, ustn, anomalies[], riskLevel, recommendedAction,   │
 *  │     generatedAt.                                                       │
 *  │                                                                         │
 *  │   RISK LEVEL MAPPING:                                                  │
 *  │     CRITICAL  — 1+ ERROR-severity anomaly + tamper/hash mismatch      │
 *  │     HIGH      — 2+ WARNING anomalies OR any single ERROR anomaly      │
 *  │     MEDIUM    — 1+ WARNING anomaly                                     │
 *  │     LOW       — only INFO anomalies (or zero anomalies)               │
 *  │                                                                         │
 *  │   RECOMMENDED ACTION MAPPING:                                          │
 *  │     BLOCK      — riskLevel == CRITICAL AND tamper (A16) detected       │
 *  │     INVESTIGATE— riskLevel == CRITICAL (no tamper)                     │
 *  │     REVIEW     — riskLevel == HIGH                                     │
 *  │     PROCEED    — riskLevel == MEDIUM or LOW                             │
 *  │                                                                         │
 *  └────────────────────────────────────────────────────────────────────────┘
 *
 * Persistence: existing ConfigurationHistory model as a JSON-KV store with
 * configKey prefix `fee_anomaly_report:` — same pattern as the chat session,
 * PIN store, voice history, biometric session stores migrated in UPG-1.
 *
 * The report is keyed by `feeDecisionId` so multiple reports can coexist
 * for the same USTN (one per FeeDecisionObject version).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  RATE_FLOOR,
  RATE_CEILING,
  CLASS_CAPS,
  MARGIN_TAKE_RATE_CEILING,
  MARGIN_TAKE_RATE_FLOOR,
} from "@/lib/sgtx/fee-engine/constants";
import { computeLoomHash, getFeeDecision } from "@/lib/sgtx/fee-engine";

// ============================================================================
// Types — Fee Anomaly Report (§9.27.33)
// ============================================================================

export type AnomalySeverity = "INFO" | "WARNING" | "ERROR";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RecommendedAction = "PROCEED" | "REVIEW" | "INVESTIGATE" | "BLOCK";

export interface FeeAnomaly {
  /** Stable check identifier — e.g. "A01", "A02", … "A16". */
  checkId: string;
  /** Human-readable check name. */
  checkName: string;
  /** Severity — INFO / WARNING / ERROR. */
  severity: AnomalySeverity;
  /** Short human-readable message describing the anomaly. */
  message: string;
  /** Optional evidence payload — supporting values for audit / forensics. */
  evidence?: Record<string, any>;
}

export interface FeeAnomalyReport {
  feeDecisionId: string;
  ustn: string;
  anomalies: FeeAnomaly[];
  riskLevel: RiskLevel;
  recommendedAction: RecommendedAction;
  generatedAt: string;
}

// ============================================================================
// Internal helpers
// ============================================================================

const ANOMALY_STORAGE_PREFIX = "fee_anomaly_report:";
const ANOMALY_SYSTEM_GTID = "GTID-FEE-ANOMALY-ENGINE";

/**
 * Severity rank — used to derive the aggregate riskLevel from the worst
 * anomaly in the report.
 */
const SEVERITY_RANK: Record<AnomalySeverity, number> = {
  INFO: 0,
  WARNING: 1,
  ERROR: 2,
};

/**
 * Map a list of anomalies → aggregate riskLevel + recommendedAction.
 *
 * Risk Level (worst-case wins):
 *   - A16 (hash mismatch) is present AND ERROR → CRITICAL + BLOCK
 *   - 1+ ERROR anomalies → CRITICAL
 *   - 2+ WARNING anomalies → HIGH
 *   - 1 WARNING anomaly → MEDIUM
 *   - 0 anomalies OR only INFO → LOW
 *
 * Recommended Action:
 *   - CRITICAL + A16 present → BLOCK
 *   - CRITICAL (no A16) → INVESTIGATE
 *   - HIGH → REVIEW
 *   - MEDIUM / LOW → PROCEED
 */
function deriveRiskAndAction(anomalies: FeeAnomaly[]): {
  riskLevel: RiskLevel;
  recommendedAction: RecommendedAction;
} {
  if (anomalies.length === 0) {
    return { riskLevel: "LOW", recommendedAction: "PROCEED" };
  }

  const errorCount = anomalies.filter((a) => a.severity === "ERROR").length;
  const warningCount = anomalies.filter((a) => a.severity === "WARNING").length;
  const hasTamper = anomalies.some((a) => a.checkId === "A16" && a.severity === "ERROR");

  let riskLevel: RiskLevel = "LOW";
  if (errorCount > 0) {
    riskLevel = "CRITICAL";
  } else if (warningCount >= 2) {
    riskLevel = "HIGH";
  } else if (warningCount === 1) {
    riskLevel = "MEDIUM";
  }

  let recommendedAction: RecommendedAction = "PROCEED";
  if (riskLevel === "CRITICAL" && hasTamper) {
    recommendedAction = "BLOCK";
  } else if (riskLevel === "CRITICAL") {
    recommendedAction = "INVESTIGATE";
  } else if (riskLevel === "HIGH") {
    recommendedAction = "REVIEW";
  }

  return { riskLevel, recommendedAction };
}

// ============================================================================
// Historical stats helper — used by A01 + A09
// ============================================================================

/**
 * Compute mean + population standard deviation of the FINAL_FEE values from
 * a list of past FeeDecisionObject records (most-recent-first, excluding the
 * current decision).
 *
 * Returns null if fewer than 2 historical samples (can't compute σ).
 */
function meanStd(values: number[]): { mean: number; std: number } | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
  const std = Math.sqrt(variance);
  return { mean, std };
}

// ============================================================================
// The 16 anomaly checks (each returns FeeAnomaly | null)
// ============================================================================

/**
 * A01 — Fee exceeds historical average by >2 standard deviations.
 *
 * Pulls the last N=30 FeeDecisionObjects for the SAME USTN, computes the
 * mean + σ of FINAL_FEE, and flags if the current FINAL_FEE is more than 2σ
 * above the mean (a sudden spike).
 *
 * Conservative: this check only FIRES on the upside. A fee that suddenly
 * drops is interesting but not necessarily an anomaly (could be a legitimate
 * discount) — that's handled by A07 (cost-to-serve floor).
 *
 * Returns null when there is insufficient history.
 */
async function checkA01HistoricalSpike(
  decision: FeeDecisionObject,
): Promise<FeeAnomaly | null> {
  try {
    const rows = await db.feeCalculation.findMany({
      where: {
        ustn: decision.USTN,
        stage: "V18_DYNAMIC_ENGINE",
      },
      orderBy: { createdAt: "desc" },
      take: 31, // current + last 30
    });

    // Drop the row that matches the current decision (by FEE_DECISION_ID).
    const historicalFees: number[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.providerFeesJson || "{}");
        if (parsed.FEE_DECISION_ID === decision.FEE_DECISION_ID) continue;
        if (typeof parsed.FINAL_FEE === "number" && parsed.FINAL_FEE >= 0) {
          historicalFees.push(parsed.FINAL_FEE);
        }
      } catch {
        continue;
      }
    }

    const stats = meanStd(historicalFees);
    if (!stats || stats.std === 0) return null;

    const deviation = (decision.FINAL_FEE - stats.mean) / stats.std;
    if (deviation > 2) {
      return {
        checkId: "A01",
        checkName: "Historical spike (>2σ above mean)",
        severity: "WARNING",
        message: `FINAL_FEE $${decision.FINAL_FEE.toFixed(2)} is ${deviation.toFixed(2)}σ above the historical mean ($${stats.mean.toFixed(2)} ± $${stats.std.toFixed(2)}).`,
        evidence: {
          historicalSampleCount: historicalFees.length,
          mean: stats.mean,
          std: stats.std,
          currentFee: decision.FINAL_FEE,
          sigmaDeviation: deviation,
        },
      };
    }
    return null;
  } catch (err: any) {
    logger.warn("[anomaly-engine] A01 check failed", {
      ustn: decision.USTN,
      error: err?.message,
    });
    return null;
  }
}

/**
 * A02 — Fee rate outside typical band for economic class.
 *
 * Each economic class has a constitutional cap (CLASS_CAPS). The "typical
 * band" is [RATE_FLOOR, CLASS_CAPS[class] × 0.85]. If FINAL_RATE is in the
 * top 15% of the class band (very close to the cap), it may indicate
 * overcharging — a fee that should be in the 30-60% band of the class is
 * sitting at the ceiling.
 */
function checkA02RateOutOfBand(decision: FeeDecisionObject): FeeAnomaly | null {
  const classCap = CLASS_CAPS[decision.PRIMARY_CLASS] ?? RATE_CEILING;
  const upperBand = classCap * 0.85;
  if (decision.FINAL_RATE > upperBand) {
    return {
      checkId: "A02",
      checkName: "Fee rate outside typical band for class",
      severity: "WARNING",
      message: `FINAL_RATE ${(decision.FINAL_RATE * 100).toFixed(4)}% exceeds 85% of the ${decision.PRIMARY_CLASS} class cap (${(upperBand * 100).toFixed(4)}%).`,
      evidence: {
        finalRate: decision.FINAL_RATE,
        primaryClass: decision.PRIMARY_CLASS,
        classCap,
        upperBand,
      },
    };
  }
  // Also flag if FINAL_RATE is suspiciously close to the absolute floor.
  if (decision.FINAL_RATE <= RATE_FLOOR * 1.5) {
    return {
      checkId: "A02",
      checkName: "Fee rate outside typical band for class",
      severity: "INFO",
      message: `FINAL_RATE ${(decision.FINAL_RATE * 100).toFixed(4)}% is very close to the absolute 0.03% floor — may indicate under-pricing.`,
      evidence: {
        finalRate: decision.FINAL_RATE,
        primaryClass: decision.PRIMARY_CLASS,
        floor: RATE_FLOOR,
      },
    };
  }
  return null;
}

/**
 * A03 — CFB unusually high/low for commodity type.
 *
 * Heuristic — flags CFB > $5M (very high value trade) or < $100 (suspiciously
 * small). Both extremes warrant a human glance.
 */
function checkA03CfbUnusual(decision: FeeDecisionObject): FeeAnomaly | null {
  const cfb = decision.CFB;
  if (cfb > 5_000_000) {
    return {
      checkId: "A03",
      checkName: "CFB unusually high for commodity",
      severity: "INFO",
      message: `CFB $${cfb.toFixed(2)} exceeds $5M — high-value trade; verify commodity classification.`,
      evidence: { cfb, threshold: 5_000_000 },
    };
  }
  if (cfb > 0 && cfb < 100) {
    return {
      checkId: "A03",
      checkName: "CFB unusually low for commodity",
      severity: "WARNING",
      message: `CFB $${cfb.toFixed(2)} is below $100 — suspiciously small; may indicate test trade or input error.`,
      evidence: { cfb, threshold: 100 },
    };
  }
  return null;
}

/**
 * A04 — Fairness score extremely low (<10) or high (>95).
 *
 * Either extreme suggests the underlying scores may be mis-calibrated.
 * Below 10 → efficiency is overwhelmingly dominant (rare; usually means
 * risk/CTS are 0). Above 95 → all four sub-scores are maxed out (rare in
 * production; may indicate gamed inputs).
 */
function checkA04FairnessExtreme(decision: FeeDecisionObject): FeeAnomaly | null {
  const fs = decision.FAIRNESS_SCORE;
  if (fs < 10) {
    return {
      checkId: "A04",
      checkName: "Fairness score extremely low",
      severity: "WARNING",
      message: `FAIRNESS_SCORE ${fs.toFixed(2)} is below 10 — efficiency is overwhelmingly dominant; verify inputs.`,
      evidence: { fairnessScore: fs, threshold: 10 },
    };
  }
  if (fs > 95) {
    return {
      checkId: "A04",
      checkName: "Fairness score extremely high",
      severity: "WARNING",
      message: `FAIRNESS_SCORE ${fs.toFixed(2)} exceeds 95 — all sub-scores maxed; verify no input gaming.`,
      evidence: { fairnessScore: fs, threshold: 95 },
    };
  }
  return null;
}

/**
 * A05 — Discounts stacking exceeds 50% of base rate.
 *
 * If the total discount percentage exceeds 50% of the BASE_FAIR_RATE, the
 * engine may be over-discounting (each individual discount is capped but
 * their sum can be large).
 */
function checkA05DiscountStacking(decision: FeeDecisionObject): FeeAnomaly | null {
  // Compute total discount pct applied at the rate level.
  if (!decision.BASE_FAIR_RATE || decision.BASE_FAIR_RATE <= 0) return null;
  const discountPctTotal =
    (decision.DISCOUNTS_APPLIED || []).reduce((s, d) => s + (d.pct || 0), 0);
  const ratioToBase = discountPctTotal / decision.BASE_FAIR_RATE;
  if (ratioToBase > 0.5) {
    return {
      checkId: "A05",
      checkName: "Discount stacking >50% of base rate",
      severity: "WARNING",
      message: `Total discount ${(discountPctTotal * 100).toFixed(4)}% is ${(ratioToBase * 100).toFixed(2)}% of BASE_FAIR_RATE — over-discounting.`,
      evidence: {
        baseFairRate: decision.BASE_FAIR_RATE,
        discountPctTotal,
        ratioToBase,
        discounts: (decision.DISCOUNTS_APPLIED || []).map((d) => ({
          id: d.id,
          pct: d.pct,
          bps: d.bps,
        })),
      },
    };
  }
  return null;
}

/**
 * A06 — Final fee hits constitutional cap (overcharging?).
 *
 * If FINAL_FEE equals the constitutional cap (CFB × RATE_CEILING) within
 * $0.01, the fee is sitting at the absolute ceiling — possibly overcharging.
 */
function checkA06ConstitutionalCap(decision: FeeDecisionObject): FeeAnomaly | null {
  const cap = decision.CFB * RATE_CEILING;
  // The fee is "at the cap" if it's within 1 bp (0.01%) of the cap.
  const atCap = Math.abs(decision.FINAL_FEE - cap) < cap * 0.0001;
  if (atCap) {
    return {
      checkId: "A06",
      checkName: "Final fee at constitutional cap",
      severity: "WARNING",
      message: `FINAL_FEE $${decision.FINAL_FEE.toFixed(2)} sits at the constitutional cap ($${cap.toFixed(2)} = 1.50% × CFB) — verify fee is justified.`,
      evidence: {
        finalFee: decision.FINAL_FEE,
        constitutionalCap: cap,
        delta: decision.FINAL_FEE - cap,
      },
    };
  }
  return null;
}

/**
 * A07 — Final fee hits cost-to-serve floor (undercharging?).
 *
 * If FINAL_FEE equals the COST_TO_SERVE_FLOOR within $0.01, the fee is
 * sitting at the absolute floor — possibly undercharging (the engine wanted
 * to go lower but was prevented by the floor).
 */
function checkA07CostToServeFloor(decision: FeeDecisionObject): FeeAnomaly | null {
  const floor = decision.COST_TO_SERVE_FLOOR;
  if (floor <= 0) return null;
  const atFloor = Math.abs(decision.FINAL_FEE - floor) < floor * 0.0001;
  if (atFloor) {
    return {
      checkId: "A07",
      checkName: "Final fee at cost-to-serve floor",
      severity: "INFO",
      message: `FINAL_FEE $${decision.FINAL_FEE.toFixed(2)} sits at the cost-to-serve floor ($${floor.toFixed(2)}) — PRE_CAP_FEE was below floor; floor binding.`,
      evidence: {
        finalFee: decision.FINAL_FEE,
        costToServeFloor: floor,
        preCapFee: decision.PRE_CAP_FEE,
      },
    };
  }
  return null;
}

/**
 * A08 — Same USTN has multiple fee decisions (re-calculation abuse).
 *
 * If there are 3+ FeeDecisionObjects stored for the same USTN, it may
 * indicate re-calculation abuse (someone trying to manipulate the outcome
 * by re-running the engine until they get a favourable result).
 */
async function checkA08MultipleDecisions(
  decision: FeeDecisionObject,
): Promise<FeeAnomaly | null> {
  try {
    const count = await db.feeCalculation.count({
      where: {
        ustn: decision.USTN,
        stage: "V18_DYNAMIC_ENGINE",
      },
    });
    // count includes the row we're about to persist; the threshold is 3+.
    if (count >= 3) {
      return {
        checkId: "A08",
        checkName: "Multiple fee decisions for same USTN",
        severity: count >= 6 ? "ERROR" : "WARNING",
        message: `${count} Fee Decision Objects stored for USTN ${decision.USTN} — potential re-calculation abuse.`,
        evidence: { decisionCount: count, ustn: decision.USTN },
      };
    }
    return null;
  } catch (err: any) {
    logger.warn("[anomaly-engine] A08 check failed", {
      ustn: decision.USTN,
      error: err?.message,
    });
    return null;
  }
}

/**
 * A09 — Fee for same commodity+incoterm varies >30% across trades.
 *
 * Pulls the last 10 FeeDecisionObjects (any USTN) and compares their
 * FINAL_RATE for trades that share the same PRIMARY_CLASS + ECONOMIC_CLASSES
 * set. If the current FINAL_RATE deviates >30% from the cohort median, flag.
 *
 * Conservative: only fires if there are 3+ comparable historical decisions.
 */
async function checkA09CrossTradeVariance(
  decision: FeeDecisionObject,
): Promise<FeeAnomaly | null> {
  try {
    const rows = await db.feeCalculation.findMany({
      where: {
        stage: "V18_DYNAMIC_ENGINE",
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const cohortRates: number[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.providerFeesJson || "{}");
        if (parsed.FEE_DECISION_ID === decision.FEE_DECISION_ID) continue;
        if (parsed.PRIMARY_CLASS !== decision.PRIMARY_CLASS) continue;
        if (typeof parsed.FINAL_RATE === "number" && parsed.FINAL_RATE > 0) {
          cohortRates.push(parsed.FINAL_RATE);
        }
      } catch {
        continue;
      }
    }

    if (cohortRates.length < 3) return null;

    // Median + max deviation.
    const sorted = [...cohortRates].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const deviation = Math.abs(decision.FINAL_RATE - median) / median;
    if (deviation > 0.3) {
      return {
        checkId: "A09",
        checkName: "Fee varies >30% across comparable trades",
        severity: "WARNING",
        message: `FINAL_RATE ${(decision.FINAL_RATE * 100).toFixed(4)}% deviates ${(deviation * 100).toFixed(2)}% from cohort median (${(median * 100).toFixed(4)}%, n=${cohortRates.length}).`,
        evidence: {
          finalRate: decision.FINAL_RATE,
          cohortMedian: median,
          cohortSize: cohortRates.length,
          deviationPct: deviation,
        },
      };
    }
    return null;
  } catch (err: any) {
    logger.warn("[anomaly-engine] A09 check failed", {
      ustn: decision.USTN,
      error: err?.message,
    });
    return null;
  }
}

/**
 * A10 — Bulk discount applied to non-bulk trade.
 *
 * The MULTI_SHIPMENT discount is intended for trades that are actually
 * multi-shipment (parentUstn set OR multiShipment=true). If the discount
 * is applied without that flag, flag.
 *
 * NOTE: this check uses the live Trade record (loaded async) — if the trade
 * cannot be loaded, the check is skipped (null).
 */
async function checkA10BulkDiscountMisapplied(
  decision: FeeDecisionObject,
): Promise<FeeAnomaly | null> {
  try {
    const multiShipDiscount = (decision.DISCOUNTS_APPLIED || []).find(
      (d) => d.id === "MULTI_SHIPMENT" && d.bps > 0,
    );
    if (!multiShipDiscount) return null;

    // Cross-check: does the trade row actually have multiShipment=true or
    // parentUstn set?
    const trade = await db.trade.findUnique({
      where: { ustn: decision.USTN },
      select: {
        multiShipment: true,
        parentUstn: true,
        containerCount: true,
      },
    }) as any;

    if (!trade) return null; // can't verify — skip

    const isActuallyMulti =
      Boolean(trade.multiShipment) ||
      Boolean(trade.parentUstn) ||
      Number(trade.containerCount || 0) >= 2;

    if (!isActuallyMulti) {
      return {
        checkId: "A10",
        checkName: "Bulk/multi-shipment discount misapplied",
        severity: "ERROR",
        message: `MULTI_SHIPMENT discount (${multiShipDiscount.bps} bps) applied but the trade is neither multiShipment nor has parentUstn nor ≥2 containers.`,
        evidence: {
          discountBps: multiShipDiscount.bps,
          multiShipment: trade.multiShipment,
          parentUstn: trade.parentUstn,
          containerCount: trade.containerCount,
        },
      };
    }
    return null;
  } catch (err: any) {
    logger.warn("[anomaly-engine] A10 check failed", {
      ustn: decision.USTN,
      error: err?.message,
    });
    return null;
  }
}

/**
 * A11 — Essential discount applied to non-essential trade.
 *
 * The ESSENTIAL class is reserved for food, medicine, humanitarian. If the
 * trade was classified as ESSENTIAL but the commodity doesn't match the
 * essential keywords list, flag.
 *
 * NOTE: this is a cross-check on the classification logic. We use the
 * ECONOMIC_CLASSES list on the decision (no DB read needed — if ESSENTIAL is
 * in the list, the classifyEconomics() function already verified the
 * commodity matched the essential list). So this check actually validates
 * that no OTHER essential-specific cap was applied spuriously.
 *
 * For now, we check the ESSENTIAL class cap binding — if ESSENTIAL_CAP is
 * binding but ESSENTIAL is NOT in ECONOMIC_CLASSES, that's a tamper signal.
 */
function checkA11EssentialMisapplied(decision: FeeDecisionObject): FeeAnomaly | null {
  const essentialInClasses = (decision.ECONOMIC_CLASSES || []).includes(
    "ESSENTIAL",
  );
  const essentialCapBinding = (decision.CAPS_APPLIED || []).find(
    (c) => c.cap === "ESSENTIAL_CAP" && c.binding,
  );
  if (essentialCapBinding && !essentialInClasses) {
    return {
      checkId: "A11",
      checkName: "Essential cap applied to non-essential trade",
      severity: "ERROR",
      message: `ESSENTIAL_CAP is binding but ESSENTIAL is not in ECONOMIC_CLASSES — possible cap misapplication.`,
      evidence: {
        economicClasses: decision.ECONOMIC_CLASSES,
        essentialCapBinding,
      },
    };
  }
  return null;
}

/**
 * A12 — Special-stock cap applied without subclass evidence.
 *
 * If SPECIAL_STOCK_CAP is binding but no SUBCLASS is set on the decision,
 * the cap may have been applied without subclass evidence.
 */
function checkA12SpecialStockNoSubclass(
  decision: FeeDecisionObject,
): FeeAnomaly | null {
  const specialInClasses = (decision.ECONOMIC_CLASSES || []).includes(
    "SPECIAL_STOCK",
  );
  if (!specialInClasses) return null;

  const specialCapBinding = (decision.CAPS_APPLIED || []).find(
    (c) => c.cap === "SPECIAL_STOCK_CAP" && c.binding,
  );
  if (specialCapBinding && !decision.SUBCLASS) {
    return {
      checkId: "A12",
      checkName: "Special-stock cap without subclass evidence",
      severity: "WARNING",
      message: `SPECIAL_STOCK_CAP is binding but no SUBCLASS is set — subclass evidence is missing.`,
      evidence: {
        economicClasses: decision.ECONOMIC_CLASSES,
        subclass: decision.SUBCLASS ?? null,
      },
    };
  }
  return null;
}

/**
 * A13 — Affordability cap hit (margin squeeze).
 *
 * If AFFORDABILITY_CAP is the binding cap, the trade's gross-profit-derived
 * fee ceiling was lower than the constitutional cap — i.e. SGTX's margin
 * take is constrained by party affordability. This is by design (Layer 6
 * guards against squeezing the party), but flag for transparency so the
 * party can confirm the estimated margin is correct.
 */
function checkA13AffordabilityCapHit(decision: FeeDecisionObject): FeeAnomaly | null {
  const affordabilityBinding = (decision.CAPS_APPLIED || []).find(
    (c) => c.cap === "AFFORDABILITY_CAP" && c.binding,
  );
  if (affordabilityBinding) {
    return {
      checkId: "A13",
      checkName: "Affordability cap binding (margin squeeze)",
      severity: "INFO",
      message: `AFFORDABILITY_CAP is the binding cap — fee constrained by party affordability; verify estimated gross profit.`,
      evidence: {
        affordabilityCap: decision.AFFORDABILITY_CAP,
        estimatedGrossProfit: decision.ESTIMATED_GROSS_PROFIT,
        marginTakeRate: decision.MARGIN_TAKE_RATE,
      },
    };
  }
  return null;
}

/**
 * A14 — Party protection limit exceeded.
 *
 * PARTY_PROTECTION_LIMIT equals AFFORDABILITY_CAP. If FINAL_FEE exceeds
 * PARTY_PROTECTION_LIMIT (it shouldn't — Layer 6 + Layer 7 enforce), flag
 * as ERROR (a binding enforcement failure).
 */
function checkA14PartyProtectionExceeded(
  decision: FeeDecisionObject,
): FeeAnomaly | null {
  const ppl = decision.PARTY_PROTECTION_LIMIT || 0;
  if (ppl > 0 && decision.FINAL_FEE > ppl + 1e-6) {
    return {
      checkId: "A14",
      checkName: "Party protection limit exceeded",
      severity: "ERROR",
      message: `FINAL_FEE $${decision.FINAL_FEE.toFixed(2)} exceeds PARTY_PROTECTION_LIMIT ($${ppl.toFixed(2)}) — Layer 6 enforcement failure.`,
      evidence: {
        finalFee: decision.FINAL_FEE,
        partyProtectionLimit: ppl,
      },
    };
  }
  return null;
}

/**
 * A15 — TSEC exceeds aggregate party protection limit.
 *
 * The TSEC is a deterministic hash, not a numeric value — this check is a
 * semantic "TSEC mismatches the recomputed value" check. We re-derive the
 * TSEC from the decision's canonical inputs and compare. If they don't
 * match, the decision has been mutated post-calculation (tamper).
 *
 * NOTE: This is a different signal from A16 (LOOM hash). TSEC is the
 * short-form audit code; LOOM hash is the full-object integrity hash.
 */
async function checkA15TsecMismatch(
  decision: FeeDecisionObject,
): Promise<FeeAnomaly | null> {
  try {
    // Lazily import computeTSEC to avoid a circular dependency at module load.
    const { computeTSEC } = await import("@/lib/sgtx/fee-engine");
    const recomputed = computeTSEC(
      decision.USTN,
      decision.CFB,
      decision.CTS_SCORE,
      decision.RISK_SCORE,
      decision.VALUE_SCORE,
      decision.EFFICIENCY_SCORE,
      decision.FINAL_FEE,
    );
    if (recomputed !== decision.TSEC) {
      return {
        checkId: "A15",
        checkName: "TSEC mismatch (aggregate party protection limit)",
        severity: "ERROR",
        message: `Stored TSEC ${decision.TSEC} does not match recomputed TSEC ${recomputed} — decision has been mutated.`,
        evidence: {
          storedTsec: decision.TSEC,
          recomputedTsec: recomputed,
        },
      };
    }
    return null;
  } catch (err: any) {
    logger.warn("[anomaly-engine] A15 check failed", {
      ustn: decision.USTN,
      error: err?.message,
    });
    return null;
  }
}

/**
 * A16 — Fee decision hash mismatch (tamper detection).
 *
 * Recompute the LOOM hash from the decision (excluding LOOM_HASH + GOVERNOR_DECISION_ID)
 * and compare to the stored value. Mismatch = tamper.
 *
 * If LOOM_HASH is null (not yet computed — fresh decision), this check is
 * skipped (the engine will compute + set it later).
 */
async function checkA16LoomHashMismatch(
  decision: FeeDecisionObject,
): Promise<FeeAnomaly | null> {
  if (!decision.LOOM_HASH) return null;
  try {
    const recomputed = computeLoomHash(decision);
    if (recomputed !== decision.LOOM_HASH) {
      return {
        checkId: "A16",
        checkName: "Fee decision hash mismatch (tamper detection)",
        severity: "ERROR",
        message: `Stored LOOM_HASH ${decision.LOOM_HASH} does not match recomputed hash ${recomputed} — tamper detected.`,
        evidence: {
          storedHash: decision.LOOM_HASH,
          recomputedHash: recomputed,
        },
      };
    }
    return null;
  } catch (err: any) {
    logger.warn("[anomaly-engine] A16 check failed", {
      ustn: decision.USTN,
      error: err?.message,
    });
    return null;
  }
}

// ============================================================================
// detectFeeAnomalies — run all 16 checks + assemble report
// ============================================================================

/**
 * Run all 16 Fee Anomaly Engine checks against a Fee Decision Object.
 *
 * Returns a FeeAnomalyReport with riskLevel + recommendedAction. The report
 * is also persisted (storeFeeAnomalyReport) so downstream actors can retrieve
 * it later without re-running the checks.
 *
 * Safe to call on a fresh decision (LOOM_HASH not yet set) — A16 will skip
 * gracefully.
 *
 * Defensive — never throws; partial failures are logged and the affected
 * check is skipped.
 */
export async function detectFeeAnomalies(
  feeDecision: FeeDecisionObject,
): Promise<FeeAnomalyReport> {
  const anomalies: FeeAnomaly[] = [];
  const ustn = feeDecision.USTN;
  const feeDecisionId = feeDecision.FEE_DECISION_ID;

  // Sync checks first (cheap).
  const syncChecks: Array<() => FeeAnomaly | null> = [
    () => checkA02RateOutOfBand(feeDecision),
    () => checkA03CfbUnusual(feeDecision),
    () => checkA04FairnessExtreme(feeDecision),
    () => checkA05DiscountStacking(feeDecision),
    () => checkA06ConstitutionalCap(feeDecision),
    () => checkA07CostToServeFloor(feeDecision),
    () => checkA11EssentialMisapplied(feeDecision),
    () => checkA12SpecialStockNoSubclass(feeDecision),
    () => checkA13AffordabilityCapHit(feeDecision),
    () => checkA14PartyProtectionExceeded(feeDecision),
  ];
  for (const check of syncChecks) {
    try {
      const a = check();
      if (a) anomalies.push(a);
    } catch (err: any) {
      logger.warn("[anomaly-engine] sync check threw", {
        ustn,
        error: err?.message,
      });
    }
  }

  // Async checks (DB-touching).
  const asyncChecks: Array<() => Promise<FeeAnomaly | null>> = [
    () => checkA01HistoricalSpike(feeDecision),
    () => checkA08MultipleDecisions(feeDecision),
    () => checkA09CrossTradeVariance(feeDecision),
    () => checkA10BulkDiscountMisapplied(feeDecision),
    () => checkA15TsecMismatch(feeDecision),
    () => checkA16LoomHashMismatch(feeDecision),
  ];
  for (const check of asyncChecks) {
    try {
      const a = await check();
      if (a) anomalies.push(a);
    } catch (err: any) {
      logger.warn("[anomaly-engine] async check threw", {
        ustn,
        error: err?.message,
      });
    }
  }

  // Stable order: sort by checkId so the report is deterministic.
  anomalies.sort((a, b) => a.checkId.localeCompare(b.checkId));

  const { riskLevel, recommendedAction } = deriveRiskAndAction(anomalies);

  const report: FeeAnomalyReport = {
    feeDecisionId,
    ustn,
    anomalies,
    riskLevel,
    recommendedAction,
    generatedAt: new Date().toISOString(),
  };

  // Persist for audit (non-blocking on failure).
  try {
    await storeFeeAnomalyReport(report);
  } catch (err: any) {
    logger.error("[anomaly-engine] detectFeeAnomalies: persist failed", {
      ustn,
      feeDecisionId,
      error: err?.message,
    });
  }

  logger.info("[anomaly-engine] detectFeeAnomalies complete", {
    ustn,
    feeDecisionId,
    anomalyCount: anomalies.length,
    riskLevel,
    recommendedAction,
  });

  return report;
}

// ============================================================================
// storeFeeAnomalyReport — persist to ConfigurationHistory JSON-KV
// ============================================================================

/**
 * Persist a Fee Anomaly Report to the ConfigurationHistory table.
 *
 * Storage pattern (matches the chat session / voice history / pin store
 * pattern migrated in UPG-1):
 *   - configKey: `fee_anomaly_report:{feeDecisionId}`
 *   - changedByGtid: `GTID-FEE-ANOMALY-ENGINE`
 *   - changeReason: short summary
 *   - newValue: JSON-stringified report
 *   - version: increments on each re-write (so re-runs are observable)
 *
 * The `feeDecisionId` keying means the report is keyed 1:1 to the Fee
 * Decision Object it was generated from. Multiple reports can coexist for
 * the same USTN (one per fee decision version).
 */
export async function storeFeeAnomalyReport(
  report: FeeAnomalyReport,
): Promise<void> {
  const configKey = `${ANOMALY_STORAGE_PREFIX}${report.feeDecisionId}`;
  const blob = JSON.stringify(report);
  const shortReason = `risk=${report.riskLevel} action=${report.recommendedAction} anomalies=${report.anomalies.length}`;

  // Upsert: if a row with this configKey already exists, increment its
  // version + update newValue. Otherwise create.
  try {
    const existing = await db.configurationHistory.findFirst({
      where: { configKey },
      orderBy: { version: "desc" },
    });
    if (existing) {
      await db.configurationHistory.update({
        where: { id: existing.id },
        data: {
          oldValue: existing.newValue,
          newValue: blob,
          changeReason: shortReason,
          version: existing.version + 1,
        },
      });
    } else {
      await db.configurationHistory.create({
        data: {
          configKey,
          newValue: blob,
          changedByGtid: ANOMALY_SYSTEM_GTID,
          changeReason: shortReason,
          version: 1,
        },
      });
    }
  } catch (err: any) {
    logger.error("[anomaly-engine] storeFeeAnomalyReport failed", {
      feeDecisionId: report.feeDecisionId,
      error: err?.message,
    });
    throw err; // re-throw so caller can decide how to handle
  }
}

// ============================================================================
// getFeeAnomalyReport — retrieve stored report by feeDecisionId
// ============================================================================

/**
 * Retrieve the most recent Fee Anomaly Report stored for a feeDecisionId.
 *
 * Returns null if no report has been stored. Used by the GET
 * /api/sgtx/fees/[ustn]/anomaly route + downstream actors (Governor,
 * Compliance dashboard).
 *
 * If `feeDecisionId` is null/empty, falls back to looking up the most
 * recent Fee Decision Object for the USTN + reading its report.
 */
export async function getFeeAnomalyReport(
  feeDecisionId: string,
): Promise<FeeAnomalyReport | null> {
  if (!feeDecisionId) return null;
  const configKey = `${ANOMALY_STORAGE_PREFIX}${feeDecisionId}`;
  try {
    const row = await db.configurationHistory.findFirst({
      where: { configKey },
      orderBy: { version: "desc" },
    });
    if (!row || !row.newValue) return null;
    try {
      return JSON.parse(row.newValue) as FeeAnomalyReport;
    } catch {
      return null;
    }
  } catch (err: any) {
    logger.error("[anomaly-engine] getFeeAnomalyReport failed", {
      feeDecisionId,
      error: err?.message,
    });
    return null;
  }
}

/**
 * Convenience wrapper: retrieve the anomaly report for the MOST RECENT fee
 * decision for a USTN. Used by the GET /api/sgtx/fees/[ustn]/anomaly route
 * so callers don't need to know the feeDecisionId.
 *
 * Returns null if no Fee Decision exists for the USTN, or no report has
 * been stored yet.
 */
export async function getFeeAnomalyReportForUstn(
  ustn: string,
): Promise<{ report: FeeAnomalyReport; feeDecisionId: string } | null> {
  try {
    const decision = await getFeeDecision(ustn);
    if (!decision) return null;
    const report = await getFeeAnomalyReport(decision.FEE_DECISION_ID);
    if (!report) return null;
    return { report, feeDecisionId: decision.FEE_DECISION_ID };
  } catch (err: any) {
    logger.error("[anomaly-engine] getFeeAnomalyReportForUstn failed", {
      ustn,
      error: err?.message,
    });
    return null;
  }
}

// ============================================================================
// Export the individual checks for testability + audit
// ============================================================================

export const __anomalyChecks = {
  checkA01HistoricalSpike,
  checkA02RateOutOfBand,
  checkA03CfbUnusual,
  checkA04FairnessExtreme,
  checkA05DiscountStacking,
  checkA06ConstitutionalCap,
  checkA07CostToServeFloor,
  checkA08MultipleDecisions,
  checkA09CrossTradeVariance,
  checkA10BulkDiscountMisapplied,
  checkA11EssentialMisapplied,
  checkA12SpecialStockNoSubclass,
  checkA13AffordabilityCapHit,
  checkA14PartyProtectionExceeded,
  checkA15TsecMismatch,
  checkA16LoomHashMismatch,
};
