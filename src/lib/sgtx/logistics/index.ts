// SGTX Logistics Orchestration (P0 Core Integrity)
//
// Normalized Logistics Quote System covering Mode A (manual seller quote),
// Mode B (LSP RFQ), and Mode C (Ship-line RFQ). Every quote is a versioned,
// immutable record with surcharges, assumptions, exclusions, capacity,
// booking, service-commitment, drift monitoring, fallback, route-feasibility
// and provider eligibility — all factual, never scored / ranked.
//
// Design constraints (P0 Core Integrity):
//   • No match-score, ranking, or recommendation anywhere.
//   • Provider "eligibility" is a binary factual gate (license, insurance,
//     sanctions, capability, capacity) — not a score.
//   • Quote updates always create a new version row; the live row is the
//     current pointer (`currentVersion`, `supersededBy`).
//   • Capacity and Booking are explicit transitions with Governor gates.
//   • Drift detection compares the current state to the SELECTED version
//     snapshot, not to a recomputed "expected" value.
//   • Fallback activation is always seller-initiated and Governor-gated —
//     never automatic.
//   • Cost certainty aggregates every quote for a USTN by status; margin
//     at risk is a seller-only advisory that never auto-blocks the trade.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type LogisticsMode = "MODE_A" | "MODE_B" | "MODE_C";

export type LogisticsServiceType =
  | "TRUCKING"
  | "WAREHOUSING"
  | "CUSTOMS_BROKERAGE"
  | "OCEAN_FREIGHT"
  | "THC"
  | "INSURANCE"
  | "DESTINATION_HANDLING";

export type QuoteStatus =
  | "DRAFT"
  | "REQUESTED"
  | "QUOTED"
  | "EXPIRING"
  | "EXPIRED"
  | "RECONFIRM_REQUIRED"
  | "SELECTED"
  | "CAPACITY_PENDING"
  | "CAPACITY_CONFIRMED"
  | "BOOKING_PENDING"
  | "BOOKED"
  | "CANCELLED"
  | "SUPERSEDED";

export type CapacityStatus =
  | "PENDING"
  | "AVAILABLE"
  | "HELD"
  | "CONFIRMED"
  | "LOST";

export type DriftType =
  | "PRICE_CHANGE"
  | "SURCHARGE_CHANGE"
  | "CAPACITY_LOST"
  | "SCHEDULE_CHANGE"
  | "BOOKING_CHANGE"
  | "INVOICE_VARIANCE";

export type FeasibilityStatus =
  | "FEASIBLE"
  | "CONDITIONALLY_FEASIBLE"
  | "NOT_FEASIBLE";

export type FallbackLevel = "PRIMARY" | "BACKUP" | "EMERGENCY";

export type SurchargeType =
  | "FUEL"
  | "BUNKER"
  | "PEAK_SEASON"
  | "THC"
  | "PORT_CHARGES"
  | "DOCUMENTATION"
  | "REEFER"
  | "WAITING"
  | "DEMURRAGE"
  | "DETENTION"
  | "STORAGE"
  | "HOLIDAY"
  | "EQUIPMENT_IMBALANCE"
  | "INSPECTION"
  | "CUSTOMS_EXTRAS";

export type ProviderType = "LSP" | "SHIP" | "CBR";

// ============ Helpers ============

function todayYmd(): string {
  const t = new Date();
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}

