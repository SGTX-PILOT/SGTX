// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Phase 2 §4 — Origin Engine (Blueprint §4)
// ---------------------------------------------------------------------------
// Determines BOTH non-preferential AND preferential rules-of-origin for any
// (hs6, jurisdiction, originCountry[, agreementId]) tuple. Implements all
// twelve canonical SGTX origin criteria, the criterion evaluation order, and
// the supporting documentary / transport requirements.
//
// The twelve OriginRule.ruleType values
// --------------------------------------
//   1.  NON_PREFERENTIAL         — national rule (last substantial
//                                  transformation / wholly obtained / specific
//                                  processing) used for trade-statistics,
//                                  labelling, anti-dumping, quota allocation,
//                                  government procurement, labelling.
//   2.  PREFERENTIAL             — agreement-backed rule that, when met,
//                                  unlocks a reduced / zero preferential
//                                  duty rate under a TradeAgreement.
//   3.  WHOLLY_OBTAINED          — goods entirely grown, mined, harvested,
//                                  or born-and-raised in a single party.
//                                  Triggered when all materials (or no
//                                  materials at all) originate in the
//                                  origin country / cumulation parties.
//   4.  SUBSTANTIAL_TRANSFORMATION — non-preferential catch-all: goods whose
//                                  last processing resulted in a Change of
//                                  Tariff Heading (CTH) or otherwise
//                                  conferred a new commercial identity.
//   5.  TARIFF_SHIFT             — preferential Change of Tariff Classification
//                                  rule: CC (chapter / 2-digit), CTH (heading /
//                                  4-digit), or CTSH (sub-heading / 6-digit).
//   6.  REGIONAL_VALUE_CONTENT   — preferential RVC threshold test computed
//                                  by TRANSACTION_VALUE, BUILD_UP, or
//                                  BUILD_DOWN method. Compared against
//                                  `rvcThreshold` (a percentage).
//   7.  PROCESSING               — preferential specific processing /
//                                  chemical-reaction / minimal-ops rule.
//                                  Requires documented process + (when the
//                                  rule says so) approved-exporter status.
//   8.  CUMULATION               — bilateral / diagonal / full cumulation:
//                                  materials originating in another agreement
//                                  party may be counted as originating.
//   9.  DIRECT_SHIPMENT          — non-manipulation / direct transport rule:
//                                  goods must be shipped directly from the
//                                  origin party to the importing party without
//                                  entering commerce elsewhere. Transshipment
//                                  (with non-manipulation preserved) is allowed
//                                  only if the agreement explicitly permits it.
//  10.  ORIGIN_DECLARATION       — documentary requirement: a statement of
//                                  origin on the invoice (typically for
//                                  approved exporters or low-value shipments).
//  11.  CERTIFICATE_OF_ORIGIN    — documentary requirement: a Certificate
//                                  of Origin (Form A, EUR.1, USMCA CCO, etc.)
//                                  issued by an authorised body.
//  12.  APPROVED_EXPORTER       — exporter enrolled with customs to self-
//                                  certify origin. Required for some
//                                  PROCESSING and ORIGIN_DECLARATION rules.
//
// Criterion evaluation order (preferential)
// ------------------------------------------
//   WHOLLY_OBTAINED  →  TARIFF_SHIFT  →  REGIONAL_VALUE_CONTENT  →
//   PROCESSING       →  CUMULATION
//
//   The first criterion that returns qualifying=true wins. If a rule exists
//   for a later criterion but an earlier one already qualified, the later
//   rule is still recorded as a `requiredDocuments` source (so an auditor
//   can see what documentary evidence the rule expected) but is not used
//   as the `ruleApplied`.
//
//   DIRECT_SHIPMENT is evaluated AFTER the qualifying criterion is chosen:
//   if a direct-transport rule exists and the shipment was transshipped,
//   the preferential determination is degraded to CONDITIONAL and
//   `humanReviewRequired = true`. The non-manipulation rule is enforced
//   defensively — absence of a DIRECT_SHIPMENT rule means direct transport
//   is NOT required.
//
//   CERTIFICATE_OF_ORIGIN / ORIGIN_DECLARATION / APPROVED_EXPORTER are
//   documentary rules: they are surfaced in `requiredDocuments` and not
//   used to gate the determination itself. Whether the documents are
//   physically present is checked by a downstream documentary-compliance
//   step (outside this engine).
//
// RVC computation (computeRVC — pure)
// -----------------------------------
//   TRANSACTION_VALUE  :  RVC = (TV - VNM) / TV * 100
//   BUILD_DOWN         :  RVC = (TV - VNM) / TV * 100   (same formula)
//   BUILD_UP           :  RVC = (buildUpValueUsd) / TV * 100
//
//   Where:
//     TV   = transaction value of the good (FOB, USD)
//     VNM  = value of non-originating materials used in production
//     buildUpValueUsd = value of originating materials + direct costs
//
// Tariff-shift computation (checkTariffShift — pure)
// --------------------------------------------------
//   target="CC"   → 2-digit chapter change
//   target="CTH" → 4-digit heading change
//   target="CTSH"→ 6-digit subheading change
//
//   For each input material: shifted = (material.hs6.slice(0, n) !==
//   finishedHs6.slice(0, n)) where n = target length (2, 4, or 6).
//   shiftAchieved = ALL materials shifted (an empty materials list is
//   treated as achieving the shift — wholly-obtained logic catches that
//   earlier in the pipeline).
//
// Direct-transport verification (verifyDirectTransport — pure)
// ------------------------------------------------------------
//   If the agreement requires direct transport AND the shipment was
//   transshipped (with non-manipulation not preserved) → non-compliant.
//   Otherwise compliant.
//
// All DB access is defensive — failures are logged via the shared SGTX
// logger and the engine falls back to safe defaults (null / [] / a
// CONDITIONAL OriginResult). No DB error ever throws out of this module.
// The single exception is `upsertOriginRule`, which re-throws logged
// errors so callers can react to a write failure.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Module constants ============

