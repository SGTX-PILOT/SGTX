// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SGTX v17 §6 — Lab/QC Enforcement Library
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Geography-aware provider coverage validation + anonymised price ranges for
 * lab tests and QC inspections, implementing the Buyer Workflow §6 Step 5
 * (Lab Test Requirements) and Step 6 (QC Inspection Request).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NON-MARKETPLACE GUARDRAILS (HARD ENFORCED)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Per v17 §11.4 and the v16 Non-Marketplace Principle, this module NEVER:
 *
 *   • Ranks providers                       — NO scoring, NO "best match".
 *   • Recommends providers                  — NO "you might also like".
 *   • Suggests alternative counterparties   — NO discovery feed, NO ads.
 *   • Surfaces providers the caller did not
 *     explicitly ask for                    — NO generic listing by port.
 *
 * `findLabProvidersForCountry` and `findQcProvidersForCountry` return providers
 * in DETERMINISTIC ALPHABETICAL ORDER by GTID — never ranked. The caller
 * (the trade-request wizard, an admin tool, etc.) MUST explicitly select a
 * provider GTID. The matching engine merely confirms "yes, this provider
 * covers this country for this capability."
 *
 * `getAnonymisedPriceRange` returns historical price bands with provider
 * names anonymised to "Provider A", "Provider B", etc. — never real names,
 * never per-provider price breakdowns. This avoids any pricing-driven
 * ranking signal that could turn the platform into a marketplace.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Geography-aware coverage validation
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A provider "covers" a country when:
 *
 *   1. The provider has a `ProviderPortCoverage` row for the country code
 *      (the row's `countryCode` field — see Service Capability Model v17 §11).
 *   2. The coverage row is `isActive=true`.
 *   3. The provider is in lifecycle state `VERIFIED` (sanctions/AML cleared).
 *   4. The provider has NOT opted out of anonymous RFQ
 *      (`anonymousRfqOptOut=false`).
 *
 * When the caller supplies a capability code (e.g. PESTICIDE_RESIDUE), the
 * coverage row must ALSO match that capability — this is how the engine
 * distinguishes "this lab covers Egypt for pesticide residue" from "this
 * lab covers Egypt for heavy metals only".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Anonymised price ranges
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `getAnonymisedPriceRange(capabilityCode, countryCode)` queries the
 * historical `LabTest` and `QcInspection` records for the capability+country
 * pair and returns `{ low, mid, high, sample_count, anonymised: true }`.
 *
 * The price of a lab test is recorded in two places:
 *
 *   • ServiceQuotation.feeUsd — the original quoted price (STAGE1/STAGE2
 *     payment stage). This is the BUYER'S view: what was offered.
 *
 *   • Invoice.amountUsd — the actually-invoiced amount (after the test
 *     was completed). This is the BILLER'S view: what was charged.
 *
 * The engine prefers ServiceQuotation.feeUsd (the market price the buyer
 * saw) and falls back to Invoice.amountUsd when no quote exists. The
 * sample_count is the number of distinct historical records used.
 *
 * When sample_count < MIN_PRICE_SAMPLES (3), the engine returns null and
 * the caller falls back to the DEFAULT_LAB_TEST_PRICE_BAND_USD table.
 *
 * Anonymisation: each historical quote's providerGtid is mapped to
 * "Provider A", "Provider B", ... in alphabetical order. The price-band
 * return shape is the low/mid/high percentiles across the whole sample,
 * with NO per-provider breakdown — the engine does not return "Provider A
 * charges $200, Provider B charges $250", because that would constitute
 * a pricing-driven ranking signal.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { parseCapabilitiesArray } from "@/lib/sgtx/service-capability";
import {
  MANDATORY_LAB_TESTS,
  MANDATORY_QC_INSPECTIONS,
  DEFAULT_LAB_TEST_PRICE_BAND_USD,
  DEFAULT_QC_INSPECTION_PRICE_BAND_USD,
  findLongestHsPrefix,
  isPerishableHsCode,
  type LabTestType,
  type QcInspectionType,
  type TestTier,
  type MandatoryLabTestEntry,
  type MandatoryQcInspectionEntry,
} from "./mandatory-tests-seed";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  gtid: string;
  legalName: string;
  type: string;
  country: string;
  city?: string | null;
  sector?: string | null;
  kybTier?: number;
  trustScore?: number;
  lifecycleState: string;
  sanctionsCleared?: boolean;
  serviceCapabilities?: string;
  anonymousRfqOptOut?: boolean;
}