async function nextQuoteSeq(ymd: string): Promise<number> {
  // Find the highest sequence used for the same date prefix
  const prefix = `LQ-${ymd}-`;
  const recent = await db.logisticsQuote.findMany({
    where: { quoteId: { startsWith: prefix } },
    select: { quoteId: true },
    take: 200,
  });
  let max = 0;
  for (const r of recent) {
    const tail = r.quoteId.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

export async function generateQuoteId(): Promise<string> {
  const ymd = todayYmd();
  const seq = await nextQuoteSeq(ymd);
  return `LQ-${ymd}-${String(seq).padStart(5, "0")}`;
}

function safeParse<T = any>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ============ 1. Normalized Quote CRUD ============

export interface CreateLogisticsQuoteInput {
  ustn: string;
  tradeId: string;
  serviceType: LogisticsServiceType;
  sourceMode: LogisticsMode;
  providerGtid?: string | null;
  providerType?: ProviderType | null;
  origin?: string;
  destination?: string;
  route?: string;
  commodity?: string;
  quantity?: number;
  weightKg?: number;
  volumeCbm?: number;
  equipmentType?: string;
  equipmentCount?: number;
  currency?: string;
  baseCost?: number;
  knownSurcharges?: Array<{ type: SurchargeType; amount: number; description?: string }>;
  conditionalCost?: Array<{
    type: SurchargeType;
    amount: number;
    description?: string;
    condition: string;
  }>;
  excludedCost?: Array<{ type: SurchargeType; description: string }>;
  issuedAt?: Date;
  validUntil?: Date;
  sailingDate?: Date;
  cutoffDate?: Date;
  assumptions?: Array<{ key: string; value: string }>;
  exclusions?: Array<{ key: string; value: string }>;
  conditions?: Array<{ condition: string; description: string }>;
  cancellationTerms?: string;
  pickupCommitment?: Date;
  deliveryCommitment?: Date;
  responseSLA?: number;
  liability?: string;
  documentationResp?: string;
  penaltyTerms?: string;
  escalationProcess?: string;
  isFallback?: boolean;
  fallbackLevel?: FallbackLevel;
  fallbackParentId?: string;
  actorGtid?: string;
}

export async function createLogisticsQuote(
  input: CreateLogisticsQuoteInput,
): Promise<{ quote: any; version: any }> {
  const quoteId = await generateQuoteId();

  const knownSurchargesJson = JSON.stringify(input.knownSurcharges || []);
  const conditionalCostJson = JSON.stringify(input.conditionalCost || []);
  const excludedCostJson = JSON.stringify(input.excludedCost || []);
  const assumptionsJson = JSON.stringify(input.assumptions || []);
  const conditionsJson = JSON.stringify(input.conditions || []);

  const baseCost = input.baseCost ?? 0;
  const knownTotal = (input.knownSurcharges || []).reduce(
    (sum, s) => sum + (s.amount || 0),
    0,
  );
  const conditionalTotal = (input.conditionalCost || []).reduce(
    (sum, s) => sum + (s.amount || 0),
    0,
  );
  const estimatedTotal = baseCost + knownTotal;
  const maximumExposure = baseCost + knownTotal + conditionalTotal;

  const quote = await db.logisticsQuote.create({
    data: {
      quoteId,
      ustn: input.ustn,
      tradeId: input.tradeId,
      serviceType: input.serviceType,
      sourceMode: input.sourceMode,
      providerGtid: input.providerGtid ?? null,
      providerType: input.providerType ?? null,
      status: input.sourceMode === "MODE_A" ? "QUOTED" : "REQUESTED",
      currentVersion: 1,
      origin: input.origin ?? null,
      destination: input.destination ?? null,
      route: input.route ?? null,
      commodity: input.commodity ?? null,
      quantity: input.quantity ?? null,
      weightKg: input.weightKg ?? null,
      volumeCbm: input.volumeCbm ?? null,
      equipmentType: input.equipmentType ?? null,
      equipmentCount: input.equipmentCount ?? 1,
      currency: input.currency ?? "USD",
      baseCost,
      knownSurchargesJson,
      conditionalCostJson,
      excludedCostJson,
      estimatedTotal,
      maximumExposure,
      issuedAt: input.issuedAt ?? (input.sourceMode === "MODE_A" ? new Date() : null),
      validUntil: input.validUntil ?? null,
      sailingDate: input.sailingDate ?? null,
      cutoffDate: input.cutoffDate ?? null,
      assumptionsJson,
      conditionsJson,
      cancellationTerms: input.cancellationTerms ?? null,
      pickupCommitment: input.pickupCommitment ?? null,
      deliveryCommitment: input.deliveryCommitment ?? null,
      responseSLA: input.responseSLA ?? null,
      liability: input.liability ?? null,
      documentationResp: input.documentationResp ?? null,
      penaltyTerms: input.penaltyTerms ?? null,
      escalationProcess: input.escalationProcess ?? null,
      isFallback: input.isFallback ?? false,
      fallbackLevel: input.fallbackLevel ?? null,
      fallbackParentId: input.fallbackParentId ?? null,
    },
  });

  // Initial version row (v1)
  const version = await db.logisticsQuoteVersion.create({
    data: {
      quoteId,
      version: 1,
      actorGtid: input.actorGtid || "SYSTEM",
      reason: "Initial creation",
      beforeJson: "{}",
      afterJson: JSON.stringify({
        status: quote.status,
        baseCost,
        knownTotal,
        conditionalTotal,
        estimatedTotal,
        maximumExposure,
      }),
    },
  });

  // Persist surcharges as discrete rows
  if ((input.knownSurcharges || []).length > 0) {
    await db.logisticsQuoteSurcharge.createMany({
      data: (input.knownSurcharges || []).map((s) => ({
        quoteId,
        surchargeType: s.type,
        amount: s.amount,
        currency: input.currency ?? "USD",
        description: s.description ?? null,
        isConditional: false,
        isExcluded: false,
      })),
    });
  }
  if ((input.conditionalCost || []).length > 0) {
    await db.logisticsQuoteSurcharge.createMany({
      data: (input.conditionalCost || []).map((s) => ({
        quoteId,
        surchargeType: s.type,
        amount: s.amount,
        currency: input.currency ?? "USD",
        description: s.description ?? null,
        isConditional: true,
        condition: s.condition,
        isExcluded: false,
      })),
    });
  }
  if ((input.excludedCost || []).length > 0) {
    await db.logisticsQuoteSurcharge.createMany({
      data: (input.excludedCost || []).map((s) => ({
        quoteId,
        surchargeType: s.type,
        amount: 0,
        currency: input.currency ?? "USD",
        description: s.description,
        isConditional: false,
        isExcluded: true,
      })),
    });
  }

  // Persist assumptions + exclusions as discrete rows
  if ((input.assumptions || []).length > 0) {
    await db.logisticsQuoteAssumption.createMany({
      data: (input.assumptions || []).map((a) => ({
        quoteId,
        key: a.key,
        value: a.value,
        isExclusion: false,
      })),
    });
  }
  if ((input.exclusions || []).length > 0) {
    await db.logisticsQuoteAssumption.createMany({
      data: (input.exclusions || []).map((a) => ({
        quoteId,
        key: a.key,
        value: a.value,
        isExclusion: true,
      })),
    });
  }

  return { quote, version };
}

export async function getLogisticsQuote(quoteId: string): Promise<any | null> {
  const quote = await db.logisticsQuote.findUnique({
    where: { quoteId },
  });
  if (!quote) return null;

  const [versions, surcharges, assumptions, capacities, bookings, commitments, feasibility, drifts] =
    await Promise.all([
      db.logisticsQuoteVersion.findMany({
        where: { quoteId },
        orderBy: { version: "asc" },
      }),
      db.logisticsQuoteSurcharge.findMany({ where: { quoteId } }),
      db.logisticsQuoteAssumption.findMany({ where: { quoteId } }),
      db.logisticsCapacity.findMany({ where: { quoteId } }),
      db.logisticsBooking.findMany({ where: { quoteId } }),
      db.logisticsServiceCommitment.findMany({ where: { quoteId } }),
      db.logisticsRouteFeasibility.findMany({ where: { quoteId } }),
      db.logisticsDriftEvent.findMany({
        where: { quoteId },
        orderBy: { detectedAt: "desc" },
      }),
    ]);

  return {
    ...quote,
    knownSurcharges: safeParse(quote.knownSurchargesJson, []),
    conditionalCost: safeParse(quote.conditionalCostJson, []),
    excludedCost: safeParse(quote.excludedCostJson, []),
    assumptions: safeParse(quote.assumptionsJson, []),
    conditions: safeParse(quote.conditionsJson, []),
    versions,
    surcharges,
    assumptionRows: assumptions,
    capacities,
    bookings,
    commitments,
    feasibility,
    drifts,
  };
}

export async function updateLogisticsQuote(
  quoteId: string,
  updates: Record<string, any>,
  actorGtid: string,
  reason: string,
): Promise<{ quote: any; version: any }> {
  const current = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!current) throw new Error(`Quote ${quoteId} not found`);

  const beforeSnapshot = JSON.stringify({
    status: current.status,
    baseCost: current.baseCost,
    estimatedTotal: current.estimatedTotal,
    maximumExposure: current.maximumExposure,
    capacityStatus: current.capacityStatus,
    validUntil: current.validUntil,
    sailingDate: current.sailingDate,
    cutoffDate: current.cutoffDate,
  });

  // Recompute totals if pricing fields were updated
  const mergedKnown = updates.knownSurcharges
    ? (updates.knownSurcharges as Array<{ amount: number }>)
    : safeParse(current.knownSurchargesJson, []);
  const mergedConditional = updates.conditionalCost
    ? (updates.conditionalCost as Array<{ amount: number }>)
    : safeParse(current.conditionalCostJson, []);

  const newBase = typeof updates.baseCost === "number" ? updates.baseCost : current.baseCost;
  const knownTotal = mergedKnown.reduce((s, x) => s + (x.amount || 0), 0);
  const conditionalTotal = mergedConditional.reduce((s, x) => s + (x.amount || 0), 0);
  const estimatedTotal = newBase + knownTotal;
  const maximumExposure = newBase + knownTotal + conditionalTotal;

  const data: Record<string, any> = { ...updates };
  if (updates.knownSurcharges) data.knownSurchargesJson = JSON.stringify(updates.knownSurcharges);
  if (updates.conditionalCost) data.conditionalCostJson = JSON.stringify(updates.conditionalCost);
  if (updates.excludedCost) data.excludedCostJson = JSON.stringify(updates.excludedCost);
  if (updates.assumptions) data.assumptionsJson = JSON.stringify(updates.assumptions);
  if (updates.conditions) data.conditionsJson = JSON.stringify(updates.conditions);
  data.baseCost = newBase;
  data.estimatedTotal = estimatedTotal;
  data.maximumExposure = maximumExposure;
  data.currentVersion = current.currentVersion + 1;
  // Strip nested arrays from raw data
  delete data.knownSurcharges;
  delete data.conditionalCost;
  delete data.excludedCost;
  delete data.assumptions;
  delete data.exclusions;
  delete data.conditions;

  const quote = await db.logisticsQuote.update({
    where: { quoteId },
    data,
  });

  const afterSnapshot = JSON.stringify({
    status: quote.status,
    baseCost: quote.baseCost,
    estimatedTotal: quote.estimatedTotal,
    maximumExposure: quote.maximumExposure,
    capacityStatus: quote.capacityStatus,
    validUntil: quote.validUntil,
    sailingDate: quote.sailingDate,
    cutoffDate: quote.cutoffDate,
  });

  const version = await db.logisticsQuoteVersion.create({
    data: {
      quoteId,
      version: quote.currentVersion,
      actorGtid,
      reason,
      beforeJson: beforeSnapshot,
      afterJson: afterSnapshot,
    },
  });

  return { quote, version };
}

export async function selectLogisticsQuote(
  quoteId: string,
  sellerGtid: string,
): Promise<{ ok: true; quote: any } | { ok: false; reason: string }> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found" };
  if (quote.status === "CANCELLED" || quote.status === "SUPERSEDED" || quote.status === "EXPIRED") {
    return { ok: false, reason: `Quote is ${quote.status} — cannot be selected` };
  }
  if (quote.validUntil && new Date() > quote.validUntil) {
    await db.logisticsQuote.update({
      where: { quoteId },
      data: { status: "EXPIRED" },
    });
    return { ok: false, reason: "Quote has expired" };
  }
  if (quote.providerGtid) {
    const elig = await checkProviderEligibility(
      quote.providerGtid,
      quote.serviceType as LogisticsServiceType,
    );
    if (elig.sanctionsStatus === "BLOCKED") {
      return { ok: false, reason: `Provider ${quote.providerGtid} is sanctions-BLOCKED` };
    }
    if (elig.licenseStatus === "EXPIRED") {
      return { ok: false, reason: `Provider license expired` };
    }
  }

  const updated = await db.logisticsQuote.update({
    where: { quoteId },
    data: { status: "SELECTED", selectedByGtid: sellerGtid, selectedAt: new Date() },
  });

  await db.logisticsQuoteVersion.create({
    data: {
      quoteId,
      version: updated.currentVersion + 1,
      actorGtid: sellerGtid,
      reason: `Selected by seller ${sellerGtid}`,
      beforeJson: JSON.stringify({ status: quote.status }),
      afterJson: JSON.stringify({ status: "SELECTED" }),
    },
  });
  await db.logisticsQuote.update({
    where: { quoteId },
    data: { currentVersion: { increment: 1 } },
  });

  return { ok: true, quote: updated };
}