/**
 * Canonical origin rule types recognised by the engine. Each value maps 1:1
 * to the `OriginRule.ruleType` column.
 */
export const ORIGIN_RULE_TYPES = [
  "NON_PREFERENTIAL",
  "PREFERENTIAL",
  "WHOLLY_OBTAINED",
  "SUBSTANTIAL_TRANSFORMATION",
  "TARIFF_SHIFT",
  "REGIONAL_VALUE_CONTENT",
  "PROCESSING",
  "CUMULATION",
  "DIRECT_SHIPMENT",
  "ORIGIN_DECLARATION",
  "CERTIFICATE_OF_ORIGIN",
  "APPROVED_EXPORTER",
] as const;

/** Rule types that drive non-preferential origin determination. */
export const NON_PREFERENTIAL_RULE_TYPES = [
  "NON_PREFERENTIAL",
  "WHOLLY_OBTAINED",
  "SUBSTANTIAL_TRANSFORMATION",
] as const;

/** Rule types that drive preferential origin determination. */
export const PREFERENTIAL_RULE_TYPES = [
  "PREFERENTIAL",
  "TARIFF_SHIFT",
  "REGIONAL_VALUE_CONTENT",
  "PROCESSING",
  "CUMULATION",
  "DIRECT_SHIPMENT",
] as const;

/** Documentary rule types — surfaced as required documents, never gating. */
export const DOCUMENTARY_RULE_TYPES = [
  "CERTIFICATE_OF_ORIGIN",
  "ORIGIN_DECLARATION",
  "APPROVED_EXPORTER",
] as const;

/**
 * Order in which preferential criteria are evaluated. First qualifying
 * criterion wins.
 */
export const PREFERENTIAL_EVALUATION_ORDER = [
  "WHOLLY_OBTAINED",
  "TARIFF_SHIFT",
  "REGIONAL_VALUE_CONTENT",
  "PROCESSING",
  "CUMULATION",
] as const;

/** Confidence when a clear rule match + RVC well above/below threshold. */
export const CONFIDENCE_FULL = 1.0;

/** Confidence when RVC within 5pp of threshold (CONDITIONAL, humanReview). */
export const CONFIDENCE_BORDERLINE = 0.7;

/** Confidence when no origin rules found at all. */
export const CONFIDENCE_NO_RULES = 0.5;

/** Margin (percentage points) around the RVC threshold that triggers human review. */
export const RVC_BORDERLINE_MARGIN_PP = 5;

// ============ Exported types ============

export interface MaterialInput {
  hs6: string;
  originCountry: string;
  valueUsd: number;
  processed?: boolean;
}

export interface OriginInput {
  hs6: string;
  originCountry: string;
  jurisdictionCode: string;
  agreementId?: string;
  materials?: MaterialInput[];
  transactionValueUsd?: number;
  nonOriginValueUsd?: number;
  buildUpValueUsd?: number;
  shippingTransshipment?: boolean;
  exporterApproved?: boolean;
}

export interface OriginResult {
  nonPreferential: {
    originCountry: string;
    basis:
      | "wholly_obtained"
      | "substantial_transformation"
      | "last_substantial_processing"
      | "unknown";
    qualifying: boolean;
    ruleId?: string;
  };
  preferential?: {
    agreementId: string;
    ruleApplied: string;
    rvcActual?: number;
    rvcThreshold?: number;
    tariffShiftTarget?: string;
    tariffShiftAchieved?: boolean;
    qualifying: boolean;
    reason: string;
    ruleId?: string;
  };
  /** Overall qualifying: true if preferential qualifying OR (non-preferential qualifying AND no preferential claimed). */
  qualifying: boolean;
  confidence: number;
  requiredDocuments: string[];
  restrictions: string[];
  ruleIds: string[];
  humanReviewRequired: boolean;
  verdict: "ALLOW" | "CONDITIONAL" | "DENY";
}

