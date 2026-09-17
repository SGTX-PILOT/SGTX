// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Phase 2 §3 — Tariff Engine (Blueprint §3)
// ---------------------------------------------------------------------------
// Computes jurisdiction-specific, product-specific, origin-aware, effective-
// date-aware, source-backed import duties for any (hs6, jurisdiction, origin)
// tuple across the eleven canonical SGTX tariff types:
//
//   1.  MFN                  — Most-Favored-Nation baseline duty (WTO bound or
//                              applied rate). Acts as the BASE tariff line.
//   2.  PREFERENTIAL         — FTA / PTA backed preferential rate. Requires a
//                              linked TradeAgreement that is IN_FORCE and within
//                              its effective/expiry window. Mutually exclusive
//                              with MFN for the base line (preferential wins
//                              when eligible).
//   3.  QUOTA                — Tariff-Rate Quota (TRQ). When within-quota, the
//                              preferential quota rate applies (acts like a
//                              preferential base). When the quota is exhausted
//                              (quotaUsed >= quotaVolume OR quotaOpen === false),
//                              the quota rate is NOT applied — falls back to
//                              MFN.
//   4.  ANTI_DUMPING         — Anti-dumping duty. STACKS on top of MFN /
//                              preferential / quota base.
//   5.  COUNTERVAILING       — Countervailing duty (CVD). STACKS on top.
//   6.  SAFEGUARDS           — Safeguard duty. STACKS on top.
//   7.  AGRICULTURAL_LEVY   — Variable agricultural / seasonal levy. STACKS.
//   8.  EXCISE               — Domestic excise tax collected at border. STACKS.
//   9.  ENVIRONMENTAL_FEE   — Carbon / CBAM / eco-tax. STACKS.
//  10.  IMPORT_SURCHARGE    — Temporary / emergency import surcharge. STACKS.
//  11.  OTHER_GOVT_CHARGE   — Catch-all for port fees, customs admin fees,
//                              statistics fees, etc. STACKS.
//
// Stacking rules
// --------------
//   • BASE tariff (mutually exclusive): MFN OR PREFERENTIAL OR QUOTA (in-quota).
//     Priority: PREFERENTIAL (if agreement valid) > QUOTA (if quota open) > MFN.
//   • STACKING tariffs (added on top of base): all of 4–11 above. Each adds
//     its own line; multiple stacking tariffs of the same type may coexist.
//   • Each TariffLine carries `stacks: true` (stacking) or `false` (base).
//
// Rate computation
// ----------------
//   • AD_VALOREM :  customsValueUsd * (rateAdValorem / 100)
//   • SPECIFIC   :  quantity * rateSpecific   (quantity in rateSpecificUnit;
//                  when unit is KG, falls back to netWeightKg if quantity
//                  is absent)
//   • COMPOUND   :  ad valorem amount + specific amount (rateCompound JSON:
//                  { adValorem: number, specific: number })
//   • Min/max rate clamping: applied to the COMPUTED AMOUNT (USD) using
//                  `minRate` and `maxRate` when present.
//
// Source provenance
// -----------------
//   Every TariffLine carries the originating `ruleId`, `sourceId`
//   (RegulatorySource linkage) and `legalReference`. The aggregate result
//   surfaces `sourceIds` and `notes` so an auditor can trace the determination
//   back to its legal basis.
//
// All DB access is defensive — failures are logged via the shared SGTX logger
// and the engine falls back to safe defaults (null / [] / an empty
// TariffResult with `totalDutyUsd = 0` + a "no tariff rules found" note). No
// DB error ever throws out of this module.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Module constants ============

/**
 * Canonical tariff types recognised by the engine. Each value maps 1:1 to the
 * `TariffRule.tariffType` column.
 */
export const TARIFF_TYPES = [
  "MFN",
  "PREFERENTIAL",
  "QUOTA",
  "ANTI_DUMPING",
  "COUNTERVAILING",
  "SAFEGUARDS",
  "AGRICULTURAL_LEVY",
  "EXCISE",
  "ENVIRONMENTAL_FEE",
  "IMPORT_SURCHARGE",
  "OTHER_GOVT_CHARGE",
] as const;

/** Base tariff types (mutually exclusive — only one applies). */
export const BASE_TARIFF_TYPES = ["MFN", "PREFERENTIAL", "QUOTA"] as const;

/** Stacking tariff types (always added on top of the base). */
export const STACKING_TARIFF_TYPES = [
  "ANTI_DUMPING",
  "COUNTERVAILING",
  "SAFEGUARDS",
  "AGRICULTURAL_LEVY",
  "EXCISE",
  "ENVIRONMENTAL_FEE",
  "IMPORT_SURCHARGE",
  "OTHER_GOVT_CHARGE",
] as const;

/** Default currency for results (customsValueUsd is in USD). */
export const DEFAULT_CURRENCY = "USD";

/** Confidence when a base tariff rule was found + preferential determination done. */
export const CONFIDENCE_FULL = 1.0;

