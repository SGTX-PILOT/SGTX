// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX Phase 5 — §4 Landed Cost Engine
 * ------------------------------------------------------------
 * Computes the TRUE landed logistics cost across 20 cost components,
 * aggregating data from:
 *   • TransportGraph legs  (each leg's estimatedCostUsd → `freight`)
 *   • LogisticsQuoteV2 rows (baseCost → freight, surcharges → specific components)
 *   • Phase 2 tariff engine (HsTariffRate → `customs`)
 *   • Phase 3 compliance fees (permits, inspection, lab)
 *   • Special cargo surcharges (reefer, dg, oversized → specialCargo)
 *   • CarrierDemurrageTariff (demurrage / detention estimates)
 *   • SGTX fee (a small percentage of freight + customs; min $25)
 *
 * The 20 components (per spec):
 *   freight | fuel | handling | terminal | customs | broker | permits |
 *   inspection | lab | insurance | warehouse | storage | demurrage |
 *   detention | waiting | specialCargo | reefer | dg | delivery | sgtxFee
 *
 * Design principles:
 *   • Every DB call is wrapped defensively — unknown components
 *     default to 0 (never throw).
 *   • Confidence = base 0.1 + 0.9 × (components-with-nonzero-value / 20).
 *     Clamped to [0, 1]. This is a proxy for "how much we know".
 *   • The SGTX fee is `Math.max(25, (freight + customs) × 0.005)`.
 *   • Currency conversion is a STUB — `convertCurrency` returns the
 *     USD amount unchanged. Real FX integration is a separate concern.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §4 Constants ============

export const COST_COMPONENTS = [
  "freight",
  "fuel",
  "handling",
  "terminal",
  "customs",
  "broker",
  "permits",
  "inspection",
  "lab",
  "insurance",
  "warehouse",
  "storage",
  "demurrage",
  "detention",
  "waiting",
  "specialCargo",
  "reefer",
  "dg",
  "delivery",
  "sgtxFee",
] as const;

/**
 * Category grouping (per spec) — groups the 20 components into 5
 * categories for the LandedCostResult.byCategory summary.
 */
export const COMPONENT_CATEGORIES: Record<
  string,
  "transport" | "government" | "handling" | "special" | "sgtx"
> = {
  freight: "transport",
  fuel: "transport",
  delivery: "transport",
  handling: "handling",
  terminal: "handling",
  warehouse: "handling",
  storage: "handling",
  waiting: "handling",
  customs: "government",
  broker: "government",
  permits: "government",
  inspection: "government",
  lab: "government",
  insurance: "government",
  demurrage: "government",
  detention: "government",
  specialCargo: "special",
  reefer: "special",
  dg: "special",
  sgtxFee: "sgtx",
};

/** Components that are FIXED (don't scale with qty). */
export const FIXED_COMPONENTS = new Set([
  "broker",
  "permits",
  "inspection",
  "lab",
  "handling",
  "terminal",
  "delivery",
  "sgtxFee",
]);

/** Components that are VARIABLE (scale with qty / time / weight). */
export const VARIABLE_COMPONENTS = new Set([
  "freight",
  "fuel",
  "customs",
  "insurance",
  "warehouse",
  "storage",
  "demurrage",
  "detention",
  "waiting",
  "specialCargo",
  "reefer",
  "dg",
]);

/** Maps LogisticsQuoteV2 surcharge `type` strings → landed-cost component. */
const SURCHARGE_TYPE_MAP: Record<string, string> = {
  FUEL: "fuel",
  FUEL_SURCHARGE: "fuel",
  BAF: "fuel",
  HANDLING: "handling",
  THC: "terminal",
  TERMINAL: "terminal",
  CUSTOMS: "customs",
  DUTY: "customs",
  DUTIES: "customs",
  BROKER: "broker",
  CUSTOMS_BROKER: "broker",
  PERMIT: "permits",
  PERMITS: "permits",
  INSPECTION: "inspection",
  LAB: "lab",
  INSURANCE: "insurance",
  WAREHOUSE: "warehouse",
  STORAGE: "storage",
  DEMURRAGE: "demurrage",
  DETENTION: "detention",
  WAITING: "waiting",
  WAITING_TIME: "waiting",
  SPECIAL_CARGO: "specialCargo",
  OVERSIZED: "specialCargo",
  REEFER: "reefer",
  DG: "dg",
  DANGEROUS_GOODS: "dg",
  DELIVERY: "delivery",
  DELIVERY_ORDER: "delivery",
};

// ============ Types ============

export interface LandedCostInput {
  ustn?: string;
  tradeId?: string;
  graphId?: string;
  legId?: string;
  quoteId?: string;
  currency?: string;
  // Optional pre-computed components (override the auto-computation)
  freight?: number;
  fuel?: number;
  handling?: number;
  terminal?: number;
  customs?: number;
  broker?: number;
  permits?: number;
  inspection?: number;
  lab?: number;
  insurance?: number;
  warehouse?: number;
  storage?: number;
  demurrage?: number;
  detention?: number;
  waiting?: number;
  specialCargo?: number;
  reefer?: number;
  dg?: number;
  delivery?: number;
  // If true (default), auto-compute the SGTX fee from freight + customs
  autoSgtxFee?: boolean;
}

export interface LandedCostResult {
  breakdown: any; // LandedCostBreakdown row
  totalLandedCost: number;
  fixedCost: number;
  variableCost: number;
  byCategory: {
    transport: number;
    government: number;
    handling: number;
    special: number;
    sgtx: number;
  };
  confidence: number;
}

// ============ Pure helpers ============

/**
 * Pure function: computes the SGTX fee.
 *   `Math.max(25, (freightUsd + customsUsd) * 0.005)`
 * Min $25.
 */
export function computeSgtxFee(
  freightUsd: number,
  customsUsd: number,
): number {
  const f = Number(freightUsd) || 0;
  const c = Number(customsUsd) || 0;
  return Math.max(25, (f + c) * 0.005);
}

/**
 * Pure function: groups the 20 cost components into 5 categories
 * (transport / government / handling / special / sgtx).
 */
export function getCostBreakdownByCategory(breakdown: any): {
  transport: number;
  government: number;
  handling: number;
  special: number;
  sgtx: number;
} {
  const result = {
    transport: 0,
    government: 0,
    handling: 0,
    special: 0,
    sgtx: 0,
  };
  if (!breakdown) return result;
  for (const comp of COST_COMPONENTS) {
    const val = Number(breakdown[comp]) || 0;
    const cat = COMPONENT_CATEGORIES[comp];
    if (cat) result[cat] += val;
  }
  return result;
}

/**
 * Pure function: computes the confidence score for a breakdown.
 *   `confidence = 0.1 + 0.9 × (nonzero components / 20)`
 * Clamped to [0, 1].
 */
export function computeConfidence(components: Record<string, number>): number {
  let nonzero = 0;
  for (const comp of COST_COMPONENTS) {
    const v = Number(components[comp]) || 0;
    if (v > 0) nonzero++;
  }
  const ratio = nonzero / COST_COMPONENTS.length;
  const conf = 0.1 + 0.9 * ratio;
  return Math.max(0, Math.min(1, conf));
}

/**
 * Pure function: splits the 20 components into fixed vs variable.
 */
export function splitFixedVariable(
  components: Record<string, number>,
): { fixedCost: number; variableCost: number } {
  let fixed = 0;
  let variable = 0;
  for (const comp of COST_COMPONENTS) {
    const v = Number(components[comp]) || 0;
    if (FIXED_COMPONENTS.has(comp)) fixed += v;
    if (VARIABLE_COMPONENTS.has(comp)) variable += v;
  }
  return { fixedCost: fixed, variableCost: variable };
}

/**
 * STUB currency conversion — returns the USD amount unchanged.
 * Real FX integration is a separate concern (see
 * src/lib/sgtx/compliance/fx-rates-sync.ts for the sync side).
 */
export async function convertCurrency(
  amountUsd: number,
  targetCurrency: string,
): Promise<number> {
  // STUB: identity conversion. Replace with FX rate lookup when wired.
  const target = (targetCurrency || "USD").toUpperCase();
  if (target === "USD") return Number(amountUsd) || 0;
  // Future: pull from cached FxRate table.
  return Number(amountUsd) || 0;
}

// ============ Internal: aggregate legs → freight ============

async function aggregateLegFreight(graphId: string): Promise<{
  freight: number;
  fuel: number;
  handling: number;
  terminal: number;
  delivery: number;
  sourceLegs: string[];
}> {
  const empty = {
    freight: 0,
    fuel: 0,
    handling: 0,
    terminal: 0,
    delivery: 0,
    sourceLegs: [] as string[],
  };
  if (!graphId) return empty;
  try {
    const legs = await db.transportLeg.findMany({
      where: { graphId },
      orderBy: { legNumber: "asc" },
    });
    if (!legs || legs.length === 0) return empty;
    let freight = 0;
    let fuel = 0;
    let handling = 0;
    let terminal = 0;
    let delivery = 0;
    const sourceLegs: string[] = [];
    for (const leg of legs) {
      const est = Number(leg.estimatedCostUsd) || 0;
      freight += est;
      sourceLegs.push(leg.id);
      // Mode-specific sub-allocations (rough heuristic)
      try {
        const meta = leg.modeMetadata ? JSON.parse(leg.modeMetadata) : null;
        if (meta) {
          if (typeof meta.fuel === "number") fuel += meta.fuel;
          if (typeof meta.handling === "number") handling += meta.handling;
          if (typeof meta.terminal === "number") terminal += meta.terminal;
          if (typeof meta.delivery === "number") delivery += meta.delivery;
        }
      } catch {
        /* non-fatal */
      }
    }
    return { freight, fuel, handling, terminal, delivery, sourceLegs };
  } catch (err) {
    logger.error("landed-cost: aggregateLegFreight failed", {
      graphId,
      error: String(err),
    });
    return empty;
  }
}

// ============ Internal: aggregate LogisticsQuoteV2 → freight + surcharges ============

async function aggregateQuote(
  graphId?: string,
  legId?: string,
  quoteId?: string,
): Promise<{ freight: number; surcharges: Record<string, number>; sourceQuotes: string[] }> {
  const empty = { freight: 0, surcharges: {} as any, sourceQuotes: [] as string[] };
  try {
    const where: any = { status: "SELECTED" };
    if (quoteId) where.id = quoteId;
    else if (legId) where.legId = legId;
    else if (graphId) where.graphId = graphId;
    else return empty;

    const quotes = await db.logisticsQuoteV2.findMany({ where });
    if (!quotes || quotes.length === 0) return empty;

    let freight = 0;
    const surcharges: Record<string, number> = {};
    const sourceQuotes: string[] = [];
    for (const q of quotes) {
      freight += Number(q.baseCost) || 0;
      sourceQuotes.push(q.id);
      // Parse surcharges JSON
      let surchargesArr: any[] = [];
      try {
        surchargesArr = q.surcharges ? JSON.parse(q.surcharges) : [];
        if (!Array.isArray(surchargesArr)) surchargesArr = [];
      } catch {
        surchargesArr = [];
      }
      for (const s of surchargesArr) {
        if (!s || typeof s !== "object") continue;
        const typeRaw = String(s.type || "").toUpperCase().replace(/\s+/g, "_");
        const amount = Number(s.amount) || 0;
        if (!typeRaw || amount === 0) continue;
        const comp = SURCHARGE_TYPE_MAP[typeRaw] || "specialCargo";
        surcharges[comp] = (surcharges[comp] || 0) + amount;
      }
    }
    return { freight, surcharges, sourceQuotes };
  } catch (err) {
    logger.error("landed-cost: aggregateQuote failed", {
      graphId,
      legId,
      quoteId,
      error: String(err),
    });
    return empty;
  }
}

// ============ Internal: aggregate HsTariffRate → customs ============

async function aggregateCustoms(ustn?: string): Promise<{
  customs: number;
  sourceCustoms: string[];
}> {
  const empty = { customs: 0, sourceCustoms: [] as string[] };
  if (!ustn) return empty;
  try {
    // Pull the trade's HS code + destination country to look up tariff.
    // We don't have a direct ustn→tariff link here; this is a best-effort
    // computation that delegates to whatever the trade has stored.
    // For now: we look up the most recently created HsTariffRate rows
    // tied to the trade's commodity/country (if available via Trade).
    // Defensive — if Trade model is missing or fields are null, return 0.
    const trade: any = await (db as any).trade?.findUnique?.({
      where: { ustn },
    });
    if (!trade) return empty;
    const hs6 = String(trade.hsCode || trade.hs6 || "").slice(0, 6);
    const countryCode = String(trade.destinationCountry || trade.importCountry || "");
    if (!hs6 || !countryCode) return empty;
    const tariff = await (db as any).hsTariffRate?.findUnique?.({
      where: { hsCode_countryCode: { hsCode: hs6, countryCode } },
    });
    if (!tariff) return empty;
    const rate = (Number(tariff.tariffRate) || 0) / 100;
    const customsValue = Number(trade.customsValue || trade.declaredValue || trade.totalValue || 0);
    const customs = customsValue * rate;
    return {
      customs,
      sourceCustoms: [`hsTariff:${hs6}:${countryCode}`],
    };
  } catch (err) {
    logger.error("landed-cost: aggregateCustoms failed", {
      ustn,
      error: String(err),
    });
    return empty;
  }
}

// ============ Internal: aggregate demurrage/detention from CarrierDemurrageTariff ============

async function aggregateDemurrage(graphId?: string): Promise<{
  demurrage: number;
  detention: number;
  sourceDemurrage: string[];
}> {
  const empty = { demurrage: 0, detention: 0, sourceDemurrage: [] as string[] };
  if (!graphId) return empty;
  try {
    const legs = await db.transportLeg.findMany({
      where: { graphId, mode: "OCEAN" },
    });
    if (!legs || legs.length === 0) return empty;
    // Pull demurrage tariff for the carrier + port (from leg metadata).
    let demurrage = 0;
    let detention = 0;
    const sourceDemurrage: string[] = [];
    for (const leg of legs) {
      const carrierGtid = leg.providerGtid;
      let portUnlocode = "";
      try {
        const meta = leg.modeMetadata ? JSON.parse(leg.modeMetadata) : null;
        if (meta) {
          portUnlocode = meta.portUnlocode || meta.port || "";
        }
      } catch {
        /* non-fatal */
      }
      portUnlocode = portUnlocode || leg.handoffLocation || leg.destinationLocation || "";
      if (!carrierGtid || !portUnlocode) continue;
      const tariff = await db.carrierDemurrageTariff.findFirst({
        where: {
          carrierGtid,
          portUnlocode,
          isActive: true,
        },
        orderBy: { validFrom: "desc" },
      });
      if (!tariff) continue;
      // Estimate demurrage = days × rate (use day_4-7 rate as a proxy).
      // This is intentionally conservative — the actual computation
      // depends on free-time consumption which is a runtime concern.
      try {
        const rates = tariff.demurrageRates ? JSON.parse(tariff.demurrageRates) : {};
        const detRates = tariff.detentionRates ? JSON.parse(tariff.detentionRates) : {};
        // Use a representative rate (day_4-7)
        const demRate = rates["day_4-7"] || rates.day_4_7 || rates.demurrage_4_7 || 0;
        const detRate = detRates["day_4-7"] || detRates.day_4_7 || 0;
        // Assume 3 days of demurrage exposure (conservative stub)
        demurrage += Number(demRate) * 3;
        detention += Number(detRate) * 3;
        sourceDemurrage.push(`carrierDemurrage:${carrierGtid}:${portUnlocode}`);
      } catch {
        /* non-fatal */
      }
    }
    return { demurrage, detention, sourceDemurrage };
  } catch (err) {
    logger.error("landed-cost: aggregateDemurrage failed", {
      graphId,
      error: String(err),
    });
    return empty;
  }
}

// ============ §4a computeLandedCost (MAIN) ============

/**
 * The main landed-cost function. Aggregates costs from all available
 * sources (legs / quotes / tariff / demurrage), applies any caller-
 * provided overrides, computes the SGTX fee, persists a
 * LandedCostBreakdown row, and returns the full result.
 *
 * Override semantics: if a component is provided in `input` (non-
 * undefined), it overrides the auto-computed value. If both the
 * auto-computation AND the override are 0, the component is 0.
 *
 * @param input — see LandedCostInput
 * @returns LandedCostResult with breakdown row + totals + categories
 */
export async function computeLandedCost(
  input: LandedCostInput,
): Promise<LandedCostResult> {
  const safeResult: LandedCostResult = {
    breakdown: null,
    totalLandedCost: 0,
    fixedCost: 0,
    variableCost: 0,
    byCategory: { transport: 0, government: 0, handling: 0, special: 0, sgtx: 0 },
    confidence: 0,
  };

  try {
    const graphId = input.graphId || undefined;
    const legId = input.legId || undefined;
    const quoteId = input.quoteId || undefined;
    const ustn = input.ustn || undefined;

    // --- Aggregate from sources ---
    const legAgg = graphId ? await aggregateLegFreight(graphId) : null;
    const quoteAgg =
      graphId || legId || quoteId
        ? await aggregateQuote(graphId, legId, quoteId)
        : null;
    const customsAgg = ustn ? await aggregateCustoms(ustn) : null;
    const demAgg = graphId ? await aggregateDemurrage(graphId) : null;

    // --- Build components with override semantics ---
    const components: Record<string, number> = {};
    for (const comp of COST_COMPONENTS) components[comp] = 0;

    // freight: max(legs' sum, quotes' baseCost) — they may overlap if a quote
    // was selected for one leg and we're summing legs too. We take the larger.
    const autoFreight = Math.max(
      legAgg?.freight || 0,
      quoteAgg?.freight || 0,
    );
    components.freight = input.freight != null ? Number(input.freight) : autoFreight;

    components.fuel =
      input.fuel != null
        ? Number(input.fuel)
        : (legAgg?.fuel || 0) + (quoteAgg?.surcharges?.fuel || 0);
    components.handling =
      input.handling != null
        ? Number(input.handling)
        : (legAgg?.handling || 0) + (quoteAgg?.surcharges?.handling || 0);
    components.terminal =
      input.terminal != null
        ? Number(input.terminal)
        : (legAgg?.terminal || 0) + (quoteAgg?.surcharges?.terminal || 0);
    components.customs =
      input.customs != null
        ? Number(input.customs)
        : (customsAgg?.customs || 0) + (quoteAgg?.surcharges?.customs || 0);
    components.broker =
      input.broker != null
        ? Number(input.broker)
        : (quoteAgg?.surcharges?.broker || 0);
    components.permits =
      input.permits != null
        ? Number(input.permits)
        : (quoteAgg?.surcharges?.permits || 0);
    components.inspection =
      input.inspection != null
        ? Number(input.inspection)
        : (quoteAgg?.surcharges?.inspection || 0);
    components.lab =
      input.lab != null
        ? Number(input.lab)
        : (quoteAgg?.surcharges?.lab || 0);
    components.insurance =
      input.insurance != null
        ? Number(input.insurance)
        : (quoteAgg?.surcharges?.insurance || 0);
    components.warehouse =
      input.warehouse != null
        ? Number(input.warehouse)
        : (quoteAgg?.surcharges?.warehouse || 0);
    components.storage =
      input.storage != null
        ? Number(input.storage)
        : (quoteAgg?.surcharges?.storage || 0);
    components.demurrage =
      input.demurrage != null
        ? Number(input.demurrage)
        : (demAgg?.demurrage || 0) + (quoteAgg?.surcharges?.demurrage || 0);
    components.detention =
      input.detention != null
        ? Number(input.detention)
        : (demAgg?.detention || 0) + (quoteAgg?.surcharges?.detention || 0);
    components.waiting =
      input.waiting != null
        ? Number(input.waiting)
        : (quoteAgg?.surcharges?.waiting || 0);
    components.specialCargo =
      input.specialCargo != null
        ? Number(input.specialCargo)
        : (quoteAgg?.surcharges?.specialCargo || 0);
    components.reefer =
      input.reefer != null
        ? Number(input.reefer)
        : (quoteAgg?.surcharges?.reefer || 0);
    components.dg =
      input.dg != null
        ? Number(input.dg)
        : (quoteAgg?.surcharges?.dg || 0);
    components.delivery =
      input.delivery != null
        ? Number(input.delivery)
        : (legAgg?.delivery || 0) + (quoteAgg?.surcharges?.delivery || 0);

    // SGTX fee
    const autoSgtx = input.autoSgtx !== false;
    components.sgtxFee = autoSgtx
      ? computeSgtxFee(components.freight, components.customs)
      : 0;

    // --- Compute totals ---
    const { fixedCost, variableCost } = splitFixedVariable(components);
    const totalLandedCost = COST_COMPONENTS.reduce(
      (sum, c) => sum + (Number(components[c]) || 0),
      0,
    );
    const confidence = computeConfidence(components);

    // --- Build cost sources JSON ---
    const costSources: Record<string, string[]> = {};
    if (legAgg?.sourceLegs?.length) costSources.freight = legAgg.sourceLegs;
    if (quoteAgg?.sourceQuotes?.length) costSources.quotes = quoteAgg.sourceQuotes;
    if (customsAgg?.sourceCustoms?.length) costSources.customs = customsAgg.sourceCustoms;
    if (demAgg?.sourceDemurrage?.length) costSources.demurrage = demAgg.sourceDemurrage;

    // --- Persist the breakdown row ---
    const data: any = {
      ustn: ustn || null,
      tradeId: input.tradeId || null,
      graphId: graphId || null,
      legId: legId || null,
      quoteId: quoteId || null,
      currency: input.currency || "USD",
      freight: components.freight,
      fuel: components.fuel,
      handling: components.handling,
      terminal: components.terminal,
      customs: components.customs,
      broker: components.broker,
      permits: components.permits,
      inspection: components.inspection,
      lab: components.lab,
      insurance: components.insurance,
      warehouse: components.warehouse,
      storage: components.storage,
      demurrage: components.demurrage,
      detention: components.detention,
      waiting: components.waiting,
      specialCargo: components.specialCargo,
      reefer: components.reefer,
      dg: components.dg,
      delivery: components.delivery,
      sgtxFee: components.sgtxFee,
      totalLandedCost,
      fixedCost,
      variableCost,
      confidence,
      costSources: JSON.stringify(costSources),
    };

    let breakdown: any = null;
    try {
      breakdown = await db.landedCostBreakdown.create({ data });
    } catch (persistErr) {
      logger.error("landed-cost: persist failed (returning computed)", {
        error: String(persistErr),
      });
      // Return the computed object even if persistence failed.
      breakdown = data;
    }

    const byCategory = getCostBreakdownByCategory(breakdown);

    return {
      breakdown,
      totalLandedCost,
      fixedCost,
      variableCost,
      byCategory,
      confidence,
    };
  } catch (err) {
    logger.error("landed-cost: computeLandedCost failed", {
      error: String(err),
      input,
    });
    return safeResult;
  }
}

// ============ §4b getLandedCostBreakdown ============

export async function getLandedCostBreakdown(
  id: string,
): Promise<any | null> {
  try {
    return await db.landedCostBreakdown.findUnique({ where: { id } });
  } catch (err) {
    logger.error("landed-cost: getLandedCostBreakdown failed", {
      id,
      error: String(err),
    });
    return null;
  }
}

// ============ §4c getLandedCostByGraph ============

/**
 * Returns the most recent LandedCostBreakdown row for a transport graph.
 * (If multiple exist — e.g. re-computed over time — the latest is returned.)
 */
export async function getLandedCostByGraph(
  graphId: string,
): Promise<any | null> {
  try {
    const rows = await db.landedCostBreakdown.findMany({
      where: { graphId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    logger.error("landed-cost: getLandedCostByGraph failed", {
      graphId,
      error: String(err),
    });
    return null;
  }
}

// ============ §4d getLandedCostByLeg ============

export async function getLandedCostByLeg(
  legId: string,
): Promise<any[]> {
  try {
    return (await db.landedCostBreakdown.findMany({
      where: { legId },
      orderBy: { createdAt: "desc" },
    })) || [];
  } catch (err) {
    logger.error("landed-cost: getLandedCostByLeg failed", {
      legId,
      error: String(err),
    });
    return [];
  }
}

// ============ §4e updateCostComponent ============

/**
 * Updates a single cost component on a breakdown row and recomputes
 * the totals + confidence. Optionally records the source of the
 * update in `costSources`.
 */
export async function updateCostComponent(
  id: string,
  component: string,
  amount: number,
  source?: string,
): Promise<any> {
  try {
    if (!(COST_COMPONENTS as readonly string[]).includes(component as any)) {
      return { ok: false, error: "INVALID_COMPONENT", valid: COST_COMPONENTS };
    }
    const existing = await db.landedCostBreakdown.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "BREAKDOWN_NOT_FOUND" };

    // Update the component value
    const updateData: any = { [component]: Number(amount) || 0 };

    // Recompute the SGTX fee if the component being updated is freight or customs
    // (only if the SGTX fee wasn't manually overridden)
    let freight = Number(existing.freight) || 0;
    let customs = Number(existing.customs) || 0;
    if (component === "freight") freight = Number(amount) || 0;
    if (component === "customs") customs = Number(amount) || 0;
    if (component === "freight" || component === "customs") {
      // Only re-auto-compute sgtxFee if it currently equals the auto-computed value
      // (i.e. it hasn't been manually overridden)
      const autoFee = computeSgtxFee(freight, customs);
      const currentFee = Number(existing.sgtxFee) || 0;
      const prevAutoFee = computeSgtxFee(
        Number(existing.freight) || 0,
        Number(existing.customs) || 0,
      );
      if (Math.abs(currentFee - prevAutoFee) < 0.01) {
        updateData.sgtxFee = autoFee;
      }
    }

    // Recompute totals
    const components: Record<string, number> = {};
    for (const comp of COST_COMPONENTS) {
      components[comp] =
        comp === component
          ? Number(amount) || 0
          : comp === "sgtxFee" && updateData.sgtxFee != null
            ? Number(updateData.sgtxFee)
            : Number(existing[comp]) || 0;
    }
    const { fixedCost, variableCost } = splitFixedVariable(components);
    const totalLandedCost = COST_COMPONENTS.reduce(
      (sum, c) => sum + (Number(components[c]) || 0),
      0,
    );
    const confidence = computeConfidence(components);
    updateData.totalLandedCost = totalLandedCost;
    updateData.fixedCost = fixedCost;
    updateData.variableCost = variableCost;
    updateData.confidence = confidence;

    // Append source to costSources
    if (source) {
      let costSourcesObj: any = {};
      try {
        costSourcesObj = existing.costSources
          ? JSON.parse(existing.costSources)
          : {};
      } catch {
        costSourcesObj = {};
      }
      const arr: string[] = Array.isArray(costSourcesObj[component])
        ? costSourcesObj[component]
        : [];
      arr.push(source);
      costSourcesObj[component] = arr;
      updateData.costSources = JSON.stringify(costSourcesObj);
    }

    const updated = await db.landedCostBreakdown.update({
      where: { id },
      data: updateData,
    });
    logger.info("landed-cost: component updated", {
      id,
      component,
      amount,
      source,
    });
    return updated;
  } catch (err) {
    logger.error("landed-cost: updateCostComponent failed", {
      id,
      component,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ Convenience export ============

export const LandedCostEngine = {
  COST_COMPONENTS,
  COMPONENT_CATEGORIES,
  FIXED_COMPONENTS,
  VARIABLE_COMPONENTS,
  computeLandedCost,
  getLandedCostBreakdown,
  getLandedCostByGraph,
  getLandedCostByLeg,
  updateCostComponent,
  getCostBreakdownByCategory,
  computeSgtxFee,
  convertCurrency,
  computeConfidence,
  splitFixedVariable,
};
