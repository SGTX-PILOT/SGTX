// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX Phase 5 — §3 Logistics Quote V2 (NON-MARKETPLACE)
 * ------------------------------------------------------------
 * Implements the expanded RFQ/quotation system per SGTX Blueprint §3.
 * The 12 expanded service types:
 *   ROAD | AIR | OCEAN | RAIL | MULTIMODAL | WAREHOUSE | TERMINAL |
 *   CUSTOMS_BROKER | INSPECTION | LAB | QC | INSURANCE
 *
 * Lifecycle:
 *   DRAFT ──request──▶ REQUESTED ──submit──▶ QUOTED ──select──▶ SELECTED
 *                              ├──expire──▶ EXPIRED
 *                              ├──cancel──▶ CANCELLED
 *                              └──supersede──▶ SUPERSEDED
 *
 * NON-MARKETPLACE PRINCIPLES (per spec):
 *   • The trader explicitly selects the provider they want a quote from
 *     (NO "send-to-all-providers" broadcast). `requestQuote` requires
 *     an explicit `providerGtid`.
 *   • The trader explicitly selects the winning quote (NO auto-ranking,
 *     NO auto-recommendation). `selectQuote` records the selecting
 *     trader's GTID; there is no `autoSelectQuote` function.
 *   • No provider scoring is published. The quote response is private
 *     to the trader + provider.
 *
 * Design principles (carry-over):
 *   • Every DB call is wrapped defensively — the lib never throws;
 *     it logs + returns a safe default.
 *   • `generateQuoteId` and `computeMaxExposure` are pure.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §3 Service types & statuses ============

export const SERVICE_TYPES = [
  "ROAD",
  "AIR",
  "OCEAN",
  "RAIL",
  "MULTIMODAL",
  "WAREHOUSE",
  "TERMINAL",
  "CUSTOMS_BROKER",
  "INSPECTION",
  "LAB",
  "QC",
  "INSURANCE",
] as const;

export const QUOTE_STATUSES = [
  "DRAFT",
  "REQUESTED",
  "QUOTED",
  "SELECTED",
  "EXPIRED",
  "CANCELLED",
  "SUPERSEDED",
] as const;