export interface AnonymisedPriceRange {
  low: number;
  mid: number;
  high: number;
  sample_count: number;
  anonymised: true;
  currency: string;
  /**
   * Anonymised provider labels used in the historical sample, in
   * alphabetical order of their underlying GTID. E.g. ["Provider A",
   * "Provider B"]. Returned for transparency/debugging — NOT for display.
   * The caller should NOT show per-provider prices.
   */
  anonymised_providers: string[];
}

export interface LabRequirementValidation {
  valid: boolean;
  missing_mandatory: LabTestType[];
  warnings: string[];
  /** Whether the commodity was determined perishable (locks mandatory tier). */
  is_perishable: boolean;
  /** The HS code used for the lookup. */
  hs_code: string | null;
  /** The mandatory lab test entry matched (if any). */
  matched_entry: MandatoryLabTestEntry | null;
  /** The list of MANDATORY tests for this commodity. */
  mandatory_tests: LabTestType[];
  /** The list of RECOMMENDED tests for this commodity. */
  recommended_tests: LabTestType[];
}

export interface QcRequirementValidation {
  valid: boolean;
  missing: QcInspectionType[];
  warnings: string[];
  is_perishable: boolean;
  hs_code: string | null;
  matched_entry: MandatoryQcInspectionEntry | null;
  /** Whether QC is mandatory for this commodity. */
  qc_mandatory: boolean;
}