export async function expireLogisticsQuotes(): Promise<{
  expired: number;
  reconfirmRequired: number;
}> {
  const now = new Date();
  // Hard expiry: validUntil < now → EXPIRED
  const expired = await db.logisticsQuote.updateMany({
    where: {
      validUntil: { lt: now },
      status: { in: ["DRAFT", "REQUESTED", "QUOTED", "EXPIRING", "SELECTED"] },
    },
    data: { status: "EXPIRED" },
  });
  // Reconfirm window: within 24h of expiry → RECONFIRM_REQUIRED
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const reconfirm = await db.logisticsQuote.updateMany({
    where: {
      validUntil: { gte: now, lte: soon },
      status: { in: ["QUOTED", "SELECTED"] },
    },
    data: { status: "RECONFIRM_REQUIRED" },
  });
  return { expired: expired.count, reconfirmRequired: reconfirm.count };
}

// ============ 2. Capacity ============

export async function holdCapacity(
  quoteId: string,
  providerGtid: string,
  holdExpiry: Date,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found" };
  if (quote.providerGtid && quote.providerGtid !== providerGtid) {
    return { ok: false, reason: "Provider mismatch" };
  }
  await db.logisticsCapacity.create({
    data: {
      quoteId,
      equipmentType: quote.equipmentType || "GENERAL",
      quantity: quote.equipmentCount,
      status: "HELD",
      holdExpiry,
      sailingDate: quote.sailingDate,
      cutoffDate: quote.cutoffDate,
    },
  });
  await db.logisticsQuote.update({
    where: { quoteId },
    data: { capacityStatus: "HELD", capacityHoldExpiry: holdExpiry },
  });
  return { ok: true };
}