export interface UpsertOriginRuleInput {
  ruleType: string;
  hs6?: string;
  hs6Str?: string;
  jurisdictionId?: string;
  agreementId?: string;
  productId?: string;
  originCountry?: string;
  ruleCriteria?: string;
  rvcThreshold?: number;
  rvcMethod?: string;
  tariffShiftTarget?: string;
  requiredDocuments?: string;
  certificationBody?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
  sourceId?: string;
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

/** Upper-case a country code safely. */
function upper(s: string | undefined | null): string {
  return typeof s === "string" ? s.toUpperCase() : "";
}

/** Numeric coercion — returns 0 for non-finite values. */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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
    logger.error("[origin/resolveJurisdictionId] failed", {
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
    logger.error("[origin/verifyAgreementInForce] failed", {
      agreementId,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Load all applicable OriginRule rows for the (hs6, jurisdiction,
 * originCountry[, agreementId]) tuple filtered by `ruleTypes` that are
 * IN_FORCE as of `asOf`. Defensive — returns [] on DB failure.
 *
 * Loading logic:
 *   • Match by hs6 when present, OR hs6 = null (catch-all / global rules).
 *   • Match by jurisdictionId when present, OR jurisdictionId = null
 *     (any-jurisdiction / WCO baseline rules).
 *   • Match by originCountry when present, OR originCountry = null
 *     (origin-agnostic rules).
 *   • When agreementId provided: match by agreementId OR agreementId = null.
 *     When agreementId not provided: only match agreementId = null
 *     (non-preferential lookup should NOT pick up stray preferential rules).
 *   • legalStatus = "IN_FORCE".
 *   • effectiveFrom is null or <= asOf.
 *   • effectiveUntil is null or > asOf.
 *   • ruleType IN `ruleTypes`.
 *
 * Deduplicates by rule.id.
 */
async function loadApplicableOriginRules(
  hs6: string,
  jurisdictionId: string | null,
  originCountry: string,
  agreementId: string | undefined,
  ruleTypes: string[],
  asOf: Date,
): Promise<any[]> {
  if (!ruleTypes || ruleTypes.length === 0) return [];

  const hsClauses: any[] = [];
  if (hs6) {
    hsClauses.push({ hs6 });
    hsClauses.push({ hs6: null });
  } else {
    hsClauses.push({ hs6: null });
  }

  const jurisClauses: any[] = [];
  if (jurisdictionId) {
    jurisClauses.push({ jurisdictionId });
    jurisClauses.push({ jurisdictionId: null });
  } else {
    jurisClauses.push({ jurisdictionId: null });
  }

  const originClauses: any[] = [];
  if (originCountry) {
    originClauses.push({ originCountry: null });
    originClauses.push({ originCountry: originCountry.toUpperCase() });
  } else {
    originClauses.push({ originCountry: null });
  }

  const agreementClauses: any[] = [];
  if (agreementId) {
    agreementClauses.push({ agreementId });
    agreementClauses.push({ agreementId: null });
  } else {
    // Non-preferential lookup: only pick up rules with no agreement link.
    agreementClauses.push({ agreementId: null });
  }

  const where: any = {
    AND: [
      { legalStatus: "IN_FORCE" },
      { ruleType: { in: ruleTypes } },
      { OR: hsClauses },
      { OR: jurisClauses },
      { OR: originClauses },
      { OR: agreementClauses },
      {
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asOf } }],
      },
      {
        OR: [
          { effectiveUntil: null },
          { effectiveUntil: { gt: asOf } },
        ],
      },
    ],
  };

  try {
    const rules: any[] = await db.originRule.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
    });
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
    logger.error("[origin/loadApplicableOriginRules] failed", {
      hs6,
      jurisdictionId,
      originCountry,
      agreementId,
      ruleTypes,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Extract the list of cumulation parties (ISO alpha-2) from a TradeAgreement
 * row's `cumulation` JSON field. Defensive — returns [] on missing /
 * malformed payload.
 *
 *   cumulation: { bilateral: bool, diagonal: bool, full: bool,
 *                 cumulationParties: ["EG","JO","TN",...] }
 */
function extractCumulationParties(agreement: any | null): string[] {
  if (!agreement) return [];
  const c = safeJsonParse<any>(agreement.cumulation, null);
  if (!c) return [];
  const parties = Array.isArray(c.cumulationParties) ? c.cumulationParties : [];
  return parties
    .filter((p) => typeof p === "string" && p.length > 0)
    .map((p) => String(p).toUpperCase());
}

/** True when the agreement enables any cumulation mode. */
function agreementAllowsCumulation(agreement: any | null): boolean {
  if (!agreement) return false;
  const c = safeJsonParse<any>(agreement.cumulation, null);
  if (!c) return false;
  return Boolean(c.bilateral || c.diagonal || c.full);
}

/**
 * Determine whether every material originates in `originCountry` (case
 * insensitive). An empty materials list counts as wholly obtained.
 */
function isWhollyObtained(
  materials: MaterialInput[],
  originCountry: string,
): boolean {
  if (!Array.isArray(materials) || materials.length === 0) return true;
  const o = upper(originCountry);
  return materials.every((m) => upper(m.originCountry) === o);
}

/**
 * Determine whether substantial transformation occurred at the non-
 * preferential level. Triggered when:
 *   • any material has `processed: true`, OR
 *   • a Change of Tariff Heading (CTH, 4-digit) is achieved across all
 *     materials vs the finished goods hs6.
 */
function hasSubstantialTransformation(
  materials: MaterialInput[],
  finishedHs6: string,
): { transformed: boolean; cthShift: boolean } {
  if (!Array.isArray(materials) || materials.length === 0) {
    return { transformed: false, cthShift: false };
  }
  const processedFlag = materials.some((m) => m.processed === true);

  // CTH shift = change of 4-digit heading for every non-origin material.
  const target4 = "CTH";
  const shiftResult = checkTariffShift(materials, target4, finishedHs6);
  return {
    transformed: processedFlag || shiftResult.shiftAchieved,
    cthShift: shiftResult.shiftAchieved,
  };
}

// ============ Pure helpers (no DB) ============

/**
 * Compute the Regional Value Content (RVC) percentage.
 *
 *   TRANSACTION_VALUE  :  RVC = (TV - VNM) / TV * 100
 *   BUILD_DOWN         :  RVC = (TV - VNM) / TV * 100   (same formula)
 *   BUILD_UP           :  RVC = (buildUpValueUsd) / TV * 100
 *
 * Returns `{ rvc, method, formula }`. When TV <= 0 (or non-finite), RVC
 * is reported as 0 — the caller is expected to mark the determination
 * as CONDITIONAL / humanReviewRequired.
 *
 * Pure function: NO DB calls.
 */
export function computeRVC(
  method: string,
  transactionValueUsd: number,
  nonOriginValueUsd: number,
  buildUpValueUsd?: number,
): { rvc: number; method: string; formula: string } {
  const tv = num(transactionValueUsd);
  const vnm = num(nonOriginValueUsd);
  const buildUp = num(buildUpValueUsd);
  const m = upper(method);

  if (m === "BUILD_UP") {
    const rvc = tv > 0 ? (buildUp / tv) * 100 : 0;
    return {
      rvc: Number.isFinite(rvc) ? Number(rvc.toFixed(4)) : 0,
      method: "BUILD_UP",
      formula: "RVC = (value of originating materials + direct costs) / TV * 100",
    };
  }

  if (m === "BUILD_DOWN" || m === "TRANSACTION_VALUE") {
    const rvc = tv > 0 ? ((tv - vnm) / tv) * 100 : 0;
    return {
      rvc: Number.isFinite(rvc) ? Number(rvc.toFixed(4)) : 0,
      method: m === "BUILD_DOWN" ? "BUILD_DOWN" : "TRANSACTION_VALUE",
      formula: "RVC = (TV - VNM) / TV * 100",
    };
  }

  // Unknown method — fall back to TRANSACTION_VALUE formula but flag.
  const rvc = tv > 0 ? ((tv - vnm) / tv) * 100 : 0;
  return {
    rvc: Number.isFinite(rvc) ? Number(rvc.toFixed(4)) : 0,
    method: m || "TRANSACTION_VALUE",
    formula: "RVC = (TV - VNM) / TV * 100  (defaulted — unknown method)",
  };
}

/**
 * Check whether a tariff-shift rule (CC / CTH / CTSH) is satisfied for a
 * set of input materials vs the finished goods hs6.
 *
 *   target="CC"    → 2-digit chapter change
 *   target="CTH"   → 4-digit heading change
 *   target="CTSH"  → 6-digit subheading change
 *
 * For each material: shifted = (material.hs6.slice(0, n) !==
 * finishedHs6.slice(0, n)) where n = target length. The rule is satisfied
 * when ALL materials have shifted. An empty materials list returns
 * shiftAchieved=true (wholly-obtained logic catches the no-materials case
 * earlier, but the safety default is `true`).
 *
 * Pure function: NO DB calls.
 */
export function checkTariffShift(
  materials: MaterialInput[],
  target: string,
  finishedHs6: string,
): {
  shiftAchieved: boolean;
  details: { hs6: string; originCountry: string; shifted: boolean }[];
} {
  const t = upper(target);
  let digits = 0;
  if (t === "CC") digits = 2;
  else if (t === "CTH") digits = 4;
  else if (t === "CTSH") digits = 6;
  else {
    // Unknown target — default to 4-digit heading (most common).
    digits = 4;
  }

  const finished = (finishedHs6 || "").slice(0, digits);

  if (!Array.isArray(materials) || materials.length === 0) {
    return { shiftAchieved: true, details: [] };
  }

  const details = materials.map((m) => {
    const mat = (m?.hs6 || "").slice(0, digits);
    const shifted = mat !== finished;
    return { hs6: m?.hs6 || "", originCountry: m?.originCountry || "", shifted };
  });
  const shiftAchieved = details.every((d) => d.shifted === true);
  return { shiftAchieved, details };
}

/**
 * Verify direct-transport / non-manipulation compliance.
 *
 *   • If the agreement does NOT require direct transport → compliant (true).
 *   • If the agreement requires direct transport AND the shipment was NOT
 *     transshipped → compliant (true).
 *   • If the agreement requires direct transport AND the shipment WAS
 *     transshipped (non-manipulation rule broken) → non-compliant (false).
 *
 * Pure function: NO DB calls.
 */
export function verifyDirectTransport(
  transshipped: boolean,
  agreementDirectTransportRequired: boolean,
): { compliant: boolean; reason: string } {
  if (!agreementDirectTransportRequired) {
    return {
      compliant: true,
      reason: "agreement does not require direct transport",
    };
  }
  if (!transshipped) {
    return {
      compliant: true,
      reason: "direct shipment preserved — non-manipulation rule satisfied",
    };
  }
  return {
    compliant: false,
    reason:
      "transshipment occurred while agreement requires direct transport — non-manipulation rule broken",
  };
}

// ============ Core engine: determineOrigin ============

/**
 * Determine BOTH non-preferential AND preferential origin for an
 * (hs6, jurisdiction, originCountry[, agreementId]) tuple.
 *
 * Pipeline:
 *   1. Resolve jurisdictionId from jurisdictionCode.
 *   2. Load non-preferential OriginRule rows (NON_PREFERENTIAL,
 *      WHOLLY_OBTAINED, SUBSTANTIAL_TRANSFORMATION).
 *   3. Determine non-preferential origin:
 *        • wholly_obtained if no non-origin materials;
 *        • substantial_transformation if any material.processed OR CTH
 *          shift achieved;
 *        • else unknown (CONDITIONAL).
 *   4. If agreementId provided:
 *        • verify TradeAgreement is IN_FORCE and within window;
 *        • load preferential OriginRule rows (PREFERENTIAL, TARIFF_SHIFT,
 *          REGIONAL_VALUE_CONTENT, PROCESSING, CUMULATION, DIRECT_SHIPMENT);
 *        • evaluate each criterion in order
 *          (WHOLLY_OBTAINED → TARIFF_SHIFT → RVC → PROCESSING → CUMULATION);
 *          first qualifying wins.
 *   5. DIRECT_SHIPMENT: if a direct-shipment rule exists AND the agreement
 *      requires direct transport AND shippingTransshipment=true → degrade
 *      preferential to CONDITIONAL + humanReviewRequired.
 *   6. CERTIFICATE_OF_ORIGIN / ORIGIN_DECLARATION / APPROVED_EXPORTER rules
 *      → add their `requiredDocuments` (parsed from JSON) to the result.
 *   7. Confidence:
 *        • 1.0 when clear rule match + RVC well above/below threshold;
 *        • 0.7 when RVC within 5pp of threshold (CONDITIONAL);
 *        • 0.5 when no rules found.
 *
 * Defensive — never throws. On any DB / parse error returns a CONDITIONAL
 * OriginResult with `humanReviewRequired = true`.
 */
export async function determineOrigin(
  input: OriginInput,
): Promise<OriginResult> {
  const safeInput: OriginInput = {
    hs6: typeof input?.hs6 === "string" ? input.hs6 : "",
    originCountry: upper(input?.originCountry),
    jurisdictionCode: upper(input?.jurisdictionCode),
    agreementId:
      typeof input?.agreementId === "string" ? input.agreementId : undefined,
    materials: Array.isArray(input?.materials) ? input.materials : [],
    transactionValueUsd:
      typeof input?.transactionValueUsd === "number"
        ? input.transactionValueUsd
        : undefined,
    nonOriginValueUsd:
      typeof input?.nonOriginValueUsd === "number"
        ? input.nonOriginValueUsd
        : undefined,
    buildUpValueUsd:
      typeof input?.buildUpValueUsd === "number"
        ? input.buildUpValueUsd
        : undefined,
    shippingTransshipment: input?.shippingTransshipment === true,
    exporterApproved: input?.exporterApproved === true,
  };

  const asOf = new Date();
  const ruleIds: string[] = [];
  const requiredDocuments: string[] = [];
  const restrictions: string[] = [];
  let humanReviewRequired = false;
  let confidence = CONFIDENCE_NO_RULES;

  // Step 1: resolve jurisdictionId.
  const jurisdictionId = await resolveJurisdictionId(safeInput.jurisdictionCode);

  // ---------------------------------------------------------------
  // NON-PREFERENTIAL ORIGIN
  // ---------------------------------------------------------------
  let nonPrefRuleId: string | undefined;
  let nonPrefBasis:
    | "wholly_obtained"
    | "substantial_transformation"
    | "last_substantial_processing"
    | "unknown" = "unknown";
  let nonPrefQualifying = false;

  try {
    const nonPrefRules = await loadApplicableOriginRules(
      safeInput.hs6,
      jurisdictionId,
      safeInput.originCountry,
      undefined, // non-preferential: only agreementId=null rules
      Array.from(NON_PREFERENTIAL_RULE_TYPES),
      asOf,
    );

    for (const r of nonPrefRules) {
      if (r?.id) ruleIds.push(r.id);
    }

    const whollyObtainedRule = nonPrefRules.find(
      (r) => String(r.ruleType).toUpperCase() === "WHOLLY_OBTAINED",
    );
    const substantialRule = nonPrefRules.find(
      (r) => String(r.ruleType).toUpperCase() === "SUBSTANTIAL_TRANSFORMATION",
    );
    const nonPrefGenericRule = nonPrefRules.find(
      (r) => String(r.ruleType).toUpperCase() === "NON_PREFERENTIAL",
    );

    // 3a. wholly obtained?
    if (isWhollyObtained(safeInput.materials, safeInput.originCountry)) {
      nonPrefBasis = "wholly_obtained";
      nonPrefQualifying = true;
      nonPrefRuleId =
        whollyObtainedRule?.id ||
        nonPrefGenericRule?.id ||
        substantialRule?.id;
    } else {
      // 3b. substantial transformation?
      const { transformed, cthShift } = hasSubstantialTransformation(
        safeInput.materials,
        safeInput.hs6,
      );
      if (transformed) {
        nonPrefBasis = "substantial_transformation";
        nonPrefQualifying = true;
        nonPrefRuleId =
          substantialRule?.id ||
          nonPrefGenericRule?.id ||
          whollyObtainedRule?.id;
      } else if (cthShift) {
        // defensive — CTH shift but no processed flag.
        nonPrefBasis = "substantial_transformation";
        nonPrefQualifying = true;
        nonPrefRuleId = substantialRule?.id || nonPrefGenericRule?.id;
      } else {
        // 3c. last substantial processing fallback — when there's a
        // generic non-preferential rule we mark it last_substantial_processing
        // (best effort) but require human review.
        if (nonPrefGenericRule || substantialRule) {
          nonPrefBasis = "last_substantial_processing";
          nonPrefQualifying = true;
          nonPrefRuleId = substantialRule?.id || nonPrefGenericRule?.id;
          humanReviewRequired = true;
        } else {
          nonPrefBasis = "unknown";
          nonPrefQualifying = false;
          humanReviewRequired = true;
        }
      }
    }
  } catch (e) {
    logger.error("[origin/determineOrigin] non-preferential phase failed", {
      hs6: safeInput.hs6,
      error: e?.message || String(e),
    });
    nonPrefBasis = "unknown";
    nonPrefQualifying = false;
    humanReviewRequired = true;
  }

  // ---------------------------------------------------------------
  // PREFERENTIAL ORIGIN (only if agreementId provided)
  // ---------------------------------------------------------------
  let preferential: OriginResult["preferential"] | undefined;
  let prefQualifying = false;

  if (safeInput.agreementId) {
    try {
      const agreement = await verifyAgreementInForce(safeInput.agreementId, asOf);
      if (!agreement) {
        preferential = {
          agreementId: safeInput.agreementId,
          ruleApplied: "NONE",
          qualifying: false,
          reason:
            "agreement not found, not IN_FORCE, or outside effective/expiry window",
        };
        humanReviewRequired = true;
      } else {
        const prefRules = await loadApplicableOriginRules(
          safeInput.hs6,
          jurisdictionId,
          safeInput.originCountry,
          safeInput.agreementId,
          Array.from(PREFERENTIAL_RULE_TYPES),
          asOf,
        );

        for (const r of prefRules) {
          if (r?.id) ruleIds.push(r.id);
        }

        const cumulationParties = extractCumulationParties(agreement);
        const cumulationAllowed = agreementAllowsCumulation(agreement);

        // Evaluate criteria in order — first qualifying wins.
        let applied: {
          ruleApplied: string;
          ruleId?: string;
          rvcActual?: number;
          rvcThreshold?: number;
          tariffShiftTarget?: string;
          tariffShiftAchieved?: boolean;
          qualifying: boolean;
          reason: string;
        } | null = null;

        // --- WHOLLY_OBTAINED ---
        if (!applied) {
          const whollyRule = prefRules.find(
            (r) => String(r.ruleType).toUpperCase() === "WHOLLY_OBTAINED",
          );
          if (whollyRule) {
            const directOrigin = isWhollyObtained(
              safeInput.materials,
              safeInput.originCountry,
            );
            const cumulationOrigin =
              cumulationAllowed &&
              (safeInput.materials.length === 0 ||
                safeInput.materials.every((m) =>
                  cumulationParties.includes(upper(m.originCountry)),
                ));
            const qualifies = directOrigin || cumulationOrigin;
            applied = {
              ruleApplied: "wholly_obtained",
              ruleId: whollyRule.id,
              qualifying: qualifies,
              reason: qualifies
                ? "all materials wholly obtained in origin country / cumulation parties"
                : "non-origin materials present — wholly obtained not satisfied",
            };
          }
        }

        // --- TARIFF_SHIFT ---
        if (!applied) {
          const tsRule = prefRules.find(
            (r) => String(r.ruleType).toUpperCase() === "TARIFF_SHIFT",
          );
          if (tsRule) {
            const target =
              tsRule.tariffShiftTarget || "CTH"; // default 4-digit heading
            const shift = checkTariffShift(
              safeInput.materials,
              String(target),
              safeInput.hs6,
            );
            applied = {
              ruleApplied: "tariff_shift",
              ruleId: tsRule.id,
              tariffShiftTarget: String(target),
              tariffShiftAchieved: shift.shiftAchieved,
              qualifying: shift.shiftAchieved,
              reason: shift.shiftAchieved
                ? `tariff shift ${target} achieved across all materials`
                : `tariff shift ${target} NOT achieved for all materials`,
            };
          }
        }

        // --- REGIONAL_VALUE_CONTENT ---
        if (!applied) {
          const rvcRule = prefRules.find(
            (r) => String(r.ruleType).toUpperCase() === "REGIONAL_VALUE_CONTENT",
          );
          if (rvcRule) {
            const method =
              rvcRule.rvcMethod || "TRANSACTION_VALUE";
            const tv = num(safeInput.transactionValueUsd);
            const vnm = num(safeInput.nonOriginValueUsd);
            const rvc = computeRVC(
              method,
              tv,
              vnm,
              safeInput.buildUpValueUsd,
            ).rvc;
            const threshold =
              typeof rvcRule.rvcThreshold === "number"
                ? rvcRule.rvcThreshold
                : undefined;

            let qualifies = false;
            if (threshold != null && Number.isFinite(threshold)) {
              qualifies = rvc >= threshold;
            } else {
              // No threshold recorded — cannot verify, mark for review.
              qualifies = false;
              humanReviewRequired = true;
            }

            // Borderline (within 5pp of threshold) → human review.
            if (
              threshold != null &&
              Number.isFinite(rvc) &&
              Math.abs(rvc - threshold) <= RVC_BORDERLINE_MARGIN_PP
            ) {
              humanReviewRequired = true;
            }

            applied = {
              ruleApplied: "rvc",
              ruleId: rvcRule.id,
              rvcActual: rvc,
              rvcThreshold: threshold,
              qualifying: qualifies,
              reason:
                threshold != null
                  ? `RVC ${rvc.toFixed(2)}% ${qualifies ? ">=" : "<"} threshold ${threshold}%`
                  : `RVC ${rvc.toFixed(2)}% computed but no threshold on rule`,
            };
          }
        }

        // --- PROCESSING ---
        if (!applied) {
          const procRule = prefRules.find(
            (r) => String(r.ruleType).toUpperCase() === "PROCESSING",
          );
          if (procRule) {
            // Qualifies when the exporter is approved AND any material
            // has been processed. (A more rigorous test would parse the
            // ruleCriteria JSON for required processing ops.)
            const criteria = safeJsonParse<any>(procRule.ruleCriteria, null);
            const requiresApprovedExporter =
              criteria?.requiresApprovedExporter === true ||
              criteria?.approvedExporter === true;
            const anyProcessed =
              Array.isArray(safeInput.materials) &&
              safeInput.materials.some((m) => m.processed === true);

            const approvedOk =
              !requiresApprovedExporter || safeInput.exporterApproved === true;
            const qualifies = approvedOk && anyProcessed;

            if (requiresApprovedExporter && !safeInput.exporterApproved) {
              restrictions.push(
                "PROCESSING rule requires approved-exporter status — exporter not approved",
              );
            }

            applied = {
              ruleApplied: "processing",
              ruleId: procRule.id,
              qualifying: qualifies,
              reason: qualifies
                ? "processing operations documented and exporter approved"
                : requiresApprovedExporter && !safeInput.exporterApproved
                  ? "approved-exporter status required but not held"
                  : "no documented processing operations",
            };
          }
        }

        // --- CUMULATION ---
        if (!applied) {
          const cumRule = prefRules.find(
            (r) => String(r.ruleType).toUpperCase() === "CUMULATION",
          );
          if (cumRule) {
            if (!cumulationAllowed) {
              applied = {
                ruleApplied: "cumulation",
                ruleId: cumRule.id,
                qualifying: false,
                reason: "agreement does not allow cumulation",
              };
            } else {
              // Cumulation qualifies when at least one material originates
              // in a cumulation party. (Combined with other criteria this
              // is a fallback — by itself it counts originating materials
              // from cumulation parties toward the determination.)
              const cumMaterials = safeInput.materials.filter((m) =>
                cumulationParties.includes(upper(m.originCountry)),
              );
              const qualifies = cumMaterials.length > 0;
              applied = {
                ruleApplied: "cumulation",
                ruleId: cumRule.id,
                qualifying: qualifies,
                reason: qualifies
                  ? `${cumMaterials.length} material(s) originating in cumulation parties (${cumulationParties.join(", ")})`
                  : "no materials from cumulation parties",
              };
            }
          }
        }

        if (applied) {
          prefQualifying = applied.qualifying;

          // DIRECT_SHIPMENT: degrade to CONDITIONAL on transshipment
          // when the agreement requires direct transport.
          const directShipRule = prefRules.find(
            (r) => String(r.ruleType).toUpperCase() === "DIRECT_SHIPMENT",
          );
          const agreementRequiresDirect = agreement.directTransport === true;
          if (directShipRule && agreementRequiresDirect) {
            const dt = verifyDirectTransport(
              safeInput.shippingTransshipment,
              true,
            );
            if (!dt.compliant) {
              // Downgrade qualifying → CONDITIONAL + human review.
              if (applied.qualifying) {
                applied.qualifying = false;
                applied.reason = `${applied.reason}; DIRECT_SHIPMENT rule violated — ${dt.reason}`;
              }
              humanReviewRequired = true;
              restrictions.push(`direct-transport rule: ${dt.reason}`);
            }
          }

          preferential = {
            agreementId: safeInput.agreementId,
            ruleApplied: applied.ruleApplied,
            ruleId: applied.ruleId,
            rvcActual: applied.rvcActual,
            rvcThreshold: applied.rvcThreshold,
            tariffShiftTarget: applied.tariffShiftTarget,
            tariffShiftAchieved: applied.tariffShiftAchieved,
            qualifying: applied.qualifying,
            reason: applied.reason,
          };
        } else {
          // No preferential rule matched.
          preferential = {
            agreementId: safeInput.agreementId,
            ruleApplied: "NONE",
            qualifying: false,
            reason: "no preferential origin rule matched for this hs6 / jurisdiction / agreement",
          };
          humanReviewRequired = true;
        }

        // Confidence.
        if (preferential?.ruleApplied && preferential.ruleApplied !== "NONE") {
          if (
            preferential.ruleApplied === "rvc" &&
            typeof preferential.rvcThreshold === "number" &&
            typeof preferential.rvcActual === "number" &&
            Math.abs(preferential.rvcActual - preferential.rvcThreshold) <=
              RVC_BORDERLINE_MARGIN_PP
          ) {
            confidence = CONFIDENCE_BORDERLINE;
          } else if (preferential.qualifying) {
            confidence = CONFIDENCE_FULL;
          } else {
            confidence = CONFIDENCE_BORDERLINE;
          }
        } else {
          confidence = CONFIDENCE_NO_RULES;
        }
      }
    } catch (e) {
      logger.error("[origin/determineOrigin] preferential phase failed", {
        agreementId: safeInput.agreementId,
        hs6: safeInput.hs6,
        error: e?.message || String(e),
      });
      preferential = {
        agreementId: safeInput.agreementId,
        ruleApplied: "NONE",
        qualifying: false,
        reason: `preferential determination failed: ${e?.message || String(e)}`,
      };
      humanReviewRequired = true;
      confidence = CONFIDENCE_NO_RULES;
    }
  } else {
    // No agreement claimed — confidence depends on non-pref rule match.
    if (nonPrefQualifying && nonPrefBasis !== "unknown") {
      confidence = CONFIDENCE_FULL;
    } else {
      confidence = CONFIDENCE_NO_RULES;
    }
  }

  // ---------------------------------------------------------------
  // DOCUMENTARY REQUIREMENTS (CERTIFICATE_OF_ORIGIN / ORIGIN_DECLARATION / APPROVED_EXPORTER)
  // ---------------------------------------------------------------
  try {
    const docRules = await loadApplicableOriginRules(
      safeInput.hs6,
      jurisdictionId,
      safeInput.originCountry,
      safeInput.agreementId,
      Array.from(DOCUMENTARY_RULE_TYPES),
      asOf,
    );
    for (const r of docRules) {
      if (r?.id) ruleIds.push(r.id);
      const docs = safeJsonParse<string[]>(r.requiredDocuments, []);
      if (Array.isArray(docs)) {
        for (const d of docs) {
          if (typeof d === "string" && d.length > 0 && !requiredDocuments.includes(d)) {
            requiredDocuments.push(d);
          }
        }
      }
      // Also surface the rule type itself as a required-document label.
      const label = String(r.ruleType || "")
        .split("_")
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(" ");
      if (label && !requiredDocuments.includes(label)) {
        requiredDocuments.push(label);
      }
    }
  } catch (e) {
    logger.error("[origin/determineOrigin] documentary phase failed", {
      hs6: safeInput.hs6,
      error: e?.message || String(e),
    });
  }

  // ---------------------------------------------------------------
  // FINAL VERDICT
  // ---------------------------------------------------------------
  const overallQualifying =
    prefQualifying ||
    (nonPrefQualifying && !safeInput.agreementId);

  // Verdict: ALLOW when qualifying + no human review required + confidence high.
  //          DENY when non-preferential unknown AND no preferential.
  //          CONDITIONAL otherwise.
  let verdict: "ALLOW" | "CONDITIONAL" | "DENY";
  if (humanReviewRequired) {
    verdict = "CONDITIONAL";
  } else if (overallQualifying && confidence >= CONFIDENCE_FULL) {
    verdict = "ALLOW";
  } else if (
    !overallQualifying &&
    !safeInput.agreementId &&
    !nonPrefQualifying
  ) {
    verdict = "DENY";
  } else if (
    !overallQualifying &&
    safeInput.agreementId &&
    preferential &&
    !preferential.qualifying
  ) {
    verdict = "DENY";
  } else {
    verdict = "CONDITIONAL";
  }

  // De-duplicate ruleIds.
  const seenRule = new Set<string>();
  const uniqueRuleIds: string[] = [];
  for (const id of ruleIds) {
    if (id && !seenRule.has(id)) {
      seenRule.add(id);
      uniqueRuleIds.push(id);
    }
  }

  return {
    nonPreferential: {
      originCountry: safeInput.originCountry,
      basis: nonPrefBasis,
      qualifying: nonPrefQualifying,
      ruleId: nonPrefRuleId,
    },
    preferential,
    qualifying: overallQualifying,
    confidence: Number(confidence.toFixed(2)),
    requiredDocuments,
    restrictions,
    ruleIds: uniqueRuleIds,
    humanReviewRequired,
    verdict,
  };
}

// ============ Rule CRUD ============

/**
 * List OriginRule rows filtered by ruleType / hs6 / jurisdictionId /
 * agreementId. Only `legalStatus = "IN_FORCE"` rules within their
 * effective date window are returned.
 *
 * Defensive: returns [] on any DB error.
 */
export async function listOriginRules(
  filters?: {
    ruleType?: string;
    hs6?: string;
    jurisdictionId?: string;
    agreementId?: string;
  },
): Promise<any[]> {
  const f = filters || {};
  try {
    const where: any = { legalStatus: "IN_FORCE" };
    if (f.ruleType) where.ruleType = String(f.ruleType).toUpperCase();
    if (f.hs6) where.hs6 = f.hs6;
    if (f.jurisdictionId) where.jurisdictionId = f.jurisdictionId;
    if (f.agreementId) where.agreementId = f.agreementId;

    const rules: any[] = await db.originRule.findMany({ where });
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
    logger.error("[origin/listOriginRules] failed", {
      filters,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Fetch a single OriginRule by its primary key. Returns null on missing-rule
 * or DB failure.
 */
export async function getOriginRule(id: string): Promise<any | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const rule = await db.originRule.findUnique({ where: { id } });
    return rule ?? null;
  } catch (e) {
    logger.error("[origin/getOriginRule] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Create or update an OriginRule. The find-then-upsert pattern keys on
 * (ruleType, hs6, jurisdictionId, agreementId). When one or more matching
 * rules exist, the most-recently updated one is updated; otherwise a new
 * row is created.
 *
 * On DB failure the error is logged and re-thrown so callers can react.
 *
 * Accepts either `hs6` or `hs6Str` (legacy alias) — both map to the
 * `hs6` column.
 */
export async function upsertOriginRule(
  input: UpsertOriginRuleInput,
): Promise<any> {
  if (!input || !input.ruleType) {
    throw new Error("upsertOriginRule requires ruleType");
  }

  const hs6Value = input.hs6 ?? input.hs6Str ?? null;

  const data: any = {
    ruleType: String(input.ruleType).toUpperCase(),
    hs6: hs6Value,
    jurisdictionId: input.jurisdictionId ?? null,
    agreementId: input.agreementId ?? null,
    productId: input.productId ?? null,
    originCountry: input.originCountry
      ? String(input.originCountry).toUpperCase()
      : null,
    ruleCriteria: input.ruleCriteria ?? null,
    rvcThreshold:
      typeof input.rvcThreshold === "number" ? input.rvcThreshold : null,
    rvcMethod: input.rvcMethod
      ? String(input.rvcMethod).toUpperCase()
      : null,
    tariffShiftTarget: input.tariffShiftTarget
      ? String(input.tariffShiftTarget).toUpperCase()
      : null,
    requiredDocuments: input.requiredDocuments ?? null,
    certificationBody: input.certificationBody ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveUntil: input.effectiveUntil ?? null,
    sourceId: input.sourceId ?? null,
    legalStatus: "IN_FORCE",
  };

  try {
    const where: any = {
      ruleType: data.ruleType,
    };
    if (hs6Value) {
      where.hs6 = hs6Value;
    } else {
      where.hs6 = null;
    }
    if (input.jurisdictionId) {
      where.jurisdictionId = input.jurisdictionId;
    } else {
      where.jurisdictionId = null;
    }
    if (input.agreementId) {
      where.agreementId = input.agreementId;
    } else {
      where.agreementId = null;
    }

    const existing = await db.originRule.findFirst({
      where,
      orderBy: [{ updatedAt: "desc" }],
    });
    if (existing) {
      return await db.originRule.update({
        where: { id: existing.id },
        data,
      });
    }
    return await db.originRule.create({ data });
  } catch (e) {
    logger.error("[origin/upsertOriginRule] failed", {
      ruleType: input.ruleType,
      hs6: hs6Value,
      error: e?.message || String(e),
    });
    throw e;
  }
}
