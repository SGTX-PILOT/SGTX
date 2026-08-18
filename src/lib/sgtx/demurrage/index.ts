// SGTX Part 32 — Add-On 9: Demurrage & Detention Management (CCL-006)
//
// Pure calculation engine (no DB) for demurrage + detention charges on
// containers held at port beyond their free-time window.
//
// Demurrage: charge for containers sitting in the terminal beyond free time
//            (BEFORE gate-out / pickup).
// Detention: charge for containers kept outside the terminal beyond the
//            detention free time (AFTER gate-out / pickup, before return).
//
// Statuses follow the §32 lifecycle:
//   NOT_STARTED       — release date is in the future
//   FREE_TIME         — within free-time window (>48h remaining)
//   WARNING_48H       — free time expiring within 48h (but >24h)
//   WARNING_24H       — free time expiring within 24h
//   DEMURRAGE_STARTED — past free time, container still in terminal (no gate-out)
//   DETENTION_STARTED — gate-out has occurred, past detention free time
//   ESCALATED         — excess days ≥ 14 OR total amount ≥ $5,000
//
// The API routes (under /api/sgtx/demurrage/*) wrap this pure engine and
// persist results into the DemurrageTracking / DemurrageAlert / DemurrageDispute
// Prisma models. The seedPortFreeTime() helper bootstraps the PortFreeTime table.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §32.1.2 — Port-specific free time (PORT_FREE_TIME) ============
// Port free time per the blueprint. Most ports give a free-time window and an
// optional extension (negotiable on a case-by-case basis; usually requires
// carrier approval or port authority sign-off).
//
// extensionPolicy:
//   AUTO_APPROVE      — extension is granted on request without review
//   APPROVAL_REQUIRED — extension requires carrier/port authority approval
//   NOT_AVAILABLE     — extension cannot be granted
//
// Container-type differentiation is not in the blueprint, so the same free time
// is applied to all container types for a given port. The PortFreeTime table
// (seeded by seedPortFreeTime) still persists per (portUnlocode, containerType)
// because the schema mandates that uniqueness, and future carrier-specific
// overrides may differentiate by container type.

export interface PortFreeTimeEntry {
  freeTimeDays: number;
  extensionDays: number;
  extensionPolicy: "AUTO_APPROVE" | "APPROVAL_REQUIRED" | "NOT_AVAILABLE";
  country: string;
  portName: string;
}