export async function confirmCapacity(
  quoteId: string,
  providerGtid: string,
  bookingRef: string,
  holdExpiry?: Date,
): Promise<{ ok: true; quote: any } | { ok: false; reason: string }> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found" };
  if (quote.providerGtid && quote.providerGtid !== providerGtid) {
    return { ok: false, reason: "Provider mismatch" };
  }
  await db.logisticsCapacity.updateMany({
    where: { quoteId, status: { in: ["PENDING", "AVAILABLE", "HELD"] } },
    data: { status: "CONFIRMED", bookingRef, confirmedAt: new Date(), confirmedBy: providerGtid },
  });
  const updated = await db.logisticsQuote.update({
    where: { quoteId },
    data: {
      capacityStatus: "CONFIRMED",
      status: "CAPACITY_CONFIRMED",
      capacityHoldExpiry: holdExpiry ?? quote.capacityHoldExpiry,
      bookingReference: bookingRef,
    },
  });
  return { ok: true, quote: updated };
}

export async function loseCapacity(
  quoteId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found" };
  await db.logisticsCapacity.updateMany({
    where: { quoteId },
    data: { status: "LOST" },
  });
  await db.logisticsQuote.update({
    where: { quoteId },
    data: { capacityStatus: "LOST" },
  });
  // Record drift event
  await createDriftEvent(quoteId, "CAPACITY_LOST", undefined, undefined, reason);
  return { ok: true };
}

// ============ 3. Booking ============

export async function confirmBooking(
  quoteId: string,
  bookingRef: string,
  providerGtid: string,
): Promise<{ ok: true; quote: any } | { ok: false; reason: string }> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found" };
  if (quote.capacityStatus !== "CONFIRMED") {
    return { ok: false, reason: `Capacity is ${quote.capacityStatus} — must be CONFIRMED before booking` };
  }
  const booking = await db.logisticsBooking.create({
    data: {
      quoteId,
      ustn: quote.ustn,
      bookingRef,
      providerGtid,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });
  const updated = await db.logisticsQuote.update({
    where: { quoteId },
    data: {
      status: "BOOKED",
      bookingReference: bookingRef,
      bookingConfirmedAt: new Date(),
    },
  });
  return { ok: true, quote: { ...updated, booking } };
}

export async function cancelBooking(
  quoteId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found" };
  await db.logisticsBooking.updateMany({
    where: { quoteId, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
  });
  await db.logisticsQuote.update({
    where: { quoteId },
    data: { status: "CANCELLED" },
  });
  await createDriftEvent(quoteId, "BOOKING_CHANGE", undefined, undefined, reason);
  return { ok: true };
}

// ============ 4. Surcharge Engine ============

export async function calculateSurcharges(quoteId: string): Promise<{
  baseCost: number;
  knownSurcharges: number;
  conditionalCost: number;
  excludedCost: number;
  estimatedTotal: number;
  maximumExposure: number;
}> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) throw new Error(`Quote ${quoteId} not found`);

  const surcharges = await db.logisticsQuoteSurcharge.findMany({ where: { quoteId } });
  const known = surcharges
    .filter((s) => !s.isConditional && !s.isExcluded)
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const conditional = surcharges
    .filter((s) => s.isConditional && !s.isExcluded)
    .reduce((sum, s) => sum + (s.amount || 0), 0);
  const excludedCount = surcharges.filter((s) => s.isExcluded).length;

  const estimatedTotal = quote.baseCost + known;
  const maximumExposure = quote.baseCost + known + conditional;

  // Sync JSON columns + total fields on the quote
  await db.logisticsQuote.update({
    where: { quoteId },
    data: {
      knownSurchargesJson: JSON.stringify(
        surcharges.filter((s) => !s.isConditional && !s.isExcluded).map((s) => ({
          type: s.surchargeType,
          amount: s.amount,
          description: s.description,
        })),
      ),
      conditionalCostJson: JSON.stringify(
        surcharges.filter((s) => s.isConditional && !s.isExcluded).map((s) => ({
          type: s.surchargeType,
          amount: s.amount,
          description: s.description,
          condition: s.condition,
        })),
      ),
      excludedCostJson: JSON.stringify(
        surcharges.filter((s) => s.isExcluded).map((s) => ({
          type: s.surchargeType,
          description: s.description,
        })),
      ),
      estimatedTotal,
      maximumExposure,
    },
  });

  return {
    baseCost: quote.baseCost,
    knownSurcharges: known,
    conditionalCost: conditional,
    excludedCost: excludedCount,
    estimatedTotal,
    maximumExposure,
  };
}

export async function addSurcharge(
  quoteId: string,
  type: SurchargeType,
  amount: number,
  isConditional: boolean,
  condition?: string,
  description?: string,
): Promise<{ surcharge: any; breakdown: any }> {
  const surcharge = await db.logisticsQuoteSurcharge.create({
    data: {
      quoteId,
      surchargeType: type,
      amount,
      description: description ?? null,
      isConditional,
      condition: isConditional ? (condition ?? null) : null,
      isExcluded: false,
    },
  });
  const breakdown = await calculateSurcharges(quoteId);
  return { surcharge, breakdown };
}

export async function addExcludedSurcharge(
  quoteId: string,
  type: SurchargeType,
  description: string,
): Promise<{ surcharge: any; breakdown: any }> {
  const surcharge = await db.logisticsQuoteSurcharge.create({
    data: {
      quoteId,
      surchargeType: type,
      amount: 0,
      description,
      isConditional: false,
      isExcluded: true,
    },
  });
  const breakdown = await calculateSurcharges(quoteId);
  return { surcharge, breakdown };
}

export async function getSurchargeBreakdown(quoteId: string): Promise<{
  baseCost: number;
  knownSurcharges: Array<{ type: string; amount: number; description?: string | null }>;
  conditionalCost: Array<{
    type: string;
    amount: number;
    description?: string | null;
    condition?: string | null;
  }>;
  excludedCost: Array<{ type: string; description?: string | null }>;
  estimatedTotal: number;
  maximumExposure: number;
}> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) throw new Error(`Quote ${quoteId} not found`);
  const surcharges = await db.logisticsQuoteSurcharge.findMany({ where: { quoteId } });
  return {
    baseCost: quote.baseCost,
    knownSurcharges: surcharges
      .filter((s) => !s.isConditional && !s.isExcluded)
      .map((s) => ({ type: s.surchargeType, amount: s.amount, description: s.description })),
    conditionalCost: surcharges
      .filter((s) => s.isConditional && !s.isExcluded)
      .map((s) => ({
        type: s.surchargeType,
        amount: s.amount,
        description: s.description,
        condition: s.condition,
      })),
    excludedCost: surcharges
      .filter((s) => s.isExcluded)
      .map((s) => ({ type: s.surchargeType, description: s.description })),
    estimatedTotal: quote.estimatedTotal,
    maximumExposure: quote.maximumExposure,
  };
}

