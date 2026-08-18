// SGTX Reefer Power Tracking Engine — Part XV (CCL-009)
// ============================================================================
// Pure calculation engine for reefer-container power consumption costs at
// terminal yards. Distinct from `src/lib/sgtx/execution/reefer-telemetry.ts`
// which tracks continuous temperature/power telemetry for quality management.
// This module handles COST ACCRUAL — converting plug-in / plug-out events
// into a chargeable dollar amount that becomes a TradeCostObligation row
// (obligationType = REEFER_POWER, recipientClass = PORT_TERMINAL).
//
// Status lifecycle (per Prisma model):
//   NOT_CONNECTED  → no powerStartAt yet
//   CONNECTED      → powerStartAt set, no powerEndAt, chargeableHours < 1
//   POWER_ACTIVE   → powerStartAt set, chargeableHours ≥ 1, no powerEndAt
//   POWER_ENDED    → powerEndAt set, awaiting finalization
//   FINALIZED      → cost calculated and pushed to TradeCostObligation
//
// Tariff model: per-day rate (partial days rounded up). Optional monitoring
// charge (flat per session). Optional additional charges (extension cords,
// PTI, etc.) passed through verbatim.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ReeferPowerInput {
  containerNumber: string;
  powerStartAt: Date | string;
  powerEndAt?: Date | string | null;
  applicableTariff: number; // per day, in currency units
  monitoringCharge?: number;
  additionalCharges?: number;
  asOf?: Date | string;
}

export interface ReeferPowerCalculation {
  containerNumber: string;
  powerStartAt: Date;
  powerEndAt: Date | null;
  chargeableHours: number;
  chargeableDays: number; // partial days rounded UP
  applicableTariff: number;
  monitoringCharge: number;
  additionalCharges: number;
  totalAmount: number;
  currency: string; // populated by caller via input.currency
  status: string; // derived status
}

export type ReeferStatus =
  | "NOT_CONNECTED"
  | "CONNECTED"
  | "POWER_ACTIVE"
  | "POWER_ENDED"
  | "FINALIZED";

// ---------------------------------------------------------------------------
// Status derivation (pure)
// ---------------------------------------------------------------------------
export function deriveReeferStatus(
  powerStartAt?: Date | string | null,
  powerEndAt?: Date | string | null,
  asOf: Date | string = new Date(),
): ReeferStatus {
  const start = toDate(powerStartAt);
  const end = toDate(powerEndAt);
  const now = toDate(asOf) ?? new Date();

  if (!start) return "NOT_CONNECTED";
  if (end && end.getTime() <= now.getTime()) return "POWER_ENDED";

  const hours = (now.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (hours < 1) return "CONNECTED";
  return "POWER_ACTIVE";
}

// ---------------------------------------------------------------------------
// Main calculation (pure)
// ---------------------------------------------------------------------------
export function calculateReeferPower(input: ReeferPowerInput): ReeferPowerCalculation {
  const start = toDate(input.powerStartAt);
  if (!start) {
    throw new Error("powerStartAt is required and must be a valid date");
  }
  const end = toDate(input.powerEndAt) ?? null;
  const asOf = toDate(input.asOf ?? new Date()) ?? new Date();

  // Effective end: explicit > now (for live accrual)
  const effectiveEnd = end ?? asOf;
  // Chargeable hours: max(0, end - start)
  const chargeableMs = Math.max(0, effectiveEnd.getTime() - start.getTime());
  const chargeableHours = chargeableMs / (1000 * 60 * 60);
  // Chargeable days: rounded up to whole days (terminal billing practice)
  const chargeableDays = Math.max(1, Math.ceil(chargeableHours / 24));

  const tariff = typeof input.applicableTariff === "number" && input.applicableTariff >= 0
    ? input.applicableTariff
    : 0;
  const monitoring = typeof input.monitoringCharge === "number" && input.monitoringCharge >= 0
    ? input.monitoringCharge
    : 0;
  const additional = typeof input.additionalCharges === "number" && input.additionalCharges >= 0
    ? input.additionalCharges
    : 0;

  const totalAmount = round2(chargeableDays * tariff + monitoring + additional);

  return {
    containerNumber: input.containerNumber,
    powerStartAt: start,
    powerEndAt: end,
    chargeableHours: round2(chargeableHours),
    chargeableDays,
    applicableTariff: tariff,
    monitoringCharge: monitoring,
    additionalCharges: additional,
    totalAmount,
    currency: "USD", // populated by caller; default to USD
    status: deriveReeferStatus(start, end, asOf),
  };
}

// ---------------------------------------------------------------------------
// Persistence (called by API route)
// ---------------------------------------------------------------------------
export interface ReeferPowerPersistInput {
  ustn: string;
  containerNumber: string;
  carrierGtid?: string;
  terminalGtid?: string;
  calc: ReeferPowerCalculation;
  currency?: string;
  obligationId?: string;
}

export async function persistReeferPowerTracking(
  input: ReeferPowerPersistInput,
): Promise<{ id: string } | null> {
  const { ustn, containerNumber, calc, currency = "USD" } = input;
  try {
    const created = await db.reeferPowerTracking.create({
      data: {
        ustn,
        containerNumber,
        carrierGtid: input.carrierGtid ?? null,
        terminalGtid: input.terminalGtid ?? null,
        plugInRequired: true,
        powerStartAt: calc.powerStartAt,
        powerEndAt: calc.powerEndAt,
        chargeableHours: calc.chargeableHours,
        chargeableDays: calc.chargeableDays,
        applicableTariff: calc.applicableTariff,
        monitoringCharge: calc.monitoringCharge,
        additionalCharges: calc.additionalCharges,
        totalAmount: calc.totalAmount,
        currency,
        status: calc.status,
        obligationId: input.obligationId ?? null,
      },
    });
    return { id: created.id };
  } catch (e: any) {
    logger.error("[reefer-power] persistReeferPowerTracking failed", {
      ustn,
      containerNumber,
      error: e?.message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  try {
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