export const PORT_FREE_TIME: Record<string, PortFreeTimeEntry> = {
  // Egypt (EG) — shorter free time, smaller extensions
  EGALX: { freeTimeDays: 5, extensionDays: 3, extensionPolicy: "APPROVAL_REQUIRED", country: "EG", portName: "Alexandria" },
  EGDMT: { freeTimeDays: 5, extensionDays: 3, extensionPolicy: "APPROVAL_REQUIRED", country: "EG", portName: "Damietta" },
  EGPSD: { freeTimeDays: 5, extensionDays: 3, extensionPolicy: "APPROVAL_REQUIRED", country: "EG", portName: "Port Said" },
  EGSAF: { freeTimeDays: 7, extensionDays: 5, extensionPolicy: "APPROVAL_REQUIRED", country: "EG", portName: "Safaga" },
  EGPTW: { freeTimeDays: 7, extensionDays: 5, extensionPolicy: "APPROVAL_REQUIRED", country: "EG", portName: "Port Tawfik" },
  // Germany (DE) — generous extensions (Northern European hub practice)
  DEHAM: { freeTimeDays: 7, extensionDays: 14, extensionPolicy: "AUTO_APPROVE", country: "DE", portName: "Hamburg" },
  DEBRV: { freeTimeDays: 7, extensionDays: 14, extensionPolicy: "AUTO_APPROVE", country: "DE", portName: "Bremerhaven" },
  // UAE (AE) — Jebel Ali / Khalifa: standard 7 + 14
  AEJEA: { freeTimeDays: 7, extensionDays: 14, extensionPolicy: "APPROVAL_REQUIRED", country: "AE", portName: "Jebel Ali" },
  AEKLF: { freeTimeDays: 7, extensionDays: 14, extensionPolicy: "APPROVAL_REQUIRED", country: "AE", portName: "Khalifa" },
  // Saudi Arabia (SA) — Red Sea / Gulf ports
  SAJED: { freeTimeDays: 7, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "SA", portName: "Jeddah" },
  SADMM: { freeTimeDays: 7, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "SA", portName: "Dammam" },
  SAYNB: { freeTimeDays: 7, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "SA", portName: "Yanbu" },
  // Italy (IT) — Mediterranean ports
  ITTRI: { freeTimeDays: 5, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "IT", portName: "Trieste" },
  ITLIV: { freeTimeDays: 5, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "IT", portName: "Livorno" },
  ITGOA: { freeTimeDays: 5, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "IT", portName: "Genoa" },
  // USA (US) — short free time at congested coastal hubs
  USNYC: { freeTimeDays: 4, extensionDays: 7, extensionPolicy: "APPROVAL_REQUIRED", country: "US", portName: "New York" },
  USLAX: { freeTimeDays: 4, extensionDays: 7, extensionPolicy: "APPROVAL_REQUIRED", country: "US", portName: "Los Angeles" },
  // UK (GB) — Felixstowe / Southampton
  GBFXT: { freeTimeDays: 5, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "GB", portName: "Felixstowe" },
  GBSOU: { freeTimeDays: 5, extensionDays: 10, extensionPolicy: "APPROVAL_REQUIRED", country: "GB", portName: "Southampton" },
};

// Default container types seeded per port (schema @@unique([portUnlocode, containerType]))
export const CONTAINER_TYPES = ["20FT", "40FT", "40HC", "REEFER", "OPEN_TOP", "FLAT_RACK"] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

// Default demurrage tier rates (USD/day) when no carrier-specific tariff is supplied.
// Modeled on the structure shown in the task spec:
//   { day_1-3: 0, day_4-7: 150, day_8-14: 200, day_15+: 250 }
// These are tiered — each excess day is priced at the rate for its tier.
const DEFAULT_DEMURRAGE_RATES: Record<string, number> = {
  "day_1-3": 0,
  "day_4-7": 150,
  "day_8-14": 200,
  "day_15+": 250,
};

const DEFAULT_DETENTION_RATES: Record<string, number> = {
  "day_1-3": 0,
  "day_4-7": 100,
  "day_8-14": 150,
  "day_15+": 200,
};

// ============ Rate tier parsing & tiered cost computation ============

interface RateTier {
  from: number;       // inclusive start day (1-indexed, absolute day since release)
  to: number | null;  // inclusive end day, or null for open-ended (e.g., day_15+)
  rate: number;       // USD per day in this tier
}

/**
 * Parse a rate map like { "day_1-3": 0, "day_4-7": 150, "day_8-14": 200, "day_15+": 250 }
 * into a sorted list of tiers.
 *
 * Accepted key formats:
 *   "day_N-M"  → days N through M inclusive
 *   "day_N+"   → days N onwards (open-ended)
 *
 * Unknown keys are skipped (with a warning log). Tiers are returned sorted by `from`.
 */
function parseRateTiers(rates: Record<string, number>): RateTier[] {
  const tiers: RateTier[] = [];
  for (const [key, rate] of Object.entries(rates)) {
    // Accepted formats: "day_N-M", "day_N+", "day_N-∞", "day_N" (single day)
    const m = key.match(/^day_(\d+)(?:-(\d+|∞))?(\+)?$/i);
    if (!m) {
      logger.warn(`[demurrage] unparseable rate key, skipping`, { key, rate });
      continue;
    }
    const from = parseInt(m[1], 10);
    const openEnded = !!m[3] || m[2] === "+" || m[2] === "∞";
    const to = openEnded ? null : (m[2] ? parseInt(m[2], 10) : from);
    tiers.push({ from, to, rate: Number(rate) || 0 });
  }
  tiers.sort((a, b) => a.from - b.from);
  return tiers;
}