// ============ 5. Assumptions / Exclusions ============

export async function addAssumption(
  quoteId: string,
  key: string,
  value: string,
): Promise<{ assumption: any }> {
  const assumption = await db.logisticsQuoteAssumption.create({
    data: { quoteId, key, value, isExclusion: false },
  });
  return { assumption };
}

export async function addExclusion(
  quoteId: string,
  key: string,
  value: string,
): Promise<{ exclusion: any }> {
  const exclusion = await db.logisticsQuoteAssumption.create({
    data: { quoteId, key, value, isExclusion: true },
  });
  return { exclusion };
}

export async function getAssumptions(quoteId: string): Promise<{
  assumptions: Array<{ key: string; value: string }>;
  exclusions: Array<{ key: string; value: string }>;
}> {
  const rows = await db.logisticsQuoteAssumption.findMany({ where: { quoteId } });
  return {
    assumptions: rows.filter((r) => !r.isExclusion).map((r) => ({ key: r.key, value: r.value })),
    exclusions: rows.filter((r) => r.isExclusion).map((r) => ({ key: r.key, value: r.value })),
  };
}

// ============ 6. Provider Eligibility (factual gate) ============

export interface ProviderEligibilityResult {
  providerGtid: string;
  licenseStatus: string;
  insuranceStatus: string;
  jurisdictionEligible: string[];
  sanctionsStatus: string;
  serviceCapabilities: string[];
  routeCapabilities: string[];
  equipmentCapabilities: string[];
  capacityConfirmed: boolean;
  eligible: boolean; // AND of the binary gates
  violations: string[];
}

export async function checkProviderEligibility(
  providerGtid: string,
  serviceType?: LogisticsServiceType,
  jurisdiction?: string,
): Promise<ProviderEligibilityResult> {
  let row = await db.providerEligibility.findUnique({ where: { providerGtid } });
  if (!row) {
    // Bootstrap a PENDING row so the gate is at least visible. Sanctions
    // default to CLEAR only because the live sanctions sync (`compliance/`)
    // is the canonical source — we do not silently fabricate "VERIFIED".
    row = await db.providerEligibility.create({
      data: { providerGtid, licenseStatus: "PENDING", insuranceStatus: "PENDING" },
    });
  }

  const jurisdictions = safeParse<string[]>(row.jurisdictionEligible, []);
  const serviceCaps = safeParse<string[]>(row.serviceCapabilities, []);
  const routeCaps = safeParse<string[]>(row.routeCapabilities, []);
  const equipmentCaps = safeParse<string[]>(row.equipmentCapabilities, []);

  const violations: string[] = [];
  if (row.sanctionsStatus === "BLOCKED") violations.push("sanctions_blocked");
  if (row.licenseStatus === "EXPIRED") violations.push("license_expired");
  if (row.insuranceStatus === "EXPIRED") violations.push("insurance_expired");
  if (serviceType && serviceCaps.length > 0 && !serviceCaps.includes(serviceType)) {
    violations.push(`service_not_supported:${serviceType}`);
  }
  if (jurisdiction && jurisdictions.length > 0 && !jurisdictions.includes(jurisdiction)) {
    violations.push(`jurisdiction_not_eligible:${jurisdiction}`);
  }

  const eligible =
    violations.length === 0 &&
    row.sanctionsStatus !== "BLOCKED" &&
    row.licenseStatus !== "EXPIRED" &&
    row.insuranceStatus !== "EXPIRED";

  return {
    providerGtid,
    licenseStatus: row.licenseStatus,
    insuranceStatus: row.insuranceStatus,
    jurisdictionEligible: jurisdictions,
    sanctionsStatus: row.sanctionsStatus,
    serviceCapabilities: serviceCaps,
    routeCapabilities: routeCaps,
    equipmentCapabilities: equipmentCaps,
    capacityConfirmed: row.capacityConfirmed,
    eligible,
    violations,
  };
}

export async function getProviderProfile(providerGtid: string): Promise<{
  providerGtid: string;
  onTimeDeliveryPct: number;
  disputeRate: number;
  invoiceAccuracyPct: number;
  riskScore: number;
  totalJobs: number;
  completedJobs: number;
  avgTurnaroundDays: number;
  benchmarkQuartile: number;
  performanceSummary: string | null;
} | null> {
  const perf = await db.providerPerformance.findUnique({ where: { providerGtid } });
  if (!perf) return null;
  // NOTE: deliberately returns raw factual metrics — NO matchScore, NO
  // ranking, NO recommendation. The buyer / seller decides which provider
  // to engage based on these facts plus the eligibility gate above.
  return {
    providerGtid: perf.providerGtid,
    onTimeDeliveryPct: perf.onTimeDeliveryPct,
    disputeRate: perf.disputeRate,
    invoiceAccuracyPct: perf.invoiceAccuracyPct,
    riskScore: perf.riskScore,
    totalJobs: perf.totalJobs,
    completedJobs: perf.completedJobs,
    avgTurnaroundDays: perf.avgTurnaroundDays,
    benchmarkQuartile: perf.benchmarkQuartile,
    performanceSummary: perf.performanceSummary,
  };
}

// ============ 7. Route Feasibility ============

export interface RouteFeasibilityInput {
  quoteId: string;
  ustn?: string;
  pickupDate?: Date;
  loadingDate?: Date;
  portCutoff?: Date;
  sailingDate?: Date;
  transitTimeDays?: number;
  customsLeadDays?: number;
  inspectionDays?: number;
  deliveryDeadline?: Date;
}

export interface RouteFeasibilityResult {
  status: FeasibilityStatus;
  notes: string;
  blockingConditions: string[];
  expectedArrival?: Date;
  availableBufferDays?: number;
}