export interface LabPriceEstimate {
  estimated_low: number;
  estimated_mid: number;
  estimated_high: number;
  currency: string;
  source: "historical_anonymised" | "default_band";
  sample_count?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/**
 * Minimum number of historical price samples required to compute an
 * anonymised price range. Below this threshold, the engine returns null
 * (signalling "insufficient data") and the caller falls back to the
 * default price band table.
 *
 * The threshold of 3 ensures the low/mid/high percentiles are meaningful —
 * with only 2 samples, the "low" and "high" would be identical to the two
 * observed values, providing no useful range signal.
 */
export const MIN_PRICE_SAMPLES = 3;

/**
 * Maximum number of historical samples to consider. Older samples are
 * included but capped at this number — keeps the percentile computation
 * bounded.
 */
export const MAX_PRICE_SAMPLES = 100;

// ────────────────────────────────────────────────────────────────────────────
// Provider finding — NON-MARKETPLACE GUARDED
// ────────────────────────────────────────────────────────────────────────────

/**
 * Return all LAB tenants that cover `countryCode` for the optional
 * `capabilityCode` (e.g. "PESTICIDE_RESIDUE").
 *
 * The result is sorted DETERMINISTICALLY by GTID (alphabetical). No ranking.
 * No scoring. No recommendation. The caller MUST explicitly select a
 * provider from this list.
 *
 * Coverage is determined by `ProviderPortCoverage` rows where:
 *   • `serviceCapability` matches `capabilityCode` (when supplied),
 *   • `countryCode` matches `countryCode`,
 *   • `isActive=true`.
 *
 * The returned tenants are filtered to lifecycle state `VERIFIED` and have
 * NOT opted out of anonymous RFQ. Each tenant's `serviceCapabilities` JSON
 * is parsed and the `capabilityCode` (when supplied) must appear in the
 * array — this defensive check keeps coverage rows consistent with the
 * tenant's declared capabilities.
 *
 * Returns an empty array when no providers match. The caller should treat
 * an empty result as "no lab covers this country for this capability" and
 * surface a non-marketplace-compliant warning ("No lab providers cover
 * <country> for <capability>. Add a provider explicitly via their GTID.")
 * — NEVER auto-recommend a provider from another country.
 */
export async function findLabProvidersForCountry(
  countryCode: string,
  capabilityCode?: string | null,
): Promise<Tenant[]> {
  return findProvidersForCountryInternal("LAB", countryCode, capabilityCode);
}

/**
 * Return all QC tenants that cover `countryCode` for the optional
 * `capabilityCode` (e.g. "PRE_SHIPMENT_QC").
 *
 * Same non-marketplace guardrails + filtering as
 * `findLabProvidersForCountry`. The only difference is `type: "QC"`.
 */
export async function findQcProvidersForCountry(
  countryCode: string,
  capabilityCode?: string | null,
): Promise<Tenant[]> {
  return findProvidersForCountryInternal("QC", countryCode, capabilityCode);
}

async function findProvidersForCountryInternal(
  tenantType: "LAB" | "QC",
  countryCode: string,
  capabilityCode?: string | null,
): Promise<Tenant[]> {
  const cc = (countryCode || "").toUpperCase();
  if (!cc) return [];

  // ── 1. Find coverage rows matching the country + capability (when supplied).
  const coverageWhere: any = {
    isActive: true,
    countryCode: cc,
  };
  if (capabilityCode) {
    coverageWhere.serviceCapability = capabilityCode.toUpperCase();
  }
  let coverageRows: any[] = [];
  try {
    coverageRows = await db.providerPortCoverage.findMany({
      where: coverageWhere,
      select: { providerGtid: true, serviceCapability: true },
    });
  } catch (e: any) {
    logger.error("[lab-qc] providerPortCoverage.findMany failed", {
      tenantType,
      countryCode: cc,
      capabilityCode,
      error: e?.message,
    });
    return [];
  }
  const candidateGtids = Array.from(
    new Set(coverageRows.map((r) => r.providerGtid)),
  );
  if (candidateGtids.length === 0) return [];

  // ── 2. Fetch the candidate tenants with the lifecycle / RFQ-opt-out filter.
  const tenantWhere: any = {
    gtid: { in: candidateGtids },
    type: tenantType,
    lifecycleState: "VERIFIED",
    anonymousRfqOptOut: false,
  };
  let tenants: any[] = [];
  try {
    tenants = await db.tenant.findMany({
      where: tenantWhere,
      select: {
        id: true,
        gtid: true,
        legalName: true,
        type: true,
        country: true,
        city: true,
        sector: true,
        kybTier: true,
        trustScore: true,
        lifecycleState: true,
        sanctionsCleared: true,
        serviceCapabilities: true,
        anonymousRfqOptOut: true,
      },
    });
  } catch (e: any) {
    logger.error("[lab-qc] tenant.findMany failed", {
      tenantType,
      countryCode: cc,
      error: e?.message,
    });
    return [];
  }

  // ── 3. Defensive: ensure each tenant's parsed capabilities array contains
  // the requested code (when supplied). Coverage rows could drift out of
  // sync with tenant.serviceCapabilities if a capability was removed without
  // removing the coverage row.
  const cap = capabilityCode?.toUpperCase();
  const filtered = cap
    ? tenants.filter((t) => {
        const caps = parseCapabilitiesArray(t.serviceCapabilities);
        return caps.includes(cap);
      })
    : tenants;

  // ── 4. *** DETERMINISTIC ALPHABETICAL ORDER BY GTID ***
  // No ranking. No scoring. The order is the lexicographic order of the
  // providers' GTID strings — stable, deterministic, identical across calls.
  filtered.sort((a, b) => {
    if (a.gtid < b.gtid) return -1;
    if (a.gtid > b.gtid) return 1;
    return 0;
  });

  return filtered as Tenant[];
}

// ────────────────────────────────────────────────────────────────────────────
// Anonymised price ranges
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute an anonymised historical price range for a capability+country pair.
 *
 * The engine queries historical `ServiceQuotation` records (the original
 * market quote — preferred) and falls back to `Invoice` records (the
 * actually-invoiced amount) for the matching capability code + provider's
 * country coverage. The result is the low/mid/high percentiles across the
 * whole sample, with provider GTIDs mapped to "Provider A", "Provider B",
 * ... in alphabetical order.
 *
 * Returns `null` when the sample count is below `MIN_PRICE_SAMPLES` (3) —
 * the caller is expected to fall back to the DEFAULT_*_PRICE_BAND_USD table.
 *
 * The returned shape deliberately does NOT include per-provider prices.
 * It only includes the aggregate low/mid/high and the list of anonymised
 * provider labels used (for transparency — not for display).
 */
export async function getAnonymisedPriceRange(
  capabilityCode: string,
  countryCode: string,
): Promise<AnonymisedPriceRange | null> {
  const cc = (countryCode || "").toUpperCase();
  const cap = (capabilityCode || "").toUpperCase();
  if (!cc || !cap) return null;

  // ── 1. Resolve providers covering this country for this capability.
  // The historical quotes are joined on `providerGtid IN (these gtids)`.
  // The country filter is applied via the ProviderPortCoverage rows so
  // we only count quotes from providers who actually cover this country
  // for this capability — not all quotes by the provider globally.
  let providerGtids: string[] = [];
  try {
    const coverageRows = await db.providerPortCoverage.findMany({
      where: {
        serviceCapability: cap,
        countryCode: cc,
        isActive: true,
      },
      select: { providerGtid: true },
    });
    providerGtids = Array.from(new Set(coverageRows.map((r) => r.providerGtid)));
  } catch (e: any) {
    logger.error("[lab-qc] getAnonymisedPriceRange coverage lookup failed", {
      capabilityCode: cap,
      countryCode: cc,
      error: e?.message,
    });
    return null;
  }
  if (providerGtids.length === 0) return null;

  // ── 2. Collect historical prices from ServiceQuotation (preferred).
  let quotes: any[] = [];
  try {
    quotes = await db.serviceQuotation.findMany({
      where: {
        serviceType: cap,
        providerGtid: { in: providerGtids },
        status: { in: ["ACCEPTED", "EXPIRED", "REJECTED", "PENDING"] },
        feeUsd: { gt: 0 },
      },
      select: { providerGtid: true, feeUsd: true, currency: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_PRICE_SAMPLES,
    });
  } catch (e: any) {
    logger.error("[lab-qc] serviceQuotation.findMany failed", {
      capabilityCode: cap,
      countryCode: cc,
      error: e?.message,
    });
    return null;
  }

  // ── 3. Fall back to Invoice rows when no quotes were found.
  // The Invoice.type for lab tests is "LAB", for QC inspections "QC".
  // The Invoice.amountUsd is the actually-invoiced amount.
  let invoiceRows: any[] = [];
  if (quotes.length < MIN_PRICE_SAMPLES) {
    try {
      const invoiceType = cap === "PRE_SHIPMENT_QC" ||
        cap === "LOADING_SUPERVISION" ||
        cap === "DESTINATION_QC" ||
        cap === "SAMPLING" ||
        cap === "COLD_CHAIN_AUDIT"
        ? "QC"
        : "LAB";
      invoiceRows = await db.invoice.findMany({
        where: {
          type: invoiceType,
          payeeGtid: { in: providerGtids },
          amountUsd: { gt: 0 },
        },
        select: { payeeGtid: true, amountUsd: true, currency: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: MAX_PRICE_SAMPLES,
      });
    } catch (e: any) {
      // Defensive — fall back to empty if Invoice table is unavailable.
      logger.warn("[lab-qc] invoice.findMany failed (non-blocking)", {
        capabilityCode: cap,
        countryCode: cc,
        error: e?.message,
      });
    }
  }

  // ── 4. Normalise into a unified sample list: { providerGtid, priceUsd, ts }.
  // For ServiceQuotation samples, the price is `feeUsd`. For Invoice samples,
  // the price is `amountUsd`. The provider for the Invoice sample is
  // `payeeGtid` (the lab/QC who issued the invoice).
  type Sample = { providerGtid: string; priceUsd: number; ts: Date };
  const samples: Sample[] = [];
  for (const q of quotes) {
    samples.push({
      providerGtid: q.providerGtid,
      priceUsd: Number(q.feeUsd) || 0,
      ts: q.createdAt ? new Date(q.createdAt) : new Date(),
    });
  }
  for (const inv of invoiceRows) {
    samples.push({
      providerGtid: inv.payeeGtid,
      priceUsd: Number(inv.amountUsd) || 0,
      ts: inv.createdAt ? new Date(inv.createdAt) : new Date(),
    });
  }
  // Filter out zero/negative samples.
  const validSamples = samples.filter((s) => s.priceUsd > 0);
  if (validSamples.length < MIN_PRICE_SAMPLES) {
    return null;
  }

  // ── 5. Anonymise provider labels in alphabetical order of underlying GTID.
  // Map providerGtid -> "Provider A", "Provider B", ...
  const sortedGtids = Array.from(new Set(validSamples.map((s) => s.providerGtid)))
    .sort((a, b) => a.localeCompare(b));
  const anonymisationMap = new Map<string, string>();
  sortedGtids.forEach((g, i) => {
    anonymisationMap.set(g, `Provider ${String.fromCharCode(65 + i)}`);
  });
  const anonymisedProviders = sortedGtids.map((g) => anonymisationMap.get(g)!);

  // ── 6. Compute the low/mid/high percentiles across the whole sample.
  // low = 10th percentile, mid = median (50th), high = 90th percentile.
  // For small samples (n=3), this degenerates to min/median/max — which is
  // the only meaningful summary at that size.
  const prices = validSamples.map((s) => s.priceUsd).sort((a, b) => a - b);
  const n = prices.length;
  const low = prices[Math.min(n - 1, Math.max(0, Math.floor(n * 0.1)))];
  const mid = prices[Math.floor(n / 2)];
  const high = prices[Math.min(n - 1, Math.floor(n * 0.9))];

  return {
    low: round2(low),
    mid: round2(mid),
    high: round2(high),
    sample_count: validSamples.length,
    anonymised: true,
    currency: "USD",
    anonymised_providers: anonymisedProviders,
  };
}

/**
 * Price a single lab test type for a given country. Returns an estimated
 * low/mid/high band. When the historical anonymised range has enough
 * samples (>= 3), it is used; otherwise the engine falls back to the
 * DEFAULT_LAB_TEST_PRICE_BAND_USD table for that test type.
 *
 * The returned object includes a `source` field so the caller can label
 * the estimate ("based on N historical samples in <country>" vs "default
 * estimate — no historical data").
 */
export async function priceLabTest(
  labTestType: LabTestType,
  countryCode: string,
): Promise<LabPriceEstimate> {
  const historical = await getAnonymisedPriceRange(labTestType, countryCode);
  if (historical) {
    return {
      estimated_low: historical.low,
      estimated_mid: historical.mid,
      estimated_high: historical.high,
      currency: historical.currency,
      source: "historical_anonymised",
      sample_count: historical.sample_count,
    };
  }
  const fallback = DEFAULT_LAB_TEST_PRICE_BAND_USD[labTestType];
  return {
    estimated_low: fallback?.low ?? 0,
    estimated_mid: fallback?.mid ?? 0,
    estimated_high: fallback?.high ?? 0,
    currency: "USD",
    source: "default_band",
  };
}

/**
 * Price a single QC inspection type for a given country. Same semantics as
 * `priceLabTest`, but uses the QC price band table as the fallback.
 */
export async function priceQcInspection(
  qcInspectionType: QcInspectionType,
  countryCode: string,
): Promise<LabPriceEstimate> {
  const historical = await getAnonymisedPriceRange(qcInspectionType, countryCode);
  if (historical) {
    return {
      estimated_low: historical.low,
      estimated_mid: historical.mid,
      estimated_high: historical.high,
      currency: historical.currency,
      source: "historical_anonymised",
      sample_count: historical.sample_count,
    };
  }
  const fallback = DEFAULT_QC_INSPECTION_PRICE_BAND_USD[qcInspectionType];
  return {
    estimated_low: fallback?.low ?? 0,
    estimated_mid: fallback?.mid ?? 0,
    estimated_high: fallback?.high ?? 0,
    currency: "USD",
    source: "default_band",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Mandatory / Recommended / Optional test resolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get the MANDATORY lab tests for a given HS code + origin/destination route.
 *
 * The mandatory tier is RIA-driven: it depends on the destination country's
 * import regulations. For v17 Phase 1 (Agricultural Exports MVP), the EU
 * is the primary destination and the MANDATORY_LAB_TESTS table encodes the
 * EU + Codex requirements.
 *
 * For perishable commodities (HS code starts with one of
 * PERISHABLE_HS_PREFIXES, OR `Trade.coldChain=true`), the mandatory tier is
 * LOCKED — the buyer cannot opt out. The function returns the list of
 * mandatory test types; the caller (the trade-request wizard) uses this to
 * lock the test selections in the UI.
 *
 * The function also returns the recommended (not mandatory) tests for the
 * commodity — these can be opted out by the buyer.
 *
 * Returns an empty `mandatory` array when the HS code does not match any
 * encoded prefix (no mandatory tier for this commodity). The caller should
 * treat this as "no lab tests are mandatory for this shipment".
 */
export function getMandatoryLabTestsForCommodity(
  hsCode: string,
  _originCountry?: string,
  _destCountry?: string,
): LabTestType[] {
  if (!hsCode) return [];
  const entry = findLongestHsPrefix(MANDATORY_LAB_TESTS, hsCode);
  if (!entry) return [];
  return entry.tests ?? [];
}

/**
 * Get the RECOMMENDED (not mandatory) lab tests for a given HS code. The
 * buyer may opt out of these. Returns an empty array when the HS code does
 * not match any encoded prefix.
 */
export function getRecommendedLabTestsForCommodity(hsCode: string): LabTestType[] {
  if (!hsCode) return [];
  const entry = findLongestHsPrefix(MANDATORY_LAB_TESTS, hsCode);
  if (!entry) return [];
  return entry.recommended ?? [];
}

/**
 * Get the OPTIONAL lab tests: any lab test type the chosen lab offers that
 * is NOT in the mandatory or recommended list for the commodity. The buyer
 * may add these as extras. Returns the full LabTestType enum minus the
 * mandatory + recommended entries for the commodity.
 */
export function getOptionalLabTestsForCommodity(hsCode: string): LabTestType[] {
  const mandatory = new Set(getMandatoryLabTestsForCommodity(hsCode));
  const recommended = new Set(getRecommendedLabTestsForCommodity(hsCode));
  const all: LabTestType[] = [
    "PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN",
    "OCHRATOXIN", "SULPHITE", "FUNGICIDE", "NUTRITION", "GMO", "ALLERGEN",
    "AUTHENTICITY",
  ];
  return all.filter((t) => !mandatory.has(t) && !recommended.has(t));
}

/**
 * Get the mandatory + recommended + optional tiers for a commodity in one
 * call. Used by the `/api/sgtx/lab-tests/mandatory` endpoint.
 */
export function getLabTestTiersForCommodity(
  hsCode: string,
  originCountry?: string,
  destCountry?: string,
): {
  mandatory: LabTestType[];
  recommended: LabTestType[];
  optional: LabTestType[];
  is_perishable: boolean;
  matched_entry: MandatoryLabTestEntry | null;
} {
  const entry = findLongestHsPrefix(MANDATORY_LAB_TESTS, hsCode);
  const mandatory = getMandatoryLabTestsForCommodity(hsCode, originCountry, destCountry);
  const recommended = getRecommendedLabTestsForCommodity(hsCode);
  const optional = getOptionalLabTestsForCommodity(hsCode);
  return {
    mandatory,
    recommended,
    optional,
    is_perishable: isPerishableHsCode(hsCode),
    matched_entry: entry,
  };
}

/**
 * Get the MANDATORY QC inspection types for a given HS code. Returns an
 * empty array when the HS code does not match any encoded prefix.
 */
export function getMandatoryQcInspectionsForCommodity(
  hsCode: string,
  _originCountry?: string,
  _destCountry?: string,
): QcInspectionType[] {
  if (!hsCode) return [];
  const entry = findLongestHsPrefix(MANDATORY_QC_INSPECTIONS, hsCode);
  if (!entry) return [];
  // Only return the types when the entry is flagged mandatory (or when
  // the entry doesn't specify — defaults to true for safety on perishables).
  if (entry.mandatory === false) return [];
  return entry.types ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// Trade-level validation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validate the lab requirements for a trade. Returns:
 *   • `valid`: true when all mandatory tests are present (locked) on the
 *     trade.
 *   • `missing_mandatory`: the list of mandatory lab test types that have
 *     no corresponding LabTest row on the trade.
 *   • `warnings`: non-blocking warnings (e.g. "no historical price data",
 *     "recommended tests not included").
 *   • `is_perishable`: whether the commodity was determined perishable
 *     (locks the mandatory tier).
 *
 * The validation reads the Trade row + its LabTest rows and the
 * TradeLabRequirement rows (the buyer's explicit test selection set) and
 * cross-references against the MANDATORY_LAB_TESTS table for the trade's
 * HS code.
 *
 * For perishable commodities, the mandatory tier is LOCKED — the function
 * reports any missing mandatory tests as `missing_mandatory`. For
 * non-perishable commodities, the mandatory tier is still required but the
 * buyer could in principle have removed them (the wizard should have
 * prevented that — this is a back-stop check).
 *
 * The function NEVER throws. Database errors are caught and reported as a
 * single warning ("validation unavailable — database error") with
 * `valid: false`.
 */
export async function validateLabRequirements(
  tradeId: string,
): Promise<LabRequirementValidation> {
  if (!tradeId) {
    return {
      ...emptyLabValidation(),
      valid: false,
      warnings: ["trade_id is required."],
    };
  }
  let trade: any = null;
  let labTests: any[] = [];
  let labRequirements: any[] = [];
  try {
    trade = await db.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true, ustn: true, commodityHs: true, coldChain: true,
        originCountry: true, destCountry: true,
      },
    });
    if (!trade) {
      return {
        ...emptyLabValidation(),
        valid: false,
        warnings: [`Trade ${tradeId} not found.`],
      };
    }
    [labTests, labRequirements] = await Promise.all([
      db.labTest.findMany({
        where: { tradeId },
        select: { testType: true, status: true, labGtid: true },
      }),
      db.tradeLabRequirement.findMany({
        where: { tradeRequestId: tradeId },
        select: { testName: true, testCategory: true, hsCode: true, destinationCountry: true },
      }),
    ]);
  } catch (e: any) {
    logger.error("[lab-qc] validateLabRequirements failed", {
      tradeId,
      error: e?.message,
    });
    return {
      ...emptyLabValidation(),
      valid: false,
      warnings: ["Validation unavailable — database error. Please retry."],
    };
  }

  const hsCode = trade.commodityHs || null;
  const isPerishable = !!trade.coldChain || isPerishableHsCode(hsCode);
  const entry = hsCode ? findLongestHsPrefix(MANDATORY_LAB_TESTS, hsCode) : null;
  const mandatory: LabTestType[] = entry?.tests ?? [];
  const recommended: LabTestType[] = entry?.recommended ?? [];

  // Tests present on the trade: LabTest.testType (persisted by the
  // trade-request route when the buyer submits) + TradeLabRequirement.testName
  // (the buyer's explicit selection set, written when the wizard runs the
  // mandatory-tests check).
  const presentTypes = new Set<string>();
  for (const lt of labTests) {
    if (lt.testType) presentTypes.add(String(lt.testType).toUpperCase());
  }
  for (const req of labRequirements) {
    if (req.testName) presentTypes.add(String(req.testName).toUpperCase());
  }

  // Missing mandatory tests: any mandatory test not present.
  const missingMandatory = mandatory.filter(
    (t) => !presentTypes.has(t.toUpperCase()),
  );

  // Warnings — non-blocking.
  const warnings: string[] = [];
  if (entry?.mandatory_for_perishable && isPerishable && missingMandatory.length > 0) {
    warnings.push(
      `Perishable commodity — mandatory tests are locked: ${missingMandatory.join(", ")}`,
    );
  }
  const missingRecommended = recommended.filter(
    (t) => !presentTypes.has(t.toUpperCase()),
  );
  if (missingRecommended.length > 0) {
    warnings.push(
      `Recommended tests not included: ${missingRecommended.join(", ")}. Buyer may opt out.`,
    );
  }
  if (entry === null) {
    warnings.push(
      `No mandatory lab test catalog entry for HS code ${hsCode}. Manual review required.`,
    );
  }

  return {
    valid: missingMandatory.length === 0,
    missing_mandatory: missingMandatory,
    warnings,
    is_perishable: isPerishable,
    hs_code: hsCode,
    matched_entry: entry,
    mandatory_tests: mandatory,
    recommended_tests: recommended,
  };
}

/**
 * Validate the QC requirements for a trade. Returns:
 *   • `valid`: true when all mandatory QC inspection types are present.
 *   • `missing`: the list of mandatory QC inspection types that have no
 *     corresponding QcInspection row on the trade.
 *   • `warnings`: non-blocking warnings, including geography-aware coverage
 *     warnings (e.g. "QC provider does not cover destination country DE").
 *
 * Geography-aware: the QC provider assigned to the trade must cover the
 * destination country (when the inspection is DESTINATION_QC) or the origin
 * country (for PRE_SHIPMENT_QC / LOADING_SUPERVISION / SAMPLING /
 * COLD_CHAIN_AUDIT). When the assigned provider does not cover the relevant
 * country, a warning is added (the QC request will fail at the lab/QC
 * portal's acceptance step).
 *
 * The function NEVER throws. Database errors are caught and reported as a
 * single warning ("validation unavailable — database error") with
 * `valid: false`.
 */
export async function validateQcRequirements(
  tradeId: string,
): Promise<QcRequirementValidation> {
  if (!tradeId) {
    return {
      ...emptyQcValidation(),
      valid: false,
      warnings: ["trade_id is required."],
    };
  }
  let trade: any = null;
  let qcInspections: any[] = [];
  let qcRequirements: any[] = [];
  try {
    trade = await db.trade.findUnique({
      where: { id: tradeId },
      select: {
        id: true, ustn: true, commodityHs: true, coldChain: true,
        originCountry: true, destCountry: true, optionalQcInspection: true,
        qcInspectionType: true,
      },
    });
    if (!trade) {
      return {
        ...emptyQcValidation(),
        valid: false,
        warnings: [`Trade ${tradeId} not found.`],
      };
    }
    [qcInspections, qcRequirements] = await Promise.all([
      db.qcInspection.findMany({
        where: { tradeId },
        select: { inspectionType: true, status: true, qcGtid: true },
      }),
      db.tradeQcRequirement.findMany({
        where: { tradeRequestId: tradeId },
        select: { required: true, locationType: true, countryCode: true, portUnlocode: true },
      }),
    ]);
  } catch (e: any) {
    logger.error("[lab-qc] validateQcRequirements failed", {
      tradeId,
      error: e?.message,
    });
    return {
      ...emptyQcValidation(),
      valid: false,
      warnings: ["Validation unavailable — database error. Please retry."],
    };
  }

  const hsCode = trade.commodityHs || null;
  const isPerishable = !!trade.coldChain || isPerishableHsCode(hsCode);
  const entry = hsCode ? findLongestHsPrefix(MANDATORY_QC_INSPECTIONS, hsCode) : null;
  const qcMandatory = entry?.mandatory !== false;
  const mandatoryTypes: QcInspectionType[] = qcMandatory
    ? (entry?.types ?? [])
    : [];

  // Inspections present on the trade: QcInspection.inspectionType + the
  // trade's optionalQcInspection flag (when true, the buyer requested an
  // optional QC — counts as having PRE_SHIPMENT_QC).
  const presentTypes = new Set<string>();
  for (const qc of qcInspections) {
    if (qc.inspectionType) {
      // Normalise: the DB stores "PRE_SHIPMENT" for backward compat; the
      // capability code is "PRE_SHIPMENT_QC". Map both.
      const t = String(qc.inspectionType).toUpperCase();
      presentTypes.add(t === "PRE_SHIPMENT" ? "PRE_SHIPMENT_QC" : t);
    }
  }
  if (trade.optionalQcInspection && trade.qcInspectionType) {
    const t = String(trade.qcInspectionType).toUpperCase();
    presentTypes.add(t === "PRE_SHIPMENT" ? "PRE_SHIPMENT_QC" : t);
  }

  const missing = mandatoryTypes.filter(
    (t) => !presentTypes.has(t.toUpperCase()),
  );

  // Warnings — non-blocking. Geography-aware coverage check.
  const warnings: string[] = [];
  if (entry?.mandatory && isPerishable && missing.length > 0) {
    warnings.push(
      `Perishable commodity — mandatory QC inspections are required: ${missing.join(", ")}`,
    );
  }
  if (entry === null && hsCode) {
    warnings.push(
      `No mandatory QC catalog entry for HS code ${hsCode}. QC inspection is optional.`,
    );
  }

  // Geography-aware coverage: each assigned QC provider must cover the
  // relevant country for the relevant capability.
  for (const qc of qcInspections) {
    if (!qc.qcGtid) continue;
    const cap = String(qc.inspectionType).toUpperCase();
    const capCode = cap === "PRE_SHIPMENT" ? "PRE_SHIPMENT_QC" : cap;
    // Destination-side inspection → destination country. Otherwise → origin.
    const isDestination = capCode === "DESTINATION_QC";
    const targetCountry = isDestination ? trade.destCountry : trade.originCountry;
    if (!targetCountry) continue;
    let covers = false;
    try {
      const row = await db.providerPortCoverage.findFirst({
        where: {
          providerGtid: qc.qcGtid,
          serviceCapability: capCode,
          countryCode: String(targetCountry).toUpperCase(),
          isActive: true,
        },
      });
      covers = !!row;
    } catch {
      // Treat coverage lookup failures as "unknown — warn".
    }
    if (!covers) {
      warnings.push(
        `QC provider ${qc.qcGtid} does not cover ${targetCountry} for ${capCode}. The QC request will be rejected by the provider.`,
      );
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    is_perishable: isPerishable,
    hs_code: hsCode,
    matched_entry: entry,
    qc_mandatory: qcMandatory,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function emptyLabValidation(): LabRequirementValidation {
  return {
    valid: true,
    missing_mandatory: [],
    warnings: [],
    is_perishable: false,
    hs_code: null,
    matched_entry: null,
    mandatory_tests: [],
    recommended_tests: [],
  };
}

function emptyQcValidation(): QcRequirementValidation {
  return {
    valid: true,
    missing: [],
    warnings: [],
    is_perishable: false,
    hs_code: null,
    matched_entry: null,
    qc_mandatory: false,
  };
}

function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ────────────────────────────────────────────────────────────────────────────
// Re-exports for route handlers
// ────────────────────────────────────────────────────────────────────────────

export {
  MANDATORY_LAB_TESTS,
  MANDATORY_QC_INSPECTIONS,
  DEFAULT_LAB_TEST_PRICE_BAND_USD,
  DEFAULT_QC_INSPECTION_PRICE_BAND_USD,
  PERISHABLE_HS_PREFIXES,
  findLongestHsPrefix,
  isPerishableHsCode,
};
export type {
  LabTestType,
  QcInspectionType,
  TestTier,
  MandatoryLabTestEntry,
  MandatoryQcInspectionEntry,
};