/**
 * Compute the demurrage/detention cost over `daysUsed` absolute days since release,
 * given a set of tiered rates.
 *
 * Returns the breakdown (per tier with the days falling in that tier) and the total.
 *
 * Algorithm: walk day-by-day (1-indexed absolute day), look up the tier whose range
 * contains that day, accumulate (days × rate) per tier. Days where no tier matches
 * default to the highest-tier rate (or 0 if there are no tiers — defensive).
 */
function computeTieredCost(
  daysUsed: number,
  tiers: RateTier[],
): { breakdown: { dayRange: string; days: number; rate: number; amount: number }[]; total: number } {
  if (daysUsed <= 0 || tiers.length === 0) {
    return { breakdown: [], total: 0 };
  }

  // Index by start day for fast lookup; also keep the open-ended tail.
  const bucket: Record<number, { days: number; tier: RateTier }> = {};
  let fallbackRate = 0;
  for (const t of tiers) {
    fallbackRate = Math.max(fallbackRate, t.rate); // last-tier wins for overflow
    bucket[t.from] = { days: 0, tier: t };
  }
  // For each absolute day, find the active tier.
  const sortedStarts = Object.keys(bucket).map(Number).sort((a, b) => a - b);
  for (let day = 1; day <= daysUsed; day++) {
    let activeStart: number | null = null;
    for (const s of sortedStarts) {
      if (s <= day) activeStart = s;
      else break;
    }
    if (activeStart === null) {
      // No tier covers this day — skip (rate 0, shouldn't happen if tier_1-3 is present).
      continue;
    }
    const entry = bucket[activeStart];
    // If the tier has a closed end and the day exceeds it, fall through to fallback.
    if (entry.tier.to !== null && day > entry.tier.to) {
      // Find the open-ended tier (if any) and attribute the day there, else fallback flat rate.
      const openTier = tiers.find((t) => t.to === null);
      if (openTier) {
        const o = bucket[openTier.from];
        if (o) { o.days++; continue; }
      }
      // Otherwise, accumulate into a synthetic "day_overflow" bucket at fallbackRate.
      const overflowKey = -1;
      if (!bucket[overflowKey]) {
        bucket[overflowKey] = { days: 0, tier: { from: 0, to: null, rate: fallbackRate } };
      }
      bucket[overflowKey].days++;
      continue;
    }
    entry.days++;
  }

  const breakdown: { dayRange: string; days: number; rate: number; amount: number }[] = [];
  let total = 0;
  for (const start of sortedStarts) {
    const { days, tier } = bucket[start];
    if (days <= 0) continue;
    const rangeLabel = tier.to === null
      ? `day_${tier.from}+`
      : tier.to === tier.from
        ? `day_${tier.from}`
        : `day_${tier.from}-${tier.to}`;
    const amount = +(days * tier.rate).toFixed(2);
    breakdown.push({ dayRange: rangeLabel, days, rate: tier.rate, amount });
    total += amount;
  }
  // Overflow bucket (synthetic) — emit if it accumulated any days.
  if (bucket[-1] && bucket[-1].days > 0) {
    const { days, tier } = bucket[-1];
    const amount = +(days * tier.rate).toFixed(2);
    breakdown.push({ dayRange: "day_overflow", days, rate: tier.rate, amount });
    total += amount;
  }
  return { breakdown, total: +total.toFixed(2) };
}

// ============ Public types ============

export interface DemurrageCalculation {
  daysUsed: number;
  excessDays: number;
  demurrageAmount: number;
  detentionAmount: number;
  totalAmount: number;
  status: string; // NOT_STARTED | FREE_TIME | WARNING_48H | WARNING_24H | DEMURRAGE_STARTED | DETENTION_STARTED | ESCALATED
  breakdown?: { dayRange: string; days: number; rate: number; amount: number }[];
  explanation: string;
}