export async function checkRouteFeasibility(
  input: RouteFeasibilityInput,
): Promise<RouteFeasibilityResult> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId: input.quoteId } });
  if (!quote) throw new Error(`Quote ${input.quoteId} not found`);

  const blockingConditions: string[] = [];
  const notes: string[] = [];

  // Sequence validation — each step must be after the prior step (or omitted)
  const steps: Array<[string, Date | undefined, string?]> = [
    ["pickup", input.pickupDate],
    ["loading", input.loadingDate, "after_pickup"],
    ["port_cutoff", input.portCutoff, "after_loading"],
    ["sailing", input.sailingDate, "after_cutoff"],
  ];
  for (let i = 1; i < steps.length; i++) {
    const [prevName, prevDate] = steps[i - 1];
    const [curName, curDate, rule] = steps[i];
    if (prevDate && curDate && curDate < prevDate) {
      blockingConditions.push(`${curName}_before_${prevName}`);
      notes.push(`${curName} is before ${prevName} — violates ${rule || "sequence"}`);
    }
  }

  // Expected arrival = sailing + transit + customs + inspection
  let expectedArrival: Date | undefined;
  if (input.sailingDate && (input.transitTimeDays || 0) > 0) {
    const transitMs = (input.transitTimeDays || 0) * 24 * 60 * 60 * 1000;
    const customsMs = (input.customsLeadDays || 0) * 24 * 60 * 60 * 1000;
    const inspectionMs = (input.inspectionDays || 0) * 24 * 60 * 60 * 1000;
    expectedArrival = new Date(
      input.sailingDate.getTime() + transitMs + customsMs + inspectionMs,
    );
  }

  let availableBufferDays: number | undefined;
  if (expectedArrival && input.deliveryDeadline) {
    const diffMs = input.deliveryDeadline.getTime() - expectedArrival.getTime();
    availableBufferDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (availableBufferDays < 0) {
      blockingConditions.push("delivery_deadline_missed");
      notes.push(
        `Expected arrival ${expectedArrival.toISOString()} is after delivery deadline ${input.deliveryDeadline.toISOString()}`,
      );
    } else if (availableBufferDays < 2) {
      notes.push(`Tight buffer — only ${availableBufferDays} day(s) of slack`);
    }
  }

  let status: FeasibilityStatus = "FEASIBLE";
  if (blockingConditions.length > 0) status = "NOT_FEASIBLE";
  else if (notes.length > 0) status = "CONDITIONALLY_FEASIBLE";

  const ustn = input.ustn || quote.ustn;
  await db.logisticsRouteFeasibility.create({
    data: {
      quoteId: input.quoteId,
      ustn,
      pickupDate: input.pickupDate ?? null,
      loadingDate: input.loadingDate ?? null,
      portCutoff: input.portCutoff ?? null,
      sailingDate: input.sailingDate ?? null,
      transitTimeDays: input.transitTimeDays ?? null,
      customsLeadDays: input.customsLeadDays ?? null,
      inspectionDays: input.inspectionDays ?? null,
      expectedArrival: expectedArrival ?? null,
      deliveryDeadline: input.deliveryDeadline ?? null,
      availableBuffer: availableBufferDays ?? null,
      status,
      notes: notes.join("; ") || null,
      blockingConditions: JSON.stringify(blockingConditions),
    },
  });

  await db.logisticsQuote.update({
    where: { quoteId: input.quoteId },
    data: {
      feasibilityStatus: status,
      feasibilityNotes: notes.join("; ") || null,
    },
  });

  return { status, notes: notes.join("; "), blockingConditions, expectedArrival, availableBufferDays };
}

// ============ 8. Drift Monitoring ============

export async function createDriftEvent(
  quoteId: string,
  type: DriftType,
  originalAmount: number | undefined,
  currentAmount: number | undefined,
  reason: string,
  affectedService?: string,
): Promise<{ drift: any }> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  const ustn = quote?.ustn || "";
  const difference =
    originalAmount !== undefined && currentAmount !== undefined
      ? currentAmount - originalAmount
      : undefined;
  const percentageChange =
    originalAmount !== undefined && originalAmount !== 0 && currentAmount !== undefined
      ? ((currentAmount - originalAmount) / originalAmount) * 100
      : undefined;

  const drift = await db.logisticsDriftEvent.create({
    data: {
      quoteId,
      ustn,
      driftType: type,
      originalAmount: originalAmount ?? null,
      currentAmount: currentAmount ?? null,
      difference: difference ?? null,
      percentageChange: percentageChange ?? null,
      reason,
      affectedService: affectedService ?? null,
    },
  });
  return { drift };
}

export async function detectDrift(quoteId: string): Promise<{
  driftDetected: boolean;
  events: any[];
  summary: string;
}> {
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) throw new Error(`Quote ${quoteId} not found`);

  // The SELECTED version is the snapshot of truth. Compare current totals to it.
  const selectedVersion = await db.logisticsQuoteVersion.findFirst({
    where: { quoteId, reason: { contains: "Selected by seller" } },
    orderBy: { version: "desc" },
  });

  const events: any[] = [];
  if (selectedVersion) {
    const snapshot = safeParse<{
      status?: string;
      baseCost?: number;
      estimatedTotal?: number;
      maximumExposure?: number;
      sailingDate?: string;
      cutoffDate?: string;
    }>(selectedVersion.afterJson, {});

    if (
      typeof snapshot.estimatedTotal === "number" &&
      Math.abs(quote.estimatedTotal - snapshot.estimatedTotal) > 0.01
    ) {
      const ev = await createDriftEvent(
        quoteId,
        "PRICE_CHANGE",
        snapshot.estimatedTotal,
        quote.estimatedTotal,
        `Estimated total moved from ${snapshot.estimatedTotal} to ${quote.estimatedTotal}`,
      );
      events.push(ev.drift);
    }
    if (
      typeof snapshot.maximumExposure === "number" &&
      Math.abs(quote.maximumExposure - snapshot.maximumExposure) > 0.01
    ) {
      const ev = await createDriftEvent(
        quoteId,
        "SURCHARGE_CHANGE",
        snapshot.maximumExposure,
        quote.maximumExposure,
        `Maximum exposure moved from ${snapshot.maximumExposure} to ${quote.maximumExposure}`,
      );
      events.push(ev.drift);
    }

    // Schedule drift — sailing/cutoff changed vs the SELECTED snapshot
    if (snapshot.sailingDate && quote.sailingDate) {
      const snapSail = new Date(snapshot.sailingDate).getTime();
      const curSail = quote.sailingDate.getTime();
      if (Math.abs(snapSail - curSail) > 24 * 60 * 60 * 1000) {
        const ev = await createDriftEvent(
          quoteId,
          "SCHEDULE_CHANGE",
          undefined,
          undefined,
          `Sailing date shifted from ${snapshot.sailingDate} to ${quote.sailingDate.toISOString()}`,
        );
        events.push(ev.drift);
      }
    }
  }

  // Capacity drift — if a HELD capacity row has expired without confirmation
  if (quote.capacityHoldExpiry && new Date() > quote.capacityHoldExpiry && quote.capacityStatus === "HELD") {
    const ev = await createDriftEvent(
      quoteId,
      "CAPACITY_LOST",
      undefined,
      undefined,
      "Capacity hold expired without confirmation",
    );
    events.push(ev.drift);
  }

  return {
    driftDetected: events.length > 0,
    events,
    summary: events.length === 0 ? "No drift detected" : `${events.length} drift event(s) recorded`,
  };
}