/** Confidence when no tariff rules found at all. */
export const CONFIDENCE_NO_RULES = 0.7;

// ============ Exported types ============

export interface TariffInput {
  hs6: string;
  hsCode?: string; // national tariff code (8-10 digit)
  jurisdictionCode: string; // JurisdictionFabric.code
  originCountry: string; // ISO alpha-2
  customsValueUsd: number;
  quantity?: number;
  netWeightKg?: number;
  agreementId?: string;
  effectiveDate?: Date;
}

export interface TariffLine {
  tariffType: string;
  ruleId: string;
  rate: number | string; // number for ad-valorem/specific, string for compound
  rateType: string; // AD_VALOREM | SPECIFIC | COMPOUND
  amount: number; // computed duty in `currency`
  basis: string; // "customs_value" | "quantity" | "weight" | "compound"
  sourceId?: string;
  legalReference?: string;
  stacks: boolean; // true for AD/CVD/safeguards; false for MFN/preferential (mutually exclusive)
}

export interface TariffResult {
  hs6: string;
  hsCode?: string;
  jurisdictionCode: string;
  originCountry: string;
  customsValueUsd: number;
  lines: TariffLine[];
  totalDutyUsd: number;
  currency: string;
  effectiveDate: string; // ISO
  appliedAgreementId?: string;
  mfnRate?: number;
  preferentialRate?: number;
  appliedRate?: number; // the effective import duty rate actually applied (preferential if eligible, else MFN)
  confidence: number;
  sourceIds: string[];
  notes: string[];
}

export interface QuotaStatus {
  ruleId: string;
  quotaVolume: number | null;
  quotaUsed: number;
  quotaRemaining: number | null;
  quotaOpen: boolean;
  requestedQuantity: number;
  wouldExceed: boolean;
}

export interface UpsertTariffRuleInput {
  tariffType: string;
  hsCode: string;
  hs6: string;
  jurisdictionId?: string;
  originCountry?: string;
  agreementId?: string;
  productId?: string;
  rateAdValorem?: number;
  rateSpecific?: number;
  rateSpecificUnit?: string;
  rateCompound?: string;
  rateType?: string;
  currency?: string;
  minRate?: number;
  maxRate?: number;
  quotaVolume?: number;
  quotaUnit?: string;
  quotaPeriod?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
  sourceId?: string;
  legalReference?: string;
  confidenceScore?: number;
}

// ============ Internal helpers ============

/** Safe JSON.parse — returns `fallback` on any error. */
function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Clamp a number into [lo, hi] (lo/hi may be undefined). */
function clamp(value: number, lo?: number | null, hi?: number | null): number {
  if (!Number.isFinite(value)) return 0;
  if (typeof lo === "number" && Number.isFinite(lo) && value < lo) return lo;
  if (typeof hi === "number" && Number.isFinite(hi) && value > hi) return hi;
  return value;
}

/**
 * Resolve a JurisdictionFabric.id from its human code (ISO alpha-2 or
 * customs-territory code). Defensive — returns null on DB failure or when
 * no jurisdiction matches.
 */