export interface CalculateDemurrageInput {
  containerType: string;
  carrier: string;
  port: string;
  releaseDate: Date;
  gateOutDate?: Date;
  freeTimeDays: number;
  carrierTariff?: {
    demurrageRates: Record<string, number>; // {day_1-3: 0, day_4-7: 150, ...}
    detentionRates: Record<string, number>;
  };
}

// ============ Status derivation ============

const MS_PER_DAY = 86_400_000;
const ESCALATION_EXCESS_DAYS = 14;
const ESCALATION_AMOUNT_USD = 5_000;

/**
 * Derive the demurrage status for a container based on its release date,
 * free-time window, and (optional) gate-out date.
 *
 * The "now" reference is taken from Date.now() unless an explicit `asOf` is
 * supplied (used by the forecast route to project future states).
 */
export function deriveDemurrageStatus(
  releaseDate: Date,
  freeTimeDays: number,
  gateOutDate?: Date,
  asOf: Date = new Date(),
): string {
  const now = asOf.getTime();
  const release = releaseDate.getTime();

  // 1) Release date is in the future → not started yet.
  if (now < release) return "NOT_STARTED";

  const freeTimeEndsAt = release + freeTimeDays * MS_PER_DAY;
  const msRemaining = freeTimeEndsAt - now;

  // 2) Still within free time.
  if (msRemaining > 0) {
    const hoursRemaining = msRemaining / 3_600_000;
    if (hoursRemaining <= 24) return "WARNING_24H";
    if (hoursRemaining <= 48) return "WARNING_48H";
    return "FREE_TIME";
  }

  // 3) Past free time.
  //    If container has been gated out, detention clock starts at gate-out.
  //    Detention free time is assumed equal to demurrage free time (standard practice).
  if (gateOutDate) {
    const gateOut = gateOutDate.getTime();
    if (now < gateOut) {
      // Defensive — gate-out recorded before free time expired (unusual but possible).
      return "DEMURRAGE_STARTED";
    }
    const detentionFreeEndsAt = gateOut + freeTimeDays * MS_PER_DAY;
    if (now <= detentionFreeEndsAt) {
      // Within detention free time — but demurrage already started (free time expired pre-gate-out).
      return "DEMURRAGE_STARTED";
    }
    return "DETENTION_STARTED";
  }

  // 4) Past free time, no gate-out → demurrage accumulating.
  return "DEMURRAGE_STARTED";
}

// ============ Port free-time lookup ============

/**
 * Look up the free-time window (in days) for a given port + container type.
 *
 * Resolution order:
 *   1. Carrier-specific tariff (if supplied by caller — caller is responsible
 *      for having looked it up from CarrierDemurrageTariff first).
 *   2. PORT_FREE_TIME constant (the §32.1.2 default table).
 *   3. Fallback: 7 days (industry default).
 *
 * Container-type differentiation is not present in PORT_FREE_TIME today — the
 * same free time applies to all container types for a given port. The signature
 * accepts containerType for forward compatibility (e.g., reefer vs dry).
 */
export function getPortFreeTime(portUnlocode: string, containerType: string): number {
  const entry = PORT_FREE_TIME[portUnlocode.toUpperCase()];
  if (entry) return entry.freeTimeDays;
  logger.debug("[demurrage] port not in PORT_FREE_TIME, using fallback", { portUnlocode, containerType });
  return 7; // industry default
}

/**
 * Get the full port free-time entry (including extension policy).
 */
export function getPortFreeTimeEntry(portUnlocode: string): PortFreeTimeEntry | null {
  return PORT_FREE_TIME[portUnlocode.toUpperCase()] || null;
}

// ============ Core calculation ============