// ============ 9. Fallback ============

export async function createFallbackPlan(
  ustn: string,
  serviceType: string,
  primaryQuoteId: string,
  backupQuoteId?: string,
  emergencyQuoteId?: string,
): Promise<{ fallback: any }> {
  const fallback = await db.logisticsFallback.create({
    data: {
      ustn,
      serviceType,
      primaryQuoteId,
      backupQuoteId: backupQuoteId ?? null,
      emergencyQuoteId: emergencyQuoteId ?? null,
      status: "ACTIVE",
    },
  });
  // Mark the backup/emergency rows as fallbacks (they retain their own quoteId)
  if (backupQuoteId) {
    await db.logisticsQuote.update({
      where: { quoteId: backupQuoteId },
      data: { isFallback: true, fallbackLevel: "BACKUP", fallbackParentId: primaryQuoteId },
    }).catch(() => { /* non-fatal */ });
  }
  if (emergencyQuoteId) {
    await db.logisticsQuote.update({
      where: { quoteId: emergencyQuoteId },
      data: { isFallback: true, fallbackLevel: "EMERGENCY", fallbackParentId: primaryQuoteId },
    }).catch(() => { /* non-fatal */ });
  }
  return { fallback };
}

export async function activateFallback(
  ustn: string,
  serviceType: string,
  level: FallbackLevel,
  sellerGtid: string,
  governorDecisionId?: string,
): Promise<{ ok: true; fallback: any } | { ok: false; reason: string }> {
  const fallback = await db.logisticsFallback.findFirst({
    where: { ustn, serviceType, status: { in: ["ACTIVE", "PRIMARY_FAILED", "BACKUP_ACTIVATED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!fallback) return { ok: false, reason: `No fallback plan for ${serviceType} on ${ustn}` };

  // Validate Governor gate (caller must supply decisionId after Governor validation)
  if (!governorDecisionId) {
    return { ok: false, reason: "Governor decision ID required for fallback activation" };
  }

  const newStatus =
    level === "BACKUP"
      ? "BACKUP_ACTIVATED"
      : level === "EMERGENCY"
        ? "EMERGENCY_ACTIVATED"
        : "PRIMARY_FAILED";

  const updated = await db.logisticsFallback.update({
    where: { id: fallback.id },
    data: {
      status: newStatus,
      activatedBy: sellerGtid,
      activatedAt: new Date(),
      governorDecision: governorDecisionId,
    },
  });
  return { ok: true, fallback: updated };
}

// ============ 10. Cost Certainty ============

export async function calculateCostCertainty(ustn: string): Promise<{
  ustn: string;
  totalConfirmed: number;
  totalEstimated: number;
  totalConditional: number;
  grandTotal: number;
  quoteCount: number;
  quotesByStatus: Record<string, number>;
}> {
  const quotes = await db.logisticsQuote.findMany({
    where: { ustn, status: { notIn: ["CANCELLED", "SUPERSEDED"] } },
    select: {
      status: true,
      estimatedTotal: true,
      maximumExposure: true,
      baseCost: true,
    },
  });

  const confirmed = quotes.filter((q) =>
    ["BOOKED", "CAPACITY_CONFIRMED", "BOOKING_PENDING"].includes(q.status),
  );
  const estimated = quotes.filter((q) => ["SELECTED", "QUOTED", "RECONFIRM_REQUIRED"].includes(q.status));

  const totalConfirmed = confirmed.reduce((s, q) => s + q.estimatedTotal, 0);
  const totalEstimated = estimated.reduce((s, q) => s + q.estimatedTotal, 0);
  const totalConditional = quotes.reduce(
    (s, q) => s + (q.maximumExposure - q.estimatedTotal),
    0,
  );
  const grandTotal = totalConfirmed + totalEstimated + totalConditional;

  const quotesByStatus: Record<string, number> = {};
  for (const q of quotes) quotesByStatus[q.status] = (quotesByStatus[q.status] || 0) + 1;

  return {
    ustn,
    totalConfirmed,
    totalEstimated,
    totalConditional,
    grandTotal,
    quoteCount: quotes.length,
    quotesByStatus,
  };
}

// ============ 11. Margin at Risk (seller-only advisory) ============

export async function calculateMarginAtRisk(
  ustn: string,
  salePrice: number,
  logisticsTotalOverride?: number,
  sgtxFeeOverride?: number,
): Promise<{
  ustn: string;
  salePrice: number;
  logisticsTotal: number;
  sgtxFee: number;
  expectedMargin: number;
  marginPct: number;
  logisticsExposure: number;
  marginAtRisk: number;
}> {
  const cc = await calculateCostCertainty(ustn);
  const logisticsTotal = logisticsTotalOverride ?? cc.grandTotal;
  const sgtxFee = sgtxFeeOverride ?? salePrice * 0.015; // default 1.5%
  const expectedMargin = salePrice - logisticsTotal - sgtxFee;
  const marginPct = salePrice > 0 ? (expectedMargin / salePrice) * 100 : 0;
  const logisticsExposure = cc.totalConditional;
  const marginAtRisk = Math.max(0, logisticsExposure);

  return {
    ustn,
    salePrice,
    logisticsTotal,
    sgtxFee,
    expectedMargin,
    marginPct,
    logisticsExposure,
    marginAtRisk,
  };
}

// ============ 12. Logistics Truth Layer ============

export async function getLogisticsHistory(ustn: string): Promise<{
  ustn: string;
  quoteVersions: any[];
  capacityChanges: any[];
  bookingChanges: any[];
  driftEvents: any[];
  fallbackActivations: any[];
}> {
  const quotes = await db.logisticsQuote.findMany({
    where: { ustn },
    select: { quoteId: true, status: true, currentVersion: true, updatedAt: true },
  });
  const quoteIds = quotes.map((q) => q.quoteId);

  const [quoteVersions, capacityChanges, bookingChanges, driftEvents, fallbackActivations] =
    await Promise.all([
      db.logisticsQuoteVersion.findMany({
        where: { quoteId: { in: quoteIds } },
        orderBy: { changedAt: "asc" },
      }),
      db.logisticsCapacity.findMany({ where: { quoteId: { in: quoteIds } } }),
      db.logisticsBooking.findMany({ where: { ustn } }),
      db.logisticsDriftEvent.findMany({ where: { ustn }, orderBy: { detectedAt: "desc" } }),
      db.logisticsFallback.findMany({ where: { ustn }, orderBy: { createdAt: "desc" } }),
    ]);

  return {
    ustn,
    quoteVersions,
    capacityChanges,
    bookingChanges,
    driftEvents,
    fallbackActivations,
  };
}

// ============ 13. Logistics Bundle (all quotes for a USTN) ============

export async function getLogisticsBundle(ustn: string): Promise<{
  ustn: string;
  quotes: any[];
  totalQuotes: number;
  costCertainty: any;
  driftEvents: any[];
  fallbackPlans: any[];
}> {
  const [quotes, driftEvents, fallbackPlans] = await Promise.all([
    db.logisticsQuote.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    }),
    db.logisticsDriftEvent.findMany({ where: { ustn }, orderBy: { detectedAt: "desc" }, take: 50 }),
    db.logisticsFallback.findMany({ where: { ustn }, orderBy: { createdAt: "desc" } }),
  ]);

  const costCertainty = await calculateCostCertainty(ustn);

  return {
    ustn,
    quotes,
    totalQuotes: quotes.length,
    costCertainty,
    driftEvents,
    fallbackPlans,
  };
}

// ============ 14. Governor Gates ============

export interface LogisticsViolation {
  code: string;
  message: string;
}

export async function validateLogisticsQuote(quoteId: string): Promise<{
  valid: boolean;
  violations: LogisticsViolation[];
}> {
  const violations: LogisticsViolation[] = [];
  const quote = await db.logisticsQuote.findUnique({ where: { quoteId } });
  if (!quote) {
    return { valid: false, violations: [{ code: "not_found", message: `Quote ${quoteId} not found` }] };
  }

  // Valid source mode
  if (!["MODE_A", "MODE_B", "MODE_C"].includes(quote.sourceMode)) {
    violations.push({ code: "invalid_source", message: `Invalid sourceMode ${quote.sourceMode}` });
  }

  // Valid version (currentVersion ≥ 1)
  if (!quote.currentVersion || quote.currentVersion < 1) {
    violations.push({ code: "invalid_version", message: `Invalid currentVersion ${quote.currentVersion}` });
  }

  // Not duplicate (a SUPERSEDED quote is invalid for selection)
  if (quote.status === "SUPERSEDED") {
    violations.push({ code: "duplicate_superseded", message: "Quote is SUPERSEDED" });
  }

  // Mandatory fields present
  if (!quote.ustn) violations.push({ code: "missing_ustn", message: "ustn is required" });
  if (!quote.tradeId) violations.push({ code: "missing_tradeId", message: "tradeId is required" });
  if (!quote.serviceType) violations.push({ code: "missing_serviceType", message: "serviceType is required" });

  // Provider eligibility (only if provider is set)
  if (quote.providerGtid) {
    const elig = await checkProviderEligibility(
      quote.providerGtid,
      quote.serviceType as LogisticsServiceType,
    );
    if (!elig.eligible) {
      violations.push({
        code: "provider_ineligible",
        message: `Provider ${quote.providerGtid} fails eligibility: ${elig.violations.join(", ")}`,
      });
    }
  }

  // Capacity confirmed for BOOKED status (bookings require capacity)
  if (quote.status === "BOOKED" && quote.capacityStatus !== "CONFIRMED") {
    violations.push({
      code: "capacity_not_confirmed",
      message: `Quote is BOOKED but capacity is ${quote.capacityStatus}`,
    });
  }

  // Route feasibility (if checked) — must not be NOT_FEASIBLE
  if (quote.feasibilityStatus === "NOT_FEASIBLE") {
    violations.push({
      code: "route_not_feasible",
      message: "Route feasibility check returned NOT_FEASIBLE",
    });
  }

  return { valid: violations.length === 0, violations };
}

// ============ Convenience: attach service commitment ============

export async function attachServiceCommitment(
  quoteId: string,
  ustn: string,
  commitment: {
    pickupCommitment?: Date;
    deliveryCommitment?: Date;
    equipmentCommitment?: string;
    capacityCommitment?: string;
    responseSLA?: number;
    cancellationConditions?: string;
    liability?: string;
    documentationResponsibility?: string;
    penaltyTerms?: string;
    escalationProcess?: string;
  },
): Promise<{ commitment: any }> {
  const commitmentRow = await db.logisticsServiceCommitment.create({
    data: {
      quoteId,
      ustn,
      pickupCommitment: commitment.pickupCommitment ?? null,
      deliveryCommitment: commitment.deliveryCommitment ?? null,
      equipmentCommitment: commitment.equipmentCommitment ?? null,
      capacityCommitment: commitment.capacityCommitment ?? null,
      responseSLA: commitment.responseSLA ?? null,
      cancellationConditions: commitment.cancellationConditions ?? null,
      liability: commitment.liability ?? null,
      documentationResponsibility: commitment.documentationResponsibility ?? null,
      penaltyTerms: commitment.penaltyTerms ?? null,
      escalationProcess: commitment.escalationProcess ?? null,
    },
  });
  // Mirror critical fields back onto the quote for fast filtering
  await db.logisticsQuote.update({
    where: { quoteId },
    data: {
      pickupCommitment: commitment.pickupCommitment ?? null,
      deliveryCommitment: commitment.deliveryCommitment ?? null,
      responseSLA: commitment.responseSLA ?? null,
      liability: commitment.liability ?? null,
      documentationResp: commitment.documentationResponsibility ?? null,
      penaltyTerms: commitment.penaltyTerms ?? null,
      escalationProcess: commitment.escalationProcess ?? null,
    },
  });
  return { commitment: commitmentRow };
}

// Logger-friendly error wrapper for callers that prefer the lib API
export function wrapLogisticsError(e: unknown): { ok: false; reason: string } {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error("[logistics] error:", { error: msg });
  return { ok: false, reason: msg };
}