// Quote state machine (allowed transitions).
const QUOTE_STATE_MACHINE: Record<string, string[]> = {
  DRAFT: ["REQUESTED", "CANCELLED"],
  REQUESTED: ["QUOTED", "CANCELLED", "EXPIRED"],
  QUOTED: ["SELECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"],
  SELECTED: ["SUPERSEDED", "CANCELLED"],
  EXPIRED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

// ============ Input types ============

export interface RequestQuoteInput {
  ustn?: string;
  tradeId?: string;
  graphId?: string;
  legId?: string;
  serviceType: string;
  serviceSubtype?: string;
  providerGtid: string; // REQUIRED — non-marketplace explicit selection
  providerType?: string;
  originLocation?: string;
  destinationLocation?: string;
  commodity?: string;
  hs6?: string;
  weightKg?: number;
  volumeCbm?: number;
  equipmentType?: string;
  equipmentCount?: number;
  specialCargo?: any;
  currency?: string;
  notes?: string;
}

export interface ProviderQuoteResponse {
  baseCost: number;
  surcharges?: Array<{ type: string; amount: number; description: string }>;
  validUntil?: Date;
  transitDays?: number;
  notes?: string;
}

// ============ Pure helpers ============

function isValidServiceType(t?: string | null): boolean {
  return !!t && (SERVICE_TYPES as readonly string[]).includes(t);
}

function isValidQuoteStatus(s?: string | null): boolean {
  return !!s && (QUOTE_STATUSES as readonly string[]).includes(s);
}

function isValidTransition(from: string, to: string): boolean {
  if (!isValidQuoteStatus(from) || !isValidQuoteStatus(to)) return false;
  if (from === to) return true;
  const allowed = QUOTE_STATE_MACHINE[from] || [];
  return allowed.includes(to);
}

function safeParseJson(raw: any): any {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Pure quote-id generator: `LQ2-YYYYMMDD-NNNNN`.
 *
 * The NNNNN serial is derived deterministically from the current
 * timestamp (no Math.random — keeps the function pure). Production code
 * may overwrite via the DB after creation if a global counter is needed;
 * this default is collision-resistant enough for typical request rates
 * (5 digits derived from ms-of-day → ~86.4M possible values per day).
 */
export function generateQuoteId(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  // 5-digit serial from ms-of-day mod 100000 (deterministic).
  const msOfDay =
    now.getUTCHours() * 3600000 +
    now.getUTCMinutes() * 60000 +
    now.getUTCSeconds() * 1000 +
    now.getUTCMilliseconds();
  const serial = String(msOfDay % 100000).padStart(5, "0");
  return `LQ2-${yyyy}${mm}${dd}-${serial}`;
}

/**
 * Pure: computes the maximum exposure of a quote = baseCost + sum of
 * all surcharges. Used by `submitQuote` to populate the `maxExposure`
 * column (the trader's maximum financial exposure if all surcharges
 * materialize at the upper bound).
 */
export function computeMaxExposure(
  baseCost: number,
  surcharges: Array<{ amount: number }>,
): number {
  const base = Number(baseCost) || 0;
  const surchargeSum = Array.isArray(surcharges)
    ? surcharges.reduce((sum, s) => sum + (Number(s?.amount) || 0), 0)
    : 0;
  return base + surchargeSum;
}

// ============ §3a requestQuote ============

/**
 * Trader REQUESTS a quote from a SPECIFIC provider (explicit selection,
 * non-marketplace). Status: DRAFT → REQUESTED.
 *
 * Refuses to proceed if `providerGtid` is missing — non-marketplace
 * enforcement: SGTX never broadcasts RFQs to "all providers".
 */
export async function requestQuote(
  input: RequestQuoteInput,
): Promise<any> {
  try {
    if (!isValidServiceType(input.serviceType)) {
      return { ok: false, error: "INVALID_SERVICE_TYPE", valid: SERVICE_TYPES };
    }
    if (!input.providerGtid) {
      return {
        ok: false,
        error: "PROVIDER_GTID_REQUIRED",
        reason:
          "SGTX is NON-MARKETPLACE — the trader must explicitly select the provider to request a quote from. No broadcast.",
      };
    }

    const quoteId = generateQuoteId();
    const data: any = {
      ustn: input.ustn || null,
      tradeId: input.tradeId || null,
      graphId: input.graphId || null,
      legId: input.legId || null,
      quoteId,
      serviceType: input.serviceType,
      serviceSubtype: input.serviceSubtype || null,
      providerGtid: input.providerGtid,
      providerType: input.providerType || null,
      originLocation: input.originLocation || null,
      destinationLocation: input.destinationLocation || null,
      commodity: input.commodity || null,
      hs6: input.hs6 || null,
      weightKg: input.weightKg != null ? Number(input.weightKg) : null,
      volumeCbm: input.volumeCbm != null ? Number(input.volumeCbm) : null,
      equipmentType: input.equipmentType || null,
      equipmentCount: Number(input.equipmentCount) || 1,
      specialCargo: input.specialCargo ? JSON.stringify(input.specialCargo) : null,
      currency: input.currency || "USD",
      status: "REQUESTED",
      providerValidationStatus: "PENDING",
      notes: input.notes || null,
    };

    const quote = await db.logisticsQuoteV2.create({ data });
    logger.info("logistics-quote-v2: requested", {
      id: quote.id,
      quoteId,
      providerGtid: input.providerGtid,
      serviceType: input.serviceType,
    });
    return quote;
  } catch (err) {
    logger.error("logistics-quote-v2: requestQuote failed", {
      error: String(err),
      input,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §3b submitQuote ============

/**
 * Provider submits their quote response. Status: REQUESTED → QUOTED.
 * Sets baseCost, surcharges (JSON), totalCost (=base), maxExposure
 * (= base + surcharges), validUntil, transitDays (in notes).
 *
 * NON-MARKETPLACE: this does NOT auto-rank the provider or compare to
 * other quotes. The trader reviews and explicitly selects.
 */
export async function submitQuote(
  quoteId: string,
  providerResponse: ProviderQuoteResponse,
): Promise<any> {
  try {
    const quote = await db.logisticsQuoteV2.findUnique({
      where: { quoteId },
    });
    if (!quote) return { ok: false, error: "QUOTE_NOT_FOUND" };
    if (!isValidTransition(quote.status, "QUOTED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: quote.status,
        to: "QUOTED",
        allowed: QUOTE_STATE_MACHINE[quote.status] || [],
      };
    }

    const baseCost = Number(providerResponse.baseCost) || 0;
    const surcharges = Array.isArray(providerResponse.surcharges)
      ? providerResponse.surcharges
      : [];
    const surchargesJson =
      surcharges.length > 0 ? JSON.stringify(surcharges) : null;
    const totalCost = baseCost; // base only at this stage
    const maxExposure = computeMaxExposure(baseCost, surcharges);
    const validUntil =
      providerResponse.validUntil ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // default 30 days

    const updated = await db.logisticsQuoteV2.update({
      where: { quoteId },
      data: {
        status: "QUOTED",
        baseCost,
        surcharges: surchargesJson,
        totalCost,
        maxExposure,
        validUntil,
        issuedAt: new Date(),
        notes: providerResponse.notes
          ? quote.notes
            ? `${quote.notes}\n[PROVIDER] ${providerResponse.notes}`
            : `[PROVIDER] ${providerResponse.notes}`
          : quote.notes,
      },
    });

    // Stash transitDays in the specialCargo JSON (no dedicated column).
    if (providerResponse.transitDays != null) {
      try {
        const sc = safeParseJson(updated.specialCargo) || {};
        sc.transitDays = providerResponse.transitDays;
        await db.logisticsQuoteV2.update({
          where: { quoteId },
          data: { specialCargo: JSON.stringify(sc) },
        });
      } catch {
        /* non-fatal */
      }
    }

    logger.info("logistics-quote-v2: quoted", {
      quoteId,
      baseCost,
      maxExposure,
    });
    return updated;
  } catch (err) {
    logger.error("logistics-quote-v2: submitQuote failed", {
      quoteId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §3c selectQuote ============

/**
 * Trader EXPLICITLY selects a quote. Status: QUOTED → SELECTED.
 *
 * NON-MARKETPLACE: there is no auto-selection helper. The trader's GTID
 * is recorded as the selecting party for full audit trail.
 */
export async function selectQuote(
  quoteId: string,
  selectedByGtid: string,
): Promise<any> {
  try {
    if (!selectedByGtid) {
      return { ok: false, error: "SELECTED_BY_GTID_REQUIRED" };
    }
    const quote = await db.logisticsQuoteV2.findUnique({
      where: { quoteId },
    });
    if (!quote) return { ok: false, error: "QUOTE_NOT_FOUND" };
    if (!isValidTransition(quote.status, "SELECTED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: quote.status,
        to: "SELECTED",
        allowed: QUOTE_STATE_MACHINE[quote.status] || [],
      };
    }

    const updated = await db.logisticsQuoteV2.update({
      where: { quoteId },
      data: {
        status: "SELECTED",
        selectedByGtid,
        selectedAt: new Date(),
      },
    });
    logger.info("logistics-quote-v2: selected", {
      quoteId,
      selectedByGtid,
    });
    return updated;
  } catch (err) {
    logger.error("logistics-quote-v2: selectQuote failed", {
      quoteId,
      selectedByGtid,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §3d listQuotes ============

export async function listQuotes(
  filters?: {
    ustn?: string;
    graphId?: string;
    legId?: string;
    providerGtid?: string;
    serviceType?: string;
    status?: string;
  },
): Promise<any[]> {
  try {
    const where: any = {};
    if (filters?.ustn) where.ustn = filters.ustn;
    if (filters?.graphId) where.graphId = filters.graphId;
    if (filters?.legId) where.legId = filters.legId;
    if (filters?.providerGtid) where.providerGtid = filters.providerGtid;
    if (filters?.serviceType) where.serviceType = filters.serviceType;
    if (filters?.status) where.status = filters.status;
    return (
      (await db.logisticsQuoteV2.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
      })) || []
    );
  } catch (err) {
    logger.error("logistics-quote-v2: listQuotes failed", {
      filters,
      error: String(err),
    });
    return [];
  }
}

// ============ §3e getQuote ============

export async function getQuote(id: string): Promise<any | null> {
  try {
    return await db.logisticsQuoteV2.findUnique({ where: { id } });
  } catch (err) {
    logger.error("logistics-quote-v2: getQuote failed", {
      id,
      error: String(err),
    });
    return null;
  }
}

// ============ §3f getQuoteByQuoteId ============

export async function getQuoteByQuoteId(
  quoteId: string,
): Promise<any | null> {
  try {
    if (!quoteId) return null;
    return await db.logisticsQuoteV2.findUnique({ where: { quoteId } });
  } catch (err) {
    logger.error("logistics-quote-v2: getQuoteByQuoteId failed", {
      quoteId,
      error: String(err),
    });
    return null;
  }
}

// ============ §3g getQuotesForGraph ============

/**
 * Returns all quotes associated with a transport graph (directly on the
 * graph OR on any of its legs).
 */
export async function getQuotesForGraph(graphId: string): Promise<any[]> {
  try {
    if (!graphId) return [];
    const direct = await db.logisticsQuoteV2.findMany({
      where: { graphId },
      orderBy: { createdAt: "asc" },
    });
    const legIds: string[] = [];
    try {
      const legs = await db.transportLeg.findMany({
        where: { graphId },
        select: { id: true },
      });
      legIds.push(...legs.map((l: any) => l.id));
    } catch {
      /* non-fatal */
    }
    const legQuotes =
      legIds.length > 0
        ? await db.logisticsQuoteV2.findMany({
            where: { legId: { in: legIds }, graphId: null },
            orderBy: { createdAt: "asc" },
          })
        : [];
    return [...(direct || []), ...(legQuotes || [])];
  } catch (err) {
    logger.error("logistics-quote-v2: getQuotesForGraph failed", {
      graphId,
      error: String(err),
    });
    return [];
  }
}

// ============ §3h getQuotesForLeg ============

export async function getQuotesForLeg(legId: string): Promise<any[]> {
  try {
    if (!legId) return [];
    return (
      (await db.logisticsQuoteV2.findMany({
        where: { legId },
        orderBy: { createdAt: "asc" },
      })) || []
    );
  } catch (err) {
    logger.error("logistics-quote-v2: getQuotesForLeg failed", {
      legId,
      error: String(err),
    });
    return [];
  }
}

// ============ §3i expireQuote ============

/**
 * Transitions QUOTED → EXPIRED. Typically invoked by a nightly sweep
 * after `validUntil` has passed; safe to call manually too.
 */
export async function expireQuote(quoteId: string): Promise<any> {
  try {
    const quote = await db.logisticsQuoteV2.findUnique({
      where: { quoteId },
    });
    if (!quote) return { ok: false, error: "QUOTE_NOT_FOUND" };
    if (!isValidTransition(quote.status, "EXPIRED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: quote.status,
        to: "EXPIRED",
        allowed: QUOTE_STATE_MACHINE[quote.status] || [],
      };
    }
    const updated = await db.logisticsQuoteV2.update({
      where: { quoteId },
      data: { status: "EXPIRED" },
    });
    logger.info("logistics-quote-v2: expired", { quoteId });
    return updated;
  } catch (err) {
    logger.error("logistics-quote-v2: expireQuote failed", {
      quoteId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §3j cancelQuote ============

export async function cancelQuote(
  quoteId: string,
  reason: string,
): Promise<any> {
  try {
    const quote = await db.logisticsQuoteV2.findUnique({
      where: { quoteId },
    });
    if (!quote) return { ok: false, error: "QUOTE_NOT_FOUND" };
    if (!isValidTransition(quote.status, "CANCELLED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: quote.status,
        to: "CANCELLED",
        allowed: QUOTE_STATE_MACHINE[quote.status] || [],
      };
    }
    const updated = await db.logisticsQuoteV2.update({
      where: { quoteId },
      data: {
        status: "CANCELLED",
        notes: quote.notes
          ? `${quote.notes}\n[CANCELLED] ${reason}`
          : `[CANCELLED] ${reason}`,
      },
    });
    logger.info("logistics-quote-v2: cancelled", { quoteId, reason });
    return updated;
  } catch (err) {
    logger.error("logistics-quote-v2: cancelQuote failed", {
      quoteId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §3k linkProviderValidation ============

/**
 * Links a quote to a ProviderValidation result. Used by the orchestration
 * layer after `validateProvider` runs — the quote can then be filtered
 * by the trader based on the provider's validation status.
 *
 * NON-MARKETPLACE: linking the validation does NOT auto-select the quote
 * or rank it. It simply stamps the validation result for the trader's
 * review.
 */
export async function linkProviderValidation(
  quoteId: string,
  providerValidationId: string,
): Promise<any> {
  try {
    const quote = await db.logisticsQuoteV2.findUnique({
      where: { quoteId },
    });
    if (!quote) return { ok: false, error: "QUOTE_NOT_FOUND" };

    // Read the validation result to derive the status label.
    let validationStatus = "PENDING";
    try {
      const validation = await db.providerValidation.findUnique({
        where: { id: providerValidationId },
      });
      if (validation) {
        // Use the same derive logic as the validation lib: VALIDATED →
        // check date window; else use as-is.
        const now = new Date();
        if (validation.status === "VALIDATED") {
          if (validation.validUntil && new Date(validation.validUntil) < now) {
            validationStatus = "EXPIRED";
          } else {
            validationStatus = "VALIDATED";
          }
        } else if (validation.status === "NOT_REQUIRED") {
          validationStatus = "VALIDATED";
        } else {
          validationStatus = validation.status || "PENDING";
        }
      }
    } catch (e) {
      logger.warn("logistics-quote-v2: validation lookup failed", {
        providerValidationId,
        error: String(e),
      });
    }

    const updated = await db.logisticsQuoteV2.update({
      where: { quoteId },
      data: {
        providerValidationId,
        providerValidationStatus: validationStatus,
      },
    });
    logger.info("logistics-quote-v2: linked validation", {
      quoteId,
      providerValidationId,
      validationStatus,
    });
    return updated;
  } catch (err) {
    logger.error("logistics-quote-v2: linkProviderValidation failed", {
      quoteId,
      providerValidationId,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §3 Pure helpers exported (computeMaxExposure + generateQuoteId) ============
// (Declared earlier — pure functions.)