/**
 * Calculate demurrage + detention charges for a container.
 *
 * This is a PURE function (no DB I/O, no side effects). The caller (API route)
 * is responsible for persisting the result.
 *
 * Time reference: Date.now() unless `asOf` is supplied (used by forecast route).
 *
 * Logic:
 *   - daysUsed = absolute days since release (rounded down)
 *   - excessDays = max(0, daysUsed - freeTimeDays)
 *   - demurrageAmount = sum over carrierTariff.demurrageRates tiers (or DEFAULT_DEMURRAGE_RATES)
 *       for the days from freeTimeDays+1 .. daysUsed (or up to gateOutDate, if set)
 *   - detentionAmount = if gateOutDate is set and now > gateOutDate + freeTimeDays:
 *       sum over carrierTariff.detentionRates (or DEFAULT_DETENTION_RATES) for the
 *       detention-excess days (from gateOut + freeTimeDays + 1 .. now)
 *   - status = deriveDemurrageStatus(...)
 *   - ESCALATED overrides status if excessDays ≥ 14 OR totalAmount ≥ $5,000
 *   - breakdown = per-tier breakdown of demurrage (primary cost driver)
 */
export function calculateDemurrage(input: CalculateDemurrageInput, asOf: Date = new Date()): DemurrageCalculation {
  const { releaseDate, gateOutDate, freeTimeDays, carrierTariff } = input;

  const now = asOf.getTime();
  const release = releaseDate.getTime();

  // Days used (absolute, since release). 0 if release is in the future.
  const daysUsed = now <= release ? 0 : Math.floor((now - release) / MS_PER_DAY);

  // Demurrage excess days: from freeTimeDays+1 to (gateOut day, or daysUsed).
  // If gate-out has occurred, demurrage stops accumulating at gate-out (and
  // detention takes over after the detention free time). Otherwise demurrage
  // accumulates up to today.
  let demurrageExcessDays: number;
  if (gateOutDate) {
    const gateOut = gateOutDate.getTime();
    const demurrageEndDay = gateOut <= release ? 0 : Math.floor((gateOut - release) / MS_PER_DAY);
    demurrageExcessDays = Math.max(0, Math.min(demurrageEndDay, daysUsed) - freeTimeDays);
  } else {
    demurrageExcessDays = Math.max(0, daysUsed - freeTimeDays);
  }

  // Detention excess days: if gate-out, from (gateOut + freeTimeDays + 1) .. now.
  let detentionExcessDays = 0;
  if (gateOutDate) {
    const gateOut = gateOutDate.getTime();
    if (now > gateOut) {
      const detentionDaysUsed = Math.floor((now - gateOut) / MS_PER_DAY);
      detentionExcessDays = Math.max(0, detentionDaysUsed - freeTimeDays);
    }
  }

  // Pick rate tables
  const demurrageRates = carrierTariff?.demurrageRates || DEFAULT_DEMURRAGE_RATES;
  const detentionRates = carrierTariff?.detentionRates || DEFAULT_DETENTION_RATES;

  // Parse tiers once
  const demurrageTiers = parseRateTiers(demurrageRates);
  const detentionTiers = parseRateTiers(detentionRates);

  // Compute tiered demurrage cost over the full daysUsed window (tier rates already
  // include the free-time tier with rate=0, so excess-only attribution falls out
  // naturally — days within free time contribute $0 to the total).
  const demurrageResult = computeTieredCost(daysUsed, demurrageTiers);
  const detentionResult = gateOutDate
    ? computeTieredCost(
        gateOutDate.getTime() > now ? 0 : Math.floor((now - gateOutDate.getTime()) / MS_PER_DAY),
        detentionTiers,
      )
    : { breakdown: [], total: 0 };

  // If we want strictly "excess-only" demurrage (no free-time tier in breakdown),
  // filter out zero-rate tiers from the breakdown display:
  const breakdown = [...demurrageResult.breakdown, ...detentionResult.breakdown]
    .filter((b) => b.amount > 0 || b.rate > 0);

  const demurrageAmount = demurrageResult.total;
  const detentionAmount = detentionResult.total;
  const totalAmount = +(demurrageAmount + detentionAmount).toFixed(2);

  const totalExcessDays = demurrageExcessDays + detentionExcessDays;
  let status = deriveDemurrageStatus(releaseDate, freeTimeDays, gateOutDate, asOf);

  // ESCALATED overrides when thresholds are crossed.
  if (totalExcessDays >= ESCALATION_EXCESS_DAYS || totalAmount >= ESCALATION_AMOUNT_USD) {
    status = "ESCALATED";
  }

  // Human-readable explanation
  const explanation = buildExplanation({
    port: input.port,
    carrier: input.carrier,
    containerType: input.containerType,
    releaseDate,
    gateOutDate,
    freeTimeDays,
    daysUsed,
    demurrageExcessDays,
    detentionExcessDays,
    demurrageAmount,
    detentionAmount,
    totalAmount,
    status,
  });

  return {
    daysUsed,
    excessDays: totalExcessDays,
    demurrageAmount: +demurrageAmount.toFixed(2),
    detentionAmount: +detentionAmount.toFixed(2),
    totalAmount,
    status,
    breakdown,
    explanation,
  };
}