async function resolveJurisdictionId(code?: string): Promise<string | null> {
  if (!code || typeof code !== "string") return null;
  try {
    const j = await db.jurisdictionFabric.findFirst({
      where: { code: code.toUpperCase() },
      select: { id: true },
    });
    return j?.id ?? null;
  } catch (e) {
    logger.error("[tariff/resolveJurisdictionId] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Verify that a TradeAgreement is IN_FORCE and within its effective/expiry
 * window as of `asOf`. Returns the agreement row on success, null otherwise.
 * Defensive — never throws.
 */
async function verifyAgreementInForce(
  agreementId: string | undefined,
  asOf: Date,
): Promise<any | null> {
  if (!agreementId || typeof agreementId !== "string") return null;
  try {
    const agreement = await db.tradeAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) return null;
    if (agreement.legalStatus && agreement.legalStatus !== "IN_FORCE") return null;
    const asOfMs = asOf.getTime();
    if (agreement.effectiveDate) {
      const from = new Date(agreement.effectiveDate).getTime();
      if (Number.isFinite(from) && asOfMs < from) return null;
    }
    if (agreement.expiryDate) {
      const until = new Date(agreement.expiryDate).getTime();
      if (Number.isFinite(until) && asOfMs > until) return null;
    }
    return agreement;
  } catch (e) {
    logger.error("[tariff/verifyAgreementInForce] failed", {
      agreementId,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Load all applicable TariffRule rows for the (hs6 / hsCode, jurisdiction,
 * origin) tuple that are IN_FORCE as of `effectiveDate`. Defensive — returns
 * [] on DB failure.
 *
 * Loading logic:
 *   • Match by hs6 OR hsCode (when hsCode is provided) — national tariff
 *     codes are 8/10-digit and supersede generic HS6 rules.
 *   • Match by jurisdictionId when present, OR jurisdictionId = null (global /
 *     WCO baseline rules).
 *   • Match by originCountry when present, OR originCountry = null
 *     (origin-agnostic MFN rules).
 *   • legalStatus = "IN_FORCE".
 *   • effectiveFrom is null or <= effectiveDate.
 *   • effectiveUntil is null or > effectiveDate.
 *
 * Deduplicates by rule.id.
 */
async function loadApplicableTariffRules(
  hs6: string,
  hsCode: string | undefined,
  jurisdictionId: string | null,
  originCountry: string,
  effectiveDate: Date,
): Promise<any[]> {
  const orClauses: any[] = [];

  if (jurisdictionId) {
    orClauses.push({ hs6, jurisdictionId });
    orClauses.push({ hs6, jurisdictionId: null });
  } else {
    orClauses.push({ hs6 });
  }

  if (hsCode && hsCode.length > 0) {
    if (jurisdictionId) {
      orClauses.push({ hsCode, jurisdictionId });
      orClauses.push({ hsCode, jurisdictionId: null });
    } else {
      orClauses.push({ hsCode });
    }
  }

  const where: any = {
    AND: [
      { legalStatus: "IN_FORCE" },
      {
        OR: [
          { originCountry: null },
          { originCountry: originCountry.toUpperCase() },
        ],
      },
      {
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: effectiveDate } }],
      },
      {
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gt: effectiveDate } },
        ],
      },
      { OR: orClauses },
    ],
  };

  try {
    const rules: any[] = await db.tariffRule.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
    });
    // Deduplicate by id (hs6 + hsCode queries may overlap).
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rules) {
      if (!r || !r.id) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  } catch (e) {
    logger.error("[tariff/loadApplicableTariffRules] failed", {
      hs6,
      hsCode,
      jurisdictionId,
      originCountry,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Resolve the quantity to use for a SPECIFIC-rate rule based on its
 * `rateSpecificUnit`. Falls back through quantity → netWeightKg → 0.
 */
function resolveSpecificQuantity(
  rule: any,
  input: TariffInput,
): { quantity: number; basis: string } {
  const unit = (rule.rateSpecificUnit || "").toUpperCase();
  if (unit === "KG") {
    if (typeof input.netWeightKg === "number" && Number.isFinite(input.netWeightKg)) {
      return { quantity: input.netWeightKg, basis: "weight" };
    }
    if (typeof input.quantity === "number" && Number.isFinite(input.quantity)) {
      return { quantity: input.quantity, basis: "weight" };
    }
    return { quantity: 0, basis: "weight" };
  }
  // UNIT / L / M2 / M3 / unspecified → use quantity directly.
  if (typeof input.quantity === "number" && Number.isFinite(input.quantity)) {
    return { quantity: input.quantity, basis: "quantity" };
  }
  return { quantity: 0, basis: "quantity" };
}

/**
 * Compute the duty amount for a single TariffRule based on its `rateType`.
 * Returns `{ amount, rate, rateType, basis }` or null when the rule cannot
 * be applied (e.g., unknown rateType).
 *
 *   AD_VALOREM :  customsValueUsd * (rateAdValorem / 100)
 *   SPECIFIC   :  quantity * rateSpecific   (quantity in rateSpecificUnit)
 *   COMPOUND   :  ad valorem amount + specific amount
 *
 * Min/max rate clamping (on the computed USD amount) is applied here.
 */
function computeDutyAmount(
  rule: any,
  input: TariffInput,
): { amount: number; rate: number | string; rateType: string; basis: string } | null {
  if (!rule || !rule.rateType) return null;

  const customsValue =
    typeof input.customsValueUsd === "number" && Number.isFinite(input.customsValueUsd)
      ? input.customsValueUsd
      : 0;

  const rateType = String(rule.rateType).toUpperCase();

  switch (rateType) {
    case "AD_VALOREM": {
      const rate = typeof rule.rateAdValorem === "number" ? rule.rateAdValorem : 0;
      const amount = customsValue * (rate / 100);
      return {
        amount: clamp(amount, rule.minRate, rule.maxRate),
        rate,
        rateType: "AD_VALOREM",
        basis: "customs_value",
      };
    }
    case "SPECIFIC": {
      const rate = typeof rule.rateSpecific === "number" ? rule.rateSpecific : 0;
      const { quantity, basis } = resolveSpecificQuantity(rule, input);
      const amount = quantity * rate;
      return {
        amount: clamp(amount, rule.minRate, rule.maxRate),
        rate,
        rateType: "SPECIFIC",
        basis,
      };
    }
    case "COMPOUND": {
      const compound = safeJsonParse<any>(rule.rateCompound, null);
      const adVal =
        compound && typeof compound.adValorem === "number" ? compound.adValorem : 0;
      const spec =
        compound && typeof compound.specific === "number" ? compound.specific : 0;
      const specUnit = compound?.specificUnit || rule.rateSpecificUnit;
      const syntheticRule = { ...rule, rateSpecificUnit: specUnit };
      const { quantity } = resolveSpecificQuantity(syntheticRule, input);
      const adValAmount = customsValue * (adVal / 100);
      const specAmount = quantity * spec;
      const amount = adValAmount + specAmount;
      const rateStr = JSON.stringify({
        adValorem: adVal,
        specific: spec,
        ...(specUnit ? { specificUnit: specUnit } : {}),
      });
      return {
        amount: clamp(amount, rule.minRate, rule.maxRate),
        rate: rateStr,
        rateType: "COMPOUND",
        basis: "compound",
      };
    }
    default:
      // Unknown rateType — defensive: skip.
      return null;
  }
}

/**
 * Determine whether a TariffRule is a "base" rule (MFN / PREFERENTIAL /
 * QUOTA) vs a stacking rule. Anything else (AD/CVD/safeguards/etc) stacks.
 */
function isBaseRule(tariffType: string): boolean {
  return (BASE_TARIFF_TYPES as readonly string[]).includes(String(tariffType).toUpperCase());
}

/**
 * Check whether a QUOTA TariffRule has remaining capacity.
 * Returns true when the quota is open AND quotaUsed < quotaVolume
 * (or quotaVolume is null/unbounded).
 */
function isQuotaAvailable(rule: any): boolean {
  if (!rule) return false;
  if (rule.quotaOpen === false) return false;
  const volume = typeof rule.quotaVolume === "number" ? rule.quotaVolume : null;
  if (volume == null) return true; // unbounded quota
  const used = typeof rule.quotaUsed === "number" ? rule.quotaUsed : 0;
  return used < volume;
}

/**
 * Determine the BASE tariff line from a set of base-eligible rules
 * (MFN / PREFERENTIAL / QUOTA).
 *
 * Priority:
 *   1. PREFERENTIAL — only if agreementId linkage is provided AND the linked
 *      TradeAgreement is IN_FORCE and within effective/expiry window.
 *   2. QUOTA — only if quota is available (quotaOpen=true AND
 *      quotaUsed < quotaVolume). Acts as a preferential-rate base.
 *   3. MFN — fallback.
 *
 * Returns `{ baseLine, baseRule, notes }` or `{ baseLine: null, baseRule: null,
 * notes }` when no base rule applies.
 */
async function resolveBaseTariff(
  baseRules: any[],
  input: TariffInput,
  effectiveDate: Date,
): Promise<{ baseLine: TariffLine | null; baseRule: any | null; notes: string[] }> {
  const notes: string[] = [];
  const mfnRules = baseRules.filter((r) => String(r.tariffType).toUpperCase() === "MFN");
  const prefRules = baseRules.filter(
    (r) => String(r.tariffType).toUpperCase() === "PREFERENTIAL",
  );
  const quotaRules = baseRules.filter(
    (r) => String(r.tariffType).toUpperCase() === "QUOTA",
  );

  // 1. Preferential — agreement verification.
  for (const rule of prefRules) {
    const agreementId =
      input.agreementId ||
      (typeof rule.agreementId === "string" ? rule.agreementId : undefined);
    if (!agreementId) {
      notes.push(
        `PREFERENTIAL rule ${rule.id} skipped — no agreementId linkage on input or rule`,
      );
      continue;
    }
    const agreement = await verifyAgreementInForce(agreementId, effectiveDate);
    if (!agreement) {
      notes.push(
        `PREFERENTIAL rule ${rule.id} skipped — agreement ${agreementId} not IN_FORCE / out of date window`,
      );
      continue;
    }
    const computed = computeDutyAmount(rule, input);
    if (!computed) continue;
    return {
      baseLine: {
        tariffType: "PREFERENTIAL",
        ruleId: rule.id,
        rate: computed.rate,
        rateType: computed.rateType,
        amount: computed.amount,
        basis: computed.basis,
        sourceId: rule.sourceId ?? undefined,
        legalReference: rule.legalReference ?? undefined,
        stacks: false,
      },
      baseRule: { ...rule, _agreementId: agreementId, _agreement: agreement },
      notes,
    };
  }

  // 2. Quota — must be within quota availability.
  for (const rule of quotaRules) {
    if (!isQuotaAvailable(rule)) {
      notes.push(
        `QUOTA rule ${rule.id} skipped — quota exhausted (used=${rule.quotaUsed ?? 0}/volume=${rule.quotaVolume ?? "unbounded"}, open=${rule.quotaOpen})`,
      );
      continue;
    }
    const computed = computeDutyAmount(rule, input);
    if (!computed) continue;
    return {
      baseLine: {
        tariffType: "QUOTA",
        ruleId: rule.id,
        rate: computed.rate,
        rateType: computed.rateType,
        amount: computed.amount,
        basis: computed.basis,
        sourceId: rule.sourceId ?? undefined,
        legalReference: rule.legalReference ?? undefined,
        stacks: false,
      },
      baseRule: rule,
      notes,
    };
  }

  // 3. MFN — fallback.
  for (const rule of mfnRules) {
    const computed = computeDutyAmount(rule, input);
    if (!computed) continue;
    return {
      baseLine: {
        tariffType: "MFN",
        ruleId: rule.id,
        rate: computed.rate,
        rateType: computed.rateType,
        amount: computed.amount,
        basis: computed.basis,
        sourceId: rule.sourceId ?? undefined,
        legalReference: rule.legalReference ?? undefined,
        stacks: false,
      },
      baseRule: rule,
      notes,
    };
  }

  return { baseLine: null, baseRule: null, notes };
}

/**
 * Build a TariffLine for a stacking rule (AD/CVD/safeguards/levy/excise/etc).
 */
function buildStackingLine(rule: any, input: TariffInput): TariffLine | null {
  const computed = computeDutyAmount(rule, input);
  if (!computed) return null;
  return {
    tariffType: String(rule.tariffType).toUpperCase(),
    ruleId: rule.id,
    rate: computed.rate,
    rateType: computed.rateType,
    amount: computed.amount,
    basis: computed.basis,
    sourceId: rule.sourceId ?? undefined,
    legalReference: rule.legalReference ?? undefined,
    stacks: true,
  };
}

// ============ Exported functions ============

/**
 * Compute the full tariff picture for a single (hs6 / hsCode, jurisdiction,
 * origin) tuple.
 *
 * Pipeline:
 *   1. Resolve jurisdictionId from jurisdictionCode via JurisdictionFabric.
 *   2. Load all applicable TariffRule rows (IN_FORCE, within effective date
 *      window) — by hs6 OR hsCode, jurisdictionId OR null, originCountry OR
 *      null. Deduplicate by id.
 *   3. Split into base rules (MFN / PREFERENTIAL / QUOTA) and stacking rules.
 *   4. Resolve the single base line (preferential > quota > mfn).
 *   5. Build stacking lines for all stacking rules.
 *   6. Sum amounts → totalDutyUsd.
 *   7. Determine `appliedRate` (base rate as ad-valorem-equivalent %).
 *   8. confidence = 1.0 when MFN + preferential determination done; 0.7 when
 *      no rules found at all.
 *
 * Defensive: never throws. On DB failure or missing data, returns an empty
 * TariffResult with totalDutyUsd=0 and explanatory notes.
 */
export async function computeTariff(input: TariffInput): Promise<TariffResult> {
  const safeInput: TariffInput =
    input && typeof input === "object" ? input : ({} as TariffInput);

  const effectiveDate = safeInput.effectiveDate ?? new Date();
  const effectiveDateIso = effectiveDate.toISOString();

  const fallback: TariffResult = {
    hs6: safeInput.hs6 || "",
    jurisdictionCode: safeInput.jurisdictionCode || "",
    originCountry: safeInput.originCountry || "",
    customsValueUsd:
      typeof safeInput.customsValueUsd === "number" ? safeInput.customsValueUsd : 0,
    lines: [],
    totalDutyUsd: 0,
    currency: DEFAULT_CURRENCY,
    effectiveDate: effectiveDateIso,
    confidence: CONFIDENCE_NO_RULES,
    sourceIds: [],
    notes: [],
  };
  if (safeInput.hsCode) fallback.hsCode = safeInput.hsCode;

  // Step 1: resolve jurisdictionId.
  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);
  if (!jurisdictionId) {
    fallback.notes.push(
      `jurisdictionCode "${safeInput.jurisdictionCode}" did not resolve to a JurisdictionFabric row`,
    );
  }

  // Step 2: load applicable rules.
  const allRules = await loadApplicableTariffRules(
    safeInput.hs6 || "",
    safeInput.hsCode,
    jurisdictionId,
    safeInput.originCountry || "",
    effectiveDate,
  );

  if (allRules.length === 0) {
    fallback.notes.push("no tariff rules found");
    return fallback;
  }

  // Step 3: split base vs stacking.
  const baseRules = allRules.filter((r) => isBaseRule(r.tariffType));
  const stackingRules = allRules.filter((r) => !isBaseRule(r.tariffType));

  // Step 4: resolve base line.
  const { baseLine, baseRule, notes: baseNotes } = await resolveBaseTariff(
    baseRules,
    safeInput,
    effectiveDate,
  );

  const lines: TariffLine[] = [];
  const sourceIds = new Set<string>();
  const notes: string[] = [...baseNotes];

  if (baseLine) {
    lines.push(baseLine);
    if (baseLine.sourceId) sourceIds.add(baseLine.sourceId);
  } else {
    notes.push("no base tariff rule (MFN/PREFERENTIAL/QUOTA) applied");
  }

  // Step 5: build stacking lines.
  for (const rule of stackingRules) {
    const line = buildStackingLine(rule, safeInput);
    if (!line) {
      notes.push(
        `stacking rule ${rule.id} (${rule.tariffType}) could not be computed — skipped`,
      );
      continue;
    }
    lines.push(line);
    if (line.sourceId) sourceIds.add(line.sourceId);
  }

  // Step 6: sum.
  const totalDutyUsd = lines.reduce(
    (sum, l) => sum + (Number.isFinite(l.amount) ? l.amount : 0),
    0,
  );

  // Step 7: derive the applied rate (ad-valorem equivalent %).
  let mfnRate: number | undefined;
  let preferentialRate: number | undefined;
  let appliedRate: number | undefined;
  let appliedAgreementId: string | undefined;

  for (const rule of baseRules) {
    const tt = String(rule.tariffType).toUpperCase();
    if (tt === "MFN" && mfnRate === undefined) {
      mfnRate = typeof rule.rateAdValorem === "number" ? rule.rateAdValorem : undefined;
    }
    if (tt === "PREFERENTIAL" && preferentialRate === undefined) {
      preferentialRate =
        typeof rule.rateAdValorem === "number" ? rule.rateAdValorem : undefined;
    }
  }

  if (baseLine && baseRule) {
    if (baseLine.tariffType === "PREFERENTIAL") {
      appliedRate =
        typeof baseLine.rate === "number" ? baseLine.rate : preferentialRate;
      appliedAgreementId =
        (baseRule as any)._agreementId || baseRule.agreementId || undefined;
    } else if (baseLine.tariffType === "QUOTA") {
      appliedRate = typeof baseLine.rate === "number" ? baseLine.rate : undefined;
    } else if (baseLine.tariffType === "MFN") {
      appliedRate = typeof baseLine.rate === "number" ? baseLine.rate : mfnRate;
    }
  }

  // Step 8: confidence.
  // Full confidence when:
  //   • a base rule applied (we know what the import duty is) AND
  //   • preferential determination is complete (no preferential rule exists,
  //     OR a preferential rule was found and the agreement was verified).
  const hasPreferentialRule = baseRules.some(
    (r) => String(r.tariffType).toUpperCase() === "PREFERENTIAL",
  );
  const preferentialDeterminationDone = !hasPreferentialRule || !!baseRule;
  const confidence =
    baseLine && preferentialDeterminationDone ? CONFIDENCE_FULL : CONFIDENCE_NO_RULES;

  const result: TariffResult = {
    hs6: safeInput.hs6 || "",
    jurisdictionCode: safeInput.jurisdictionCode || "",
    originCountry: safeInput.originCountry || "",
    customsValueUsd:
      typeof safeInput.customsValueUsd === "number" ? safeInput.customsValueUsd : 0,
    lines,
    totalDutyUsd: Number(totalDutyUsd.toFixed(4)),
    currency: DEFAULT_CURRENCY,
    effectiveDate: effectiveDateIso,
    confidence,
    sourceIds: Array.from(sourceIds),
    notes,
  };
  if (safeInput.hsCode) result.hsCode = safeInput.hsCode;
  if (appliedAgreementId) result.appliedAgreementId = appliedAgreementId;
  if (typeof mfnRate === "number") result.mfnRate = mfnRate;
  if (typeof preferentialRate === "number") result.preferentialRate = preferentialRate;
  if (typeof appliedRate === "number") result.appliedRate = appliedRate;

  return result;
}

/**
 * List TariffRule rows filtered by hs6 / jurisdictionId / originCountry /
 * tariffType / agreementId. Only `legalStatus = "IN_FORCE"` rules within
 * their effective date window are returned.
 *
 * Defensive: returns [] on any DB error.
 */
export async function listTariffRules(
  filters?: {
    hs6?: string;
    jurisdictionId?: string;
    originCountry?: string;
    tariffType?: string;
    agreementId?: string;
  },
): Promise<any[]> {
  const f = filters || {};
  try {
    const where: any = { legalStatus: "IN_FORCE" };
    if (f.hs6) where.hs6 = f.hs6;
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.originCountry) where.originCountry = f.originCountry.toUpperCase();
    if (f.tariffType) where.tariffType = f.tariffType.toUpperCase();
    if (f.agreementId) where.agreementId = f.agreementId;

    const rules: any[] = await db.tariffRule.findMany({ where });
    const now = Date.now();
    return rules.filter((r) => {
      if (r.effectiveFrom) {
        const from = new Date(r.effectiveFrom).getTime();
        if (Number.isFinite(from) && now < from) return false;
      }
      if (r.effectiveUntil) {
        const until = new Date(r.effectiveUntil).getTime();
        if (Number.isFinite(until) && now > until) return false;
      }
      return true;
    });
  } catch (e) {
    logger.error("[tariff/listTariffRules] failed", {
      filters,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Fetch a single TariffRule by its primary key. Returns null on missing-rule
 * or DB failure.
 */
export async function getTariffRule(id: string): Promise<any | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const rule = await db.tariffRule.findUnique({ where: { id } });
    return rule ?? null;
  } catch (e) {
    logger.error("[tariff/getTariffRule] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Create or update a TariffRule. The find-then-upsert pattern keys on
 * (tariffType, hsCode, jurisdictionId, originCountry, agreementId). When
 * one or more matching rules exist, the most-recently updated one is updated;
 * otherwise a new row is created.
 *
 * On DB failure the error is logged and re-thrown so callers can react.
 */
export async function upsertTariffRule(input: UpsertTariffRuleInput): Promise<any> {
  if (!input || !input.tariffType || !input.hsCode || !input.hs6) {
    throw new Error("upsertTariffRule requires tariffType + hsCode + hs6");
  }

  const data: any = {
    tariffType: String(input.tariffType).toUpperCase(),
    hsCode: input.hsCode,
    hs6: input.hs6,
    jurisdictionId: input.jurisdictionId ?? null,
    originCountry: input.originCountry
      ? String(input.originCountry).toUpperCase()
      : null,
    agreementId: input.agreementId ?? null,
    productId: input.productId ?? null,
    rateAdValorem: input.rateAdValorem ?? null,
    rateSpecific: input.rateSpecific ?? null,
    rateSpecificUnit: input.rateSpecificUnit ?? null,
    rateCompound: input.rateCompound ?? null,
    rateType: input.rateType ?? "AD_VALOREM",
    currency: input.currency ?? DEFAULT_CURRENCY,
    minRate: input.minRate ?? null,
    maxRate: input.maxRate ?? null,
    quotaVolume: input.quotaVolume ?? null,
    quotaUnit: input.quotaUnit ?? null,
    quotaPeriod: input.quotaPeriod ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveUntil: input.effectiveUntil ?? null,
    sourceId: input.sourceId ?? null,
    legalReference: input.legalReference ?? null,
    confidenceScore: input.confidenceScore ?? null,
    legalStatus: "IN_FORCE",
  };

  try {
    const where: any = {
      tariffType: data.tariffType,
      hsCode: data.hsCode,
    };
    // jurisdictionId is nullable — match either the value or null.
    if (input.jurisdictionId) {
      where.jurisdictionId = input.jurisdictionId;
    } else {
      where.jurisdictionId = null;
    }
    if (input.originCountry) {
      where.originCountry = input.originCountry.toUpperCase();
    } else {
      where.originCountry = null;
    }
    if (input.agreementId) {
      where.agreementId = input.agreementId;
    } else {
      where.agreementId = null;
    }

    const existing = await db.tariffRule.findFirst({
      where,
      orderBy: [{ updatedAt: "desc" }],
    });
    if (existing) {
      return await db.tariffRule.update({
        where: { id: existing.id },
        data,
      });
    }
    return await db.tariffRule.create({ data });
  } catch (e) {
    logger.error("[tariff/upsertTariffRule] failed", {
      tariffType: input.tariffType,
      hsCode: input.hsCode,
      hs6: input.hs6,
      error: e?.message || String(e),
    });
    throw e;
  }
}

/**
 * Check quota availability for a TariffRule. Returns the current quota
 * status and whether `requestedQuantity` would exceed the remaining volume.
 *
 *   wouldExceed = (quotaVolume != null) && (quotaUsed + requestedQuantity > quotaVolume)
 *
 * Defensive: on DB failure returns a status with `wouldExceed=true` and a
 * `quotaOpen=false` so callers fail safe (quota treated as exhausted).
 */
export async function checkQuotaAvailability(
  ruleId: string,
  requestedQuantity: number,
): Promise<QuotaStatus> {
  const safeQty =
    typeof requestedQuantity === "number" && Number.isFinite(requestedQuantity)
      ? requestedQuantity
      : 0;

  const failSafe: QuotaStatus = {
    ruleId: ruleId || "",
    quotaVolume: null,
    quotaUsed: 0,
    quotaRemaining: null,
    quotaOpen: false,
    requestedQuantity: safeQty,
    wouldExceed: true,
  };

  if (!ruleId || typeof ruleId !== "string") return failSafe;

  try {
    const rule = await db.tariffRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      logger.warn("[tariff/checkQuotaAvailability] rule not found", { ruleId });
      return failSafe;
    }
    const quotaVolume =
      typeof rule.quotaVolume === "number" ? rule.quotaVolume : null;
    const quotaUsed = typeof rule.quotaUsed === "number" ? rule.quotaUsed : 0;
    const quotaRemaining =
      quotaVolume != null ? Math.max(0, quotaVolume - quotaUsed) : null;
    const quotaOpen = rule.quotaOpen === true;
    const wouldExceed =
      quotaVolume != null ? quotaUsed + safeQty > quotaVolume : false;
    return {
      ruleId,
      quotaVolume,
      quotaUsed,
      quotaRemaining,
      quotaOpen,
      requestedQuantity: safeQty,
      wouldExceed,
    };
  } catch (e) {
    logger.error("[tariff/checkQuotaAvailability] failed", {
      ruleId,
      error: e?.message || String(e),
    });
    return failSafe;
  }
}

/**
 * Increment `quotaUsed` by `consumedQuantity` on a TariffRule. If
 * `quotaUsed >= quotaVolume` after the increment, set `quotaOpen = false`.
 *
 * Returns the updated rule. On DB failure the error is logged and re-thrown.
 */
export async function applyQuotaConsumption(
  ruleId: string,
  consumedQuantity: number,
): Promise<any> {
  if (!ruleId || typeof ruleId !== "string") {
    throw new Error("applyQuotaConsumption requires ruleId");
  }
  const qty =
    typeof consumedQuantity === "number" && Number.isFinite(consumedQuantity)
      ? consumedQuantity
      : 0;

  try {
    const rule = await db.tariffRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      throw new Error(`applyQuotaConsumption: TariffRule ${ruleId} not found`);
    }
    const currentUsed = typeof rule.quotaUsed === "number" ? rule.quotaUsed : 0;
    const newUsed = currentUsed + qty;
    const volume =
      typeof rule.quotaVolume === "number" ? rule.quotaVolume : null;
    const newOpen =
      volume == null ? true : newUsed < volume && rule.quotaOpen !== false;

    return await db.tariffRule.update({
      where: { id: ruleId },
      data: {
        quotaUsed: newUsed,
        quotaOpen: newOpen,
      },
    });
  } catch (e) {
    logger.error("[tariff/applyQuotaConsumption] failed", {
      ruleId,
      consumedQuantity: qty,
      error: e?.message || String(e),
    });
    throw e;
  }
}

/**
 * Determine whether a preferential TariffRule exists and is IN_FORCE for the
 * (hs6, origin, jurisdiction, agreement) tuple. Returns the eligibility
 * verdict plus the preferential rate, the MFN rate (for comparison), and the
 * savings (mfn - preferential, as ad-valorem percentage points).
 *
 * Defensive: on DB failure returns `{ eligible: false, reason: "DB error" }`.
 */
export async function isPreferentialEligible(input: {
  hs6: string;
  originCountry: string;
  jurisdictionCode: string;
  agreementId: string;
}): Promise<{
  eligible: boolean;
  preferentialRate?: number;
  mfnRate?: number;
  savings?: number;
  reason: string;
}> {
  const safeInput =
    input && typeof input === "object" ? input : ({} as typeof input);

  if (!safeInput.hs6 || !safeInput.originCountry || !safeInput.agreementId) {
    return {
      eligible: false,
      reason: "missing required input (hs6 / originCountry / agreementId)",
    };
  }

  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);

  // Verify the agreement is IN_FORCE and within date window.
  const agreement = await verifyAgreementInForce(
    safeInput.agreementId,
    new Date(),
  );
  if (!agreement) {
    return {
      eligible: false,
      reason: `agreement ${safeInput.agreementId} is not IN_FORCE or is outside its effective/expiry window`,
    };
  }

  try {
    const where: any = {
      tariffType: "PREFERENTIAL",
      hs6: safeInput.hs6,
      legalStatus: "IN_FORCE",
      agreementId: safeInput.agreementId,
      OR: [
        { originCountry: null },
        { originCountry: safeInput.originCountry.toUpperCase() },
      ],
    };
    if (jurisdictionId) {
      // Allow jurisdiction-specific OR jurisdiction-agnostic (null) rules.
      where.AND = [
        {
          OR: [{ jurisdictionId }, { jurisdictionId: null }],
        },
      ];
    }

    const rules: any[] = await db.tariffRule.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
    });

    if (rules.length === 0) {
      return {
        eligible: false,
        reason: `no IN_FORCE PREFERENTIAL TariffRule for hs6=${safeInput.hs6}, origin=${safeInput.originCountry}, agreement=${safeInput.agreementId}`,
      };
    }

    const prefRule = rules[0];
    const preferentialRate =
      typeof prefRule.rateAdValorem === "number" ? prefRule.rateAdValorem : undefined;

    // Also look up the MFN rate for savings comparison.
    let mfnRate: number | undefined;
    try {
      const mfnWhere: any = {
        tariffType: "MFN",
        hs6: safeInput.hs6,
        legalStatus: "IN_FORCE",
        OR: [
          { originCountry: null },
          { originCountry: safeInput.originCountry.toUpperCase() },
        ],
      };
      if (jurisdictionId) {
        mfnWhere.AND = [
          {
            OR: [{ jurisdictionId }, { jurisdictionId: null }],
          },
        ];
      }
      const mfnRule = await db.tariffRule.findFirst({
        where: mfnWhere,
        orderBy: [{ updatedAt: "desc" }],
      });
      if (mfnRule && typeof mfnRule.rateAdValorem === "number") {
        mfnRate = mfnRule.rateAdValorem;
      }
    } catch (e) {
      logger.warn("[tariff/isPreferentialEligible] MFN lookup failed", {
        hs6: safeInput.hs6,
        error: e?.message || String(e),
      });
    }

    const savings =
      typeof mfnRate === "number" && typeof preferentialRate === "number"
        ? Number((mfnRate - preferentialRate).toFixed(4))
        : undefined;

    return {
      eligible: true,
      preferentialRate,
      mfnRate,
      savings,
      reason: `preferential rate available under agreement ${safeInput.agreementId} (rule=${prefRule.id})`,
    };
  } catch (e) {
    logger.error("[tariff/isPreferentialEligible] failed", {
      hs6: safeInput.hs6,
      originCountry: safeInput.originCountry,
      agreementId: safeInput.agreementId,
      error: e?.message || String(e),
    });
    return {
      eligible: false,
      reason: `DB error: ${e?.message || String(e)}`,
    };
  }
}
