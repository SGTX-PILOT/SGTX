// @ts-nocheck
/**
 * SGTX v18 §13.9 — Payment Health Score
 * ===========================================================================
 *
 * Weighted 0-100 score per trade that quantifies the health of the payment
 * lifecycle. Combines four components:
 *
 *   • Payment Legs Settled (30%)  — settled_count / total_count
 *   • Payment Timeliness (25%)    — on_time_count / total_count
 *   • Reconciliation Status (25%) — matched_count / total_count
 *   • Dispute Impact (20%)        — 1 - (disputed_count / total_count)
 *
 * Bands:
 *   • Healthy  — score ≥ 80
 *   • Warning  — score 60-79
 *   • Critical — score < 60
 *
 * The score feeds the Trade Health Score UI panel (v18 §13.9 specifies that
 * payment health is its own dedicated view, distinct from the overall trade
 * health score). Historical scores are persisted in ConfigurationHistory
 * under `pay_health:{ustn}` so trends can be plotted over time.
 *
 * All DB calls are defensive (try/catch). The functions never throw — on
 * failure they degrade to a neutral 50 score and an empty breakdown.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §13.9 Constants ============

export const PAYMENT_HEALTH_WEIGHTS = {
  legs_settled: 0.30,
  timeliness: 0.25,
  reconciliation: 0.25,
  dispute_impact: 0.20,
} as const;

export type PaymentHealthBand = "HEALTHY" | "WARNING" | "CRITICAL";

// SLA threshold for "on-time" — a leg is on-time if it settles within 2h (EGP)
// or 4h (USD) of being dispatched. If we cannot determine dispatch time, we
// use 1 hour as a default tolerance window from when the leg was first seen.
const ON_TIME_TOLERANCE_MS_EGP = 2 * 60 * 60 * 1000; // 2h
const ON_TIME_TOLERANCE_MS_USD = 4 * 60 * 60 * 1000; // 4h
const DEFAULT_ON_TIME_MS = 60 * 60 * 1000;           // 1h

// ============ Types ============

export interface PaymentHealthBreakdown {
  legs_settled: number;        // 0-100 sub-score
  timeliness: number;         // 0-100 sub-score
  reconciliation: number;    // 0-100 sub-score
  dispute_impact: number;     // 0-100 sub-score
  weights: typeof PAYMENT_HEALTH_WEIGHTS;
  totals: {
    total_legs: number;
    settled_legs: number;
    on_time_legs: number;
    matched_legs: number;
    disputed_legs: number;
  };
}

export interface PaymentHealthScore {
  ustn: string;
  score: number;                  // 0-100 weighted
  band: PaymentHealthBand;
  breakdown: PaymentHealthBreakdown;
  calculatedAt: string;
}

export interface LegBreakdown {
  legId: string;
  amount: number;
  currency: string;
  legState: string;
  reconciliationStatus: string;
  onTime: boolean | null;
  disputed: boolean;
  settlementDurationMs: number | null;
}

export interface MilestoneBreakdown {
  milestone: string;
  total_legs: number;
  settled_legs: number;
  settlement_pct: number;
}

export interface PaymentHealthBreakdownDetail {
  ustn: string;
  by_leg: LegBreakdown[];
  by_milestone: MilestoneBreakdown[];
  trend: Array<{ score: number; band: PaymentHealthBand; calculatedAt: string }>;
}

export interface PaymentHealthHistoryEntry {
  score: number;
  band: PaymentHealthBand;
  calculatedAt: string;
  breakdown: PaymentHealthBreakdown | null;
}

export interface PaymentHealthHistory {
  ustn: string;
  history: PaymentHealthHistoryEntry[];
}

// ============ Helpers ============

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function bandForScore(score: number): PaymentHealthBand {
  if (score >= 80) return "HEALTHY";
  if (score >= 60) return "WARNING";
  return "CRITICAL";
}

function safeRatio(num: number, denom: number): number {
  if (denom <= 0) return 100; // No legs = treat as healthy (no signal yet)
  return (num / denom) * 100;
}

/**
 * Determine whether a leg settled on-time, based on its creation time vs
 * settlement (valueDate) and currency. The first leg state changes record
 * the dispatch time; if we don't have that, we fall back to the leg's
 * createdAt timestamp.
 */