function buildExplanation(ctx: {
  port: string; carrier: string; containerType: string;
  releaseDate: Date; gateOutDate?: Date; freeTimeDays: number;
  daysUsed: number; demurrageExcessDays: number; detentionExcessDays: number;
  demurrageAmount: number; detentionAmount: number; totalAmount: number; status: string;
}): string {
  const releaseStr = ctx.releaseDate.toISOString().slice(0, 10);
  const gateOutStr = ctx.gateOutDate ? ctx.gateOutDate.toISOString().slice(0, 10) : null;

  const parts: string[] = [];
  parts.push(
    `Container ${ctx.containerType} at ${ctx.port} (carrier ${ctx.carrier}) released ${releaseStr}, free time ${ctx.freeTimeDays}d.`,
  );
  if (ctx.status === "NOT_STARTED") {
    parts.push(`Release date is in the future — demurrage clock has not started.`);
  } else if (ctx.status === "FREE_TIME") {
    parts.push(`Within free-time window — no charges accrued. ${ctx.freeTimeDays - ctx.daysUsed}d remaining.`);
  } else if (ctx.status === "WARNING_48H") {
    parts.push(`Free time expires within 48h — arrange gate-out to avoid demurrage.`);
  } else if (ctx.status === "WARNING_24H") {
    parts.push(`Free time expires within 24h — URGENT: arrange gate-out immediately.`);
  } else if (ctx.status === "DEMURRAGE_STARTED") {
    parts.push(
      `Demurrage accruing: ${ctx.demurrageExcessDays} excess day(s) × tiered rate = $${ctx.demurrageAmount.toFixed(2)}.`,
    );
  } else if (ctx.status === "DETENTION_STARTED") {
    if (ctx.gateOutDate) parts.push(`Gate-out ${gateOutStr}.`);
    parts.push(
      `Detention accruing: ${ctx.detentionExcessDays} excess day(s) = $${ctx.detentionAmount.toFixed(2)}. ` +
      `Cumulative demurrage $${ctx.demurrageAmount.toFixed(2)}. Total $${ctx.totalAmount.toFixed(2)}.`,
    );
  } else if (ctx.status === "ESCALATED") {
    parts.push(
      `ESCALATED — ${ctx.demurrageExcessDays + ctx.detentionExcessDays} total excess day(s), ` +
      `total charges $${ctx.totalAmount.toFixed(2)}. Consider dispute filing or distressed-cargo declaration.`,
    );
  }
  return parts.join(" ");
}

// ============ §32.1.2 — Seed PortFreeTime table ============

/**
 * Idempotent seed of the PortFreeTime table from the PORT_FREE_TIME constant.
 *
 * For each port in PORT_FREE_TIME, creates one row per CONTAINER_TYPES entry
 * (since the schema @@unique is on [portUnlocode, containerType]). Uses upsert
 * so re-running patches existing rows.
 *
 * Returns a summary { ports, rows, errors }.
 *
 * Called from the /api/sgtx/demurrage/port-free-time GET route if the table
 * is empty (lazy seeding). Can also be called explicitly from a seed/cron route.
 */
export async function seedPortFreeTime(): Promise<{ ports: number; rows: number; errors: number }> {
  let rows = 0;
  let errors = 0;
  const ports = Object.keys(PORT_FREE_TIME).length;

  for (const [portUnlocode, entry] of Object.entries(PORT_FREE_TIME)) {
    for (const containerType of CONTAINER_TYPES) {
      try {
        await (db as any).portFreeTime.upsert({
          where: { portUnlocode_containerType: { portUnlocode, containerType } },
          create: {
            portUnlocode,
            containerType,
            freeTimeDays: entry.freeTimeDays,
            extensionDays: entry.extensionDays,
            extensionPolicy: entry.extensionPolicy,
            carrierSpecific: false,
            source: "SGTX_BLUEPRINT_32_1_2",
          },
          update: {
            freeTimeDays: entry.freeTimeDays,
            extensionDays: entry.extensionDays,
            extensionPolicy: entry.extensionPolicy,
            source: "SGTX_BLUEPRINT_32_1_2",
          },
        });
        rows++;
      } catch (e: any) {
        errors++;
        logger.error("[demurrage/seedPortFreeTime] upsert failed", {
          portUnlocode, containerType,
          error: e?.message || String(e),
        });
      }
    }
  }
  logger.info("[demurrage/seedPortFreeTime] complete", { ports, rows, errors });
  return { ports, rows, errors };
}

// ============ Convenience: persist a calculation to DemurrageTracking ============

/**
 * Persist (or update) a DemurrageTracking row with the latest calculation result.
 * Used by the /api/sgtx/demurrage/calculate and /track routes after the pure
 * calculateDemurrage() function returns.
 *
 * Defensive: wrapped in try/catch — caller gets `null` on failure (the calculation
 * result is still valid even if persistence fails).
 */
export async function persistDemurrageTracking(input: {
  ustn: string;
  containerNumber: string;
  carrierGtid?: string;
  portUnlocode: string;
  containerType: string;
  freeTimeDays: number;
  releaseDate: Date;
  gateOutDate?: Date;
  calc: DemurrageCalculation;
  currency?: string;
  governorDecisionId?: string;
}): Promise<{ id: string; created: boolean } | null> {
  try {
    // Look for an existing tracking row keyed on (ustn + containerNumber)
    const existing = await (db as any).demurrageTracking.findFirst({
      where: { ustn: input.ustn, containerNumber: input.containerNumber },
      select: { id: true },
    });

    const data = {
      ustn: input.ustn,
      containerNumber: input.containerNumber,
      carrierGtid: input.carrierGtid || null,
      portUnlocode: input.portUnlocode,
      containerType: input.containerType,
      freeTimeDays: input.freeTimeDays,
      releaseDate: input.releaseDate,
      gateOutDate: input.gateOutDate || null,
      actualDaysUsed: input.calc.daysUsed,
      excessDays: input.calc.excessDays,
      demurrageAmount: input.calc.demurrageAmount,
      detentionAmount: input.calc.detentionAmount,
      totalAmount: input.calc.totalAmount,
      currency: input.currency || "USD",
      status: input.calc.status,
      demurrageBreakdown: JSON.stringify(input.calc.breakdown || []),
      lastCalculated: new Date(),
      governorDecisionId: input.governorDecisionId || null,
    };

    if (existing) {
      await (db as any).demurrageTracking.update({ where: { id: existing.id }, data });
      return { id: existing.id, created: false };
    }
    const created = await (db as any).demurrageTracking.create({ data });
    return { id: created.id, created: true };
  } catch (e: any) {
    logger.error("[demurrage/persistDemurrageTracking] failed", {
      ustn: input.ustn, containerNumber: input.containerNumber,
      error: e?.message || String(e),
    });
    return null;
  }
}