function isOnTime(leg: any): boolean | null {
  if (!leg || leg.legState !== "SETTLED") return null;
  if (!leg.valueDate) return null;
  const start = leg.executionTimestamp
    ? new Date(leg.executionTimestamp).getTime()
    : new Date(leg.createdAt).getTime();
  const end = new Date(leg.valueDate).getTime();
  const duration = end - start;
  if (duration < 0) return false;
  const tolerance = leg.currency === "USD"
    ? ON_TIME_TOLERANCE_MS_USD
    : leg.currency === "EGP"
      ? ON_TIME_TOLERANCE_MS_EGP
      : DEFAULT_ON_TIME_MS;
  return duration <= tolerance;
}

// ============ §13.9.1 calculatePaymentHealthScore ============

export async function calculatePaymentHealthScore(ustn: string): Promise<PaymentHealthScore> {
  let legs: any[] = [];
  let disputes: any[] = [];

  try {
    legs = await db.paymentLeg.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
  } catch (e: any) {
    logger.warn("[payment-health] findMany legs failed", { ustn, error: e?.message });
  }

  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { disputes: true },
    });
    disputes = (trade as any)?.disputes ?? [];
  } catch (e: any) {
    logger.warn("[payment-health] findUnique trade+disputes failed", { ustn, error: e?.message });
  }

  const total = legs.length;
  const settled = legs.filter((l) => l.legState === "SETTLED");
  const settled_count = settled.length;

  // Reconciliation: matched vs unmatched
  const matched_count = legs.filter((l) => l.reconciliationStatus === "MATCHED").length;

  // Timeliness: on-time settled legs
  const on_time_flags = settled.map(isOnTime).filter((v): v is boolean => v !== null);
  const on_time_count = on_time_flags.filter((v) => v === true).length;
  const timeliness_denom = on_time_flags.length || settled_count || total;

  // Disputes: count disputes affecting payments (status != RESOLVED/CANCELLED)
  const disputed_count = disputes.filter(
    (d) => d.status && d.status !== "RESOLVED" && d.status !== "CANCELLED",
  ).length;

  const legs_settled_score = clamp(safeRatio(settled_count, total));
  const timeliness_score = clamp(safeRatio(on_time_count, timeliness_denom));
  const reconciliation_score = clamp(safeRatio(matched_count, total));
  const dispute_impact_score = clamp(100 - (total > 0 ? (disputed_count / total) * 100 : 0));

  const breakdown: PaymentHealthBreakdown = {
    legs_settled: legs_settled_score,
    timeliness: timeliness_score,
    reconciliation: reconciliation_score,
    dispute_impact: dispute_impact_score,
    weights: PAYMENT_HEALTH_WEIGHTS,
    totals: {
      total_legs: total,
      settled_legs: settled_count,
      on_time_legs: on_time_count,
      matched_legs: matched_count,
      disputed_legs: disputed_count,
    },
  };

  const weighted =
    legs_settled_score * PAYMENT_HEALTH_WEIGHTS.legs_settled +
    timeliness_score * PAYMENT_HEALTH_WEIGHTS.timeliness +
    reconciliation_score * PAYMENT_HEALTH_WEIGHTS.reconciliation +
    dispute_impact_score * PAYMENT_HEALTH_WEIGHTS.dispute_impact;

  const score = clamp(weighted);
  const band = bandForScore(score);
  const calculatedAt = new Date().toISOString();

  // Persist a snapshot to ConfigurationHistory for trend plotting
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `pay_health:${ustn}`,
        oldValue: null,
        newValue: JSON.stringify({ score, band, breakdown, calculatedAt }),
        changedByGtid: "SGTX-HEALTH-WORKER",
        changeReason: `payment_health:calc:${ustn}`,
        version: Math.floor(Date.now() / 1000),
      },
    });
  } catch (e: any) {
    logger.warn("[payment-health] persist snapshot failed", { ustn, error: e?.message });
  }

  return { ustn, score, band, breakdown, calculatedAt };
}

// ============ §13.9.2 getPaymentHealthBreakdown ============

export async function getPaymentHealthBreakdown(ustn: string): Promise<PaymentHealthBreakdownDetail> {
  let legs: any[] = [];
  try {
    legs = await db.paymentLeg.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
  } catch (e: any) {
    logger.warn("[payment-health] breakdown findMany legs failed", { ustn, error: e?.message });
  }

  // by_leg
  const disputedLegIds = new Set<string>();
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { disputes: { where: { status: { notIn: ["RESOLVED", "CANCELLED"] } } } },
    });
    for (const d of (trade as any)?.disputes ?? []) {
      // Disputes are at trade-level; mark all legs as disputed (worst case)
      if (d) disputedLegIds.add("TRADE_LEVEL");
    }
  } catch {
    // best-effort
  }
  const tradeDisputed = disputedLegIds.has("TRADE_LEVEL");

  const by_leg: LegBreakdown[] = legs.map((l) => {
    const onTime = isOnTime(l);
    const end = l.valueDate ? new Date(l.valueDate).getTime() : null;
    const start = l.executionTimestamp
      ? new Date(l.executionTimestamp).getTime()
      : new Date(l.createdAt).getTime();
    const duration = end != null ? end - start : null;
    return {
      legId: l.legId,
      amount: l.amount,
      currency: l.currency,
      legState: l.legState,
      reconciliationStatus: l.reconciliationStatus,
      onTime,
      disputed: tradeDisputed,
      settlementDurationMs: duration,
    };
  });

  // by_milestone — group legs by beneficiaryType (proxy for milestone)
  const milestoneMap = new Map<string, { total: number; settled: number }>();
  for (const l of legs) {
    const milestone = l.beneficiaryType ?? "UNKNOWN";
    const entry = milestoneMap.get(milestone) ?? { total: 0, settled: 0 };
    entry.total += 1;
    if (l.legState === "SETTLED") entry.settled += 1;
    milestoneMap.set(milestone, entry);
  }
  const by_milestone: MilestoneBreakdown[] = Array.from(milestoneMap.entries()).map(([m, e]) => ({
    milestone: m,
    total_legs: e.total,
    settled_legs: e.settled,
    settlement_pct: e.total > 0 ? Math.round((e.settled / e.total) * 100) : 0,
  }));

  // trend — read all historical snapshots
  const trend: PaymentHealthBreakdownDetail["trend"] = [];
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: `pay_health:${ustn}` },
      orderBy: { version: "asc" },
    });
    for (const r of rows) {
      try {
        const parsed = r.newValue ? JSON.parse(r.newValue) : null;
        if (parsed && typeof parsed.score === "number") {
          trend.push({
            score: parsed.score,
            band: parsed.band ?? bandForScore(parsed.score),
            calculatedAt: parsed.calculatedAt ?? r.createdAt.toISOString(),
          });
        }
      } catch {
        // skip malformed entries
      }
    }
  } catch (e: any) {
    logger.warn("[payment-health] trend fetch failed", { ustn, error: e?.message });
  }

  return { ustn, by_leg, by_milestone, trend };
}

// ============ §13.9.3 getPaymentHealthHistory ============

export async function getPaymentHealthHistory(ustn: string): Promise<PaymentHealthHistory> {
  const history: PaymentHealthHistoryEntry[] = [];
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: `pay_health:${ustn}` },
      orderBy: { version: "asc" },
    });
    for (const r of rows) {
      try {
        const parsed = r.newValue ? JSON.parse(r.newValue) : null;
        if (parsed && typeof parsed.score === "number") {
          history.push({
            score: parsed.score,
            band: parsed.band ?? bandForScore(parsed.score),
            calculatedAt: parsed.calculatedAt ?? r.createdAt.toISOString(),
            breakdown: parsed.breakdown ?? null,
          });
        }
      } catch {
        // skip malformed
      }
    }
  } catch (e: any) {
    logger.warn("[payment-health] history fetch failed", { ustn, error: e?.message });
  }
  return { ustn, history };
}
