// @ts-nocheck
// SGTX Phase 2 — REGULATORY_PRODUCT_RESULT orchestrator (Blueprint §6 OUTPUT)
// ---------------------------------------------------------------------------
// For every trade request this module generates a single
// `RegulatoryProductResult` envelope containing the unified output of the four
// Phase 2 engines (classification, tariff, origin, trade-agreement) plus the
// derived documents / licenses / permits / certificates / restrictions
// lists that downstream portals (Customs Broker, Government, Trader) consume.
//
// Design rules (Blueprint §6 + Phase 2 spec):
//   • Never throws — on any sub-engine failure the corresponding section is
//     degraded to an `{ error: message }` object and the rest of the
//     envelope continues to be assembled. The orchestrator logs every
//     degradation via the SGTX logger.
//   • Every DB call is wrapped in try/catch — a persistence failure never
//     breaks the synchronous return of the assembled result.
//   • The four engines are independent — a tariff failure does NOT block
//     origin determination.
//   • Verdict aggregation: BLOCK restriction => DENY; otherwise WARN or
//     low confidence or human-review flag => CONDITIONAL; else ALLOW.
//
// This module is NON-MARKETPLACE: it never produces a score, ranking, or
// counterparty recommendation. It answers the regulatory question "what is
// this product, what duties apply, where is it from, and what paperwork is
// required?" — nothing more.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { classifyProduct, getProductProfile } from "@/lib/sgtx/classification";
import {
  computeTariff,
  isPreferentialEligible,
} from "@/lib/sgtx/tariff";
import { determineOrigin } from "@/lib/sgtx/origin";
import type { MaterialInput } from "@/lib/sgtx/origin";
import {
  getTradeAgreement,
  getActiveAgreementsBetween,
  isAgreementEffective,
} from "@/lib/sgtx/trade-agreement";

// ============ Exported types ============

export interface RegulatoryProductInput {
  // Identification
  ustn?: string;
  tradeId?: string;
  // Product
  productName?: string;
  hs6?: string;
  composition?: string;
  material?: string;
  casNumbers?: string[];
  // Trade
  jurisdictionCode: string; // importing country (JurisdictionFabric.code)
  originCountry: string; // ISO alpha-2
  customsValueUsd: number;
  quantity?: number;
  netWeightKg?: number;
  // Optional inputs
  agreementId?: string; // explicit FTA claim
  claimPreferential?: boolean; // whether to attempt preferential origin
  materials?: MaterialInput[]; // BOM for origin determination
  shippingTransshipment?: boolean;
  exporterApproved?: boolean;
  effectiveDate?: Date;
}

export interface RegulatoryProductResult {
  ustn?: string;
  tradeId?: string;
  productId?: string;
  classification: any; // ClassifyResult | { error }
  tariff: any; // TariffResult | { error }
  origin: any; // OriginResult | { error }
  preferentialEligibility: {
    claimed: boolean;
    eligible: boolean;
    agreementId?: string;
    preferentialRate?: number;
    mfnRate?: number;
    savings?: number;
    reason: string;
  };
  documents: Array<{ type: string; description: string; mandatory: boolean }>;
  licenses: Array<{ type: string; description: string; jurisdictionCode?: string }>;
  permits: Array<{ type: string; description: string; issuingAuthority?: string }>;
  certificates: Array<{ type: string; description: string; certificationBody?: string }>;
  restrictions: Array<{
    type: string;
    severity: "INFO" | "WARN" | "BLOCK";
    description: string;
  }>;
  overallConfidence: number;
  verdict: "ALLOW" | "CONDITIONAL" | "DENY";
  humanReviewRequired: boolean;
  generatedAt: string;
  generatedBy: string;
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

/** Clamp a number into [lo, hi]. */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Upper-case a country code safely. */
function upper(s: string | undefined | null): string {
  return typeof s === "string" ? s.toUpperCase() : "";
}

/** Read a JSON profile field as a parsed object (or undefined). */
function profileField(profile: any, name: string): any | undefined {
  if (!profile) return undefined;
  const raw = profile[name];
  if (raw == null) return undefined;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return safeJsonParse<any>(raw, undefined) ?? undefined;
}

/**
 * Resolve a trade agreement id to use for the preferential claim.
 *
 * Resolution rules (Blueprint §6 step 2):
 *   1. If the caller passed an explicit `agreementId`, verify it via
 *      `getTradeAgreement`. If verification fails (or DB error), drop it.
 *   2. Otherwise, if the caller asked for preferential (`claimPreferential`),
 *      enumerate active agreements between origin and jurisdiction and pick
 *      the first one that `isAgreementEffective` at the effective date.
 *   3. Otherwise return undefined.
 */
async function resolveAgreementId(input: RegulatoryProductInput): Promise<string | undefined> {
  const asOf = input.effectiveDate || new Date();

  // Case 1: explicit agreementId provided — verify it.
  if (input.agreementId) {
    try {
      const ag = await getTradeAgreement(input.agreementId);
      if (ag && isAgreementEffective(ag, asOf)) {
        return input.agreementId;
      }
      logger.warn("[regulatory-product/resolveAgreementId] explicit agreementId not effective", {
        agreementId: input.agreementId,
      });
      return undefined;
    } catch (e) {
      logger.error("[regulatory-product/resolveAgreementId] verify failed", {
        agreementId: input.agreementId,
        error: e?.message || String(e),
      });
      return undefined;
    }
  }

  // Case 2: preferential claimed without explicit agreement — lookup.
  if (input.claimPreferential) {
    try {
      const agreements = await getActiveAgreementsBetween(
        upper(input.originCountry),
        upper(input.jurisdictionCode),
      );
      const effective = (agreements || []).find((a) =>
        isAgreementEffective(a, asOf),
      );
      if (effective?.id) {
        return effective.id;
      }
      logger.warn("[regulatory-product/resolveAgreementId] no effective agreement", {
        origin: upper(input.originCountry),
        jurisdiction: upper(input.jurisdictionCode),
        candidates: (agreements || []).length,
      });
    } catch (e) {
      logger.error("[regulatory-product/resolveAgreementId] lookup failed", {
        error: e?.message || String(e),
      });
    }
  }

  return undefined;
}

/**
 * Build the documents list. Always includes the three mode-agnostic
 * commercial documents (Commercial Invoice, Packing List, Bill of Lading),
 * then derives additional mandatory documents from the origin engine's
 * requiredDocuments list and from the classification family flags.
 */
function buildDocuments(
  origin: any,
  dgClassification: any,
  citesClassification: any,
  pharmaClassification: any,
  agricultureClassification: any,
  foodClassification: any,
): Array<{ type: string; description: string; mandatory: boolean }> {
  const docs: Array<{ type: string; description: string; mandatory: boolean }> = [
    {
      type: "COMMERCIAL_INVOICE",
      description: "Commercial invoice evidencing transaction value",
      mandatory: true,
    },
    {
      type: "PACKING_LIST",
      description: "Packing list detailing contents, weights, and dimensions",
      mandatory: true,
    },
    {
      type: "BILL_OF_LADING",
      description: "Transport document (B/L, AWB, or CMR) evidencing shipment",
      mandatory: true,
    },
  ];

  const originDocs: string[] = Array.isArray(origin?.requiredDocuments)
    ? origin.requiredDocuments.filter((d: any) => typeof d === "string" && d.length > 0)
    : [];
  for (const d of originDocs) {
    docs.push({
      type: String(d).toUpperCase().replace(/[\s\-]+/g, "_"),
      description: String(d),
      mandatory: true,
    });
  }

  if (dgClassification) {
    docs.push({
      type: "DG_DECLARATION",
      description: "Dangerous goods declaration (IMDG / IATA / ADR)",
      mandatory: true,
    });
  }
  if (citesClassification) {
    docs.push({
      type: "CITES_PERMIT",
      description: "CITES import/export permit for listed species",
      mandatory: true,
    });
  }
  if (pharmaClassification) {
    docs.push({
      type: "GMP_CERTIFICATE",
      description: "Good Manufacturing Practice certificate",
      mandatory: true,
    });
  }
  if (agricultureClassification) {
    docs.push({
      type: "PHYTOSANITARY_CERTIFICATE",
      description: "Phytosanitary certificate for plant / plant products",
      mandatory: true,
    });
  }
  if (foodClassification) {
    docs.push({
      type: "HEALTH_CERTIFICATE",
      description: "Health / sanitary certificate for food product",
      mandatory: true,
    });
  }

  // Deduplicate by type — keep first occurrence.
  const seen = new Set<string>();
  return docs.filter((d) => {
    if (seen.has(d.type)) return false;
    seen.add(d.type);
    return true;
  });
}

/**
 * Build the licenses list from the classification family flags that imply a
 * licensing regime (dual-use, strategic goods, chemical/REACH, pharma).
 */
function buildLicenses(
  dualUseClassification: any,
  strategicGoodsClassification: any,
  chemicalClassification: any,
  pharmaClassification: any,
  jurisdictionCode: string,
): Array<{ type: string; description: string; jurisdictionCode?: string }> {
  const out: Array<{ type: string; description: string; jurisdictionCode?: string }> = [];

  if (dualUseClassification) {
    const cl = dualUseClassification.controlList || dualUseClassification.list || "?";
    const entry = dualUseClassification.entry || "?";
    out.push({
      type: "EXPORT_CONTROL_LICENSE",
      description: `Export control license for dual-use goods (${cl}/${entry})`,
      jurisdictionCode,
    });
  }
  if (strategicGoodsClassification) {
    const regime = strategicGoodsClassification.controlRegime || strategicGoodsClassification.regime || "?";
    out.push({
      type: "STRATEGIC_GOODS_LICENSE",
      description: `Strategic goods license (${regime})`,
      jurisdictionCode,
    });
  }
  if (chemicalClassification) {
    out.push({
      type: "CHEMICAL_REGISTRATION",
      description: "REACH / chemical registration (or local equivalent)",
      jurisdictionCode,
    });
  }
  if (pharmaClassification) {
    out.push({
      type: "PHARMA_IMPORT_LICENSE",
      description: "Import license for pharmaceutical / controlled substance",
      jurisdictionCode,
    });
  }
  return out;
}

/**
 * Build the permits list from the classification family flags that imply a
 * transport / import permit (CITES, DG, agriculture).
 */
function buildPermits(
  citesClassification: any,
  dgClassification: any,
  agricultureClassification: any,
): Array<{ type: string; description: string; issuingAuthority?: string }> {
  const out: Array<{ type: string; description: string; issuingAuthority?: string }> = [];

  if (citesClassification) {
    out.push({
      type: "CITES_IMPORT_PERMIT",
      description: "CITES import permit (importing country Management Authority)",
      issuingAuthority:
        citesClassification.importAuthority || "CITES Management Authority (importing)",
    });
    out.push({
      type: "CITES_EXPORT_PERMIT",
      description: "CITES export permit (exporting country Management Authority)",
      issuingAuthority:
        citesClassification.exportAuthority || "CITES Management Authority (exporting)",
    });
  }
  if (dgClassification) {
    out.push({
      type: "DG_TRANSPORT_PERMIT",
      description: "Dangerous goods transport permit",
      issuingAuthority: dgClassification.authority || "Competent DG authority",
    });
  }
  if (agricultureClassification) {
    out.push({
      type: "PLANT_IMPORT_PERMIT",
      description: "Plant / plant-product import permit",
      issuingAuthority:
        agricultureClassification.authority || "Plant Protection Authority",
    });
  }
  return out;
}

/** Tokens that identify a required-document entry as a "certificate" type. */
const CERTIFICATE_KEYWORDS = [
  "CERTIFICATE",
  "FORM A",
  "FORM-A",
  "EUR.",
  "EUR1",
  "EUR.1",
  "GMP",
  "HALAL",
  "KOSHER",
  "COO",
];

/**
 * Build the certificates list. Sources:
 *   • origin.requiredDocuments entries that match certificate keywords
 *     (Certificate of Origin Form A, EUR.1, ...).
 *   • explicit certificate-type classifications present on the profile
 *     (GMP, halal, kosher).
 */
function buildCertificates(
  origin: any,
  pharmaClassification: any,
  halalClassification: any,
  kosherClassification: any,
): Array<{ type: string; description: string; certificationBody?: string }> {
  const out: Array<{ type: string; description: string; certificationBody?: string }> = [];
  const seen = new Set<string>();

  const originDocs: string[] = Array.isArray(origin?.requiredDocuments)
    ? origin.requiredDocuments.filter((d: any) => typeof d === "string" && d.length > 0)
    : [];
  for (const d of originDocs) {
    const upper = String(d).toUpperCase();
    if (!CERTIFICATE_KEYWORDS.some((k) => upper.includes(k))) continue;
    const type = upper.replace(/[\s\-]+/g, "_");
    if (seen.has(type)) continue;
    seen.add(type);
    out.push({ type, description: String(d), certificationBody: undefined });
  }

  if (pharmaClassification && !seen.has("GMP_CERTIFICATE")) {
    seen.add("GMP_CERTIFICATE");
    out.push({
      type: "GMP_CERTIFICATE",
      description: "Good Manufacturing Practice certificate",
      certificationBody: pharmaClassification.certificationBody,
    });
  }
  if (halalClassification && !seen.has("HALAL_CERTIFICATE")) {
    seen.add("HALAL_CERTIFICATE");
    out.push({
      type: "HALAL_CERTIFICATE",
      description: "Halal certification",
      certificationBody: halalClassification.certificationBody || "Recognized halal certification body",
    });
  }
  if (kosherClassification && !seen.has("KOSHER_CERTIFICATE")) {
    seen.add("KOSHER_CERTIFICATE");
    out.push({
      type: "KOSHER_CERTIFICATE",
      description: "Kosher certification",
      certificationBody: kosherClassification.certificationBody || "Recognized kosher certification body",
    });
  }
  return out;
}

/**
 * Classify the CITES appendix string ("I" / "II" / "III" / "APPENDIX_I" / ...)
 * into one of "I" / "II" / "III" / undefined. Defensive against malformed
 * input.
 */
function citesAppendix(citesClassification: any): string | undefined {
  if (!citesClassification) return undefined;
  const raw = String(
    citesClassification.appendix ??
      citesClassification.listing ??
      citesClassification.level ??
      citesClassification.appendixLevel ??
      "",
  )
    .toUpperCase()
    .trim();
  if (!raw) return undefined;
  // Strip non-essential tokens.
  const cleaned = raw.replace(/APPENDIX[\s_]*/g, "").trim();
  if (cleaned === "I" || cleaned === "1") return "I";
  if (cleaned === "II" || cleaned === "2") return "II";
  if (cleaned === "III" || cleaned === "3") return "III";
  return undefined;
}

/**
 * Build the restrictions list. The restrictions array drives the verdict
 * aggregation downstream (BLOCK => DENY, WARN => CONDITIONAL).
 */
function buildRestrictions(
  tariff: any,
  preferentialEligibility: RegulatoryProductResult["preferentialEligibility"],
  citesClassification: any,
  dualUseClassification: any,
  pharmaClassification: any,
  certificates: Array<{ type: string }>,
  exporterApproved: boolean,
): Array<{
  type: string;
  severity: "INFO" | "WARN" | "BLOCK";
  description: string;
}> {
  const out: Array<{
    type: string;
    severity: "INFO" | "WARN" | "BLOCK";
    description: string;
  }> = [];

  // Quota exhausted.
  const quota = tariff?.quotaStatus;
  if (quota && quota.wouldExceed === true) {
    out.push({
      type: "QUOTA_EXHAUSTED",
      severity: "WARN",
      description: `Quota would be exceeded — remaining ${quota.quotaRemaining ?? "?"} ${quota.quotaUnit || ""}`.trim(),
    });
  }

  // Anti-dumping / countervailing duty applies.
  const lines: any[] = Array.isArray(tariff?.lines) ? tariff.lines : [];
  const hasAD = lines.some((l) => {
    const t = String(l?.tariffType || "").toUpperCase();
    return (
      t.includes("ANTI_DUMPING") ||
      t.includes("ANTIDUMPING") ||
      t === "AD" ||
      t === "AD_CVD" ||
      t === "CVD"
    );
  });
  if (hasAD) {
    out.push({
      type: "ANTI_DUMPING_DUTY",
      severity: "INFO",
      description: "Anti-dumping / countervailing duty applies to this product",
    });
  }

  // Preferential claimed but not qualifying.
  if (preferentialEligibility.claimed && !preferentialEligibility.eligible) {
    out.push({
      type: "PREFERENTIAL_NOT_QUALIFYING",
      severity: "WARN",
      description: `Preferential origin claimed but not qualifying — MFN rate applies. Reason: ${preferentialEligibility.reason}`,
    });
  }

  // CITES Appendix I — commercial trade prohibited.
  const appendix = citesAppendix(citesClassification);
  if (citesClassification && appendix === "I") {
    out.push({
      type: "CITES_APPENDIX_I",
      severity: "BLOCK",
      description:
        "CITES Appendix I species — commercial international trade prohibited",
    });
  }

  // Dual-use goods without a verified license.
  // (exporterApproved is the closest proxy available for "license present"
  //  in the current input — see Phase 1 G1U4 dualUseCheck.licensePresent.)
  if (dualUseClassification && !exporterApproved) {
    out.push({
      type: "DUAL_USE_NO_LICENSE",
      severity: "BLOCK",
      description:
        "Dual-use goods flagged without verified export license — exporter approval required",
    });
  }

  // Pharmaceutical without GMP certificate.
  const hasGmp = certificates.some((c) => c.type === "GMP_CERTIFICATE");
  if (pharmaClassification && !hasGmp) {
    out.push({
      type: "PHARMA_NO_GMP",
      severity: "BLOCK",
      description: "Pharmaceutical product without GMP certificate — import blocked",
    });
  }

  return out;
}

/**
 * Persist a RegulatoryProductResult row. Defensive — never throws.
 * Returns the row id on success, or null on failure (caller continues
 * regardless).
 */
export async function persistResult(
  result: RegulatoryProductResult,
): Promise<string | null> {
  try {
    const row = await db.regulatoryProductResult.create({
      data: {
        ustn: result.ustn || null,
        tradeId: result.tradeId || null,
        productId: result.productId || null,
        classification: JSON.stringify(result.classification ?? {}),
        tariff: JSON.stringify(result.tariff ?? {}),
        origin: JSON.stringify(result.origin ?? {}),
        preferentialEligibility: JSON.stringify(result.preferentialEligibility ?? {}),
        documents: JSON.stringify(result.documents ?? []),
        licenses: JSON.stringify(result.licenses ?? []),
        permits: JSON.stringify(result.permits ?? []),
        certificates: JSON.stringify(result.certificates ?? []),
        restrictions: JSON.stringify(result.restrictions ?? []),
        overallConfidence: result.overallConfidence,
        verdict: result.verdict,
        humanReviewRequired: result.humanReviewRequired,
        generatedBy: result.generatedBy,
      },
    });
    return row?.id ?? null;
  } catch (e) {
    logger.error("[regulatory-product/persistResult] persistence failed", {
      ustn: result.ustn,
      tradeId: result.tradeId,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Fetch the most recent RegulatoryProductResult row for a given USTN. Returns
 * null when no row exists or DB lookup fails. Defensive — never throws.
 */
export async function getResult(
  ustn: string,
): Promise<RegulatoryProductResult | null> {
  if (!ustn || typeof ustn !== "string") return null;
  try {
    const row = await db.regulatoryProductResult.findFirst({
      where: { ustn },
      orderBy: { generatedAt: "desc" },
    });
    if (!row) return null;
    return {
      ustn: row.ustn || undefined,
      tradeId: row.tradeId || undefined,
      productId: row.productId || undefined,
      classification: safeJsonParse(row.classification, {}),
      tariff: safeJsonParse(row.tariff, {}),
      origin: safeJsonParse(row.origin, {}),
      preferentialEligibility: safeJsonParse(row.preferentialEligibility, {
        claimed: false,
        eligible: false,
        reason: "not loaded",
      }),
      documents: safeJsonParse(row.documents, []),
      licenses: safeJsonParse(row.licenses, []),
      permits: safeJsonParse(row.permits, []),
      certificates: safeJsonParse(row.certificates, []),
      restrictions: safeJsonParse(row.restrictions, []),
      overallConfidence:
        typeof row.overallConfidence === "number" ? row.overallConfidence : 0,
      verdict: (row.verdict as RegulatoryProductResult["verdict"]) || "CONDITIONAL",
      humanReviewRequired: row.humanReviewRequired === true,
      generatedAt: row.generatedAt
        ? new Date(row.generatedAt).toISOString()
        : new Date().toISOString(),
      generatedBy: row.generatedBy || "phase2-v1",
    };
  } catch (e) {
    logger.error("[regulatory-product/getResult] fetch failed", {
      ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Public entry: generateRegulatoryProductResult ============

/**
 * Generate a full REGULATORY_PRODUCT_RESULT envelope for a trade request.
 *
 * Pipeline (Blueprint §6):
 *   1. classifyProduct() → hs6, nationalCode, dualUse, strategic, confidence.
 *   2. Resolve the trade agreement id (explicit / preferential lookup).
 *   3. computeTariff() → duty lines, total, applied rate, confidence.
 *   4. determineOrigin() → non-preferential basis + (optional) preferential
 *      qualifying, required documents.
 *   5. isPreferentialEligible() → final preferential verdict + savings.
 *   6-10. Derive documents / licenses / permits / certificates / restrictions.
 *   11. overallConfidence = min(classification, tariff, origin) clamped [0,1].
 *   12. verdict: BLOCK => DENY ; WARN/low-confidence/human-review => CONDITIONAL
 *        ; else ALLOW.
 *   13. humanReviewRequired = verdict != ALLOW.
 *   14. Persist (defensive — never throws).
 *   15. Return assembled envelope.
 *
 * This function NEVER throws — every sub-engine failure is captured into a
 * degraded section object (`{ error: message }`) and the rest of the envelope
 * continues to be assembled.
 */
export async function generateRegulatoryProductResult(
  input: RegulatoryProductInput,
): Promise<RegulatoryProductResult> {
  const safeInput: RegulatoryProductInput =
    input && typeof input === "object" ? input : ({} as RegulatoryProductInput);
  const generatedAt = new Date().toISOString();

  // ----- Step 1: Classification -----
  let classification: any = {
    hs6: safeInput.hs6 || "",
    confidence: 0,
    verdict: "CONDITIONAL",
    humanReviewRequired: true,
    legalReferences: [],
    ruleIds: [],
    error: "not run",
  };
  let productId: string | undefined;
  try {
    classification = await classifyProduct({
      productName: safeInput.productName,
      hs6: safeInput.hs6,
      composition: safeInput.composition,
      material: safeInput.material,
      casNumbers: safeInput.casNumbers,
      jurisdictionCode: safeInput.jurisdictionCode,
    });
    if (classification?.productId) productId = classification.productId;
  } catch (e) {
    logger.error("[regulatory-product] classification failed", {
      hs6: safeInput.hs6,
      error: e?.message || String(e),
    });
    classification = {
      hs6: safeInput.hs6 || "",
      confidence: 0,
      verdict: "CONDITIONAL",
      humanReviewRequired: true,
      legalReferences: [],
      ruleIds: [],
      error: e?.message || "classification failed",
    };
  }

  // ----- Fetch the ProductRegulatoryProfile for the classification-family
  // JSON fields (dgClassification, citesClassification, etc.). classifyProduct
  // returns only the structured dualUse + strategic objects; the family fields
  // live on the profile JSON. -----
  let profile: any = null;
  const hs6ForLookup = classification?.hs6 || safeInput.hs6;
  if (hs6ForLookup) {
    try {
      profile = await getProductProfile(hs6ForLookup);
      if (profile?.id && !productId) productId = profile.id;
    } catch (e) {
      logger.error("[regulatory-product] profile fetch failed", {
        hs6: hs6ForLookup,
        error: e?.message || String(e),
      });
    }
  }

  // Resolve classification family fields from either the structured
  // classification result (preferred) or the profile JSON (fallback).
  const dualUseClassification =
    classification?.dualUse || profileField(profile, "dualUseClassification");
  const strategicGoodsClassification =
    classification?.strategic ||
    profileField(profile, "strategicGoodsClassification");
  const dgClassification = profileField(profile, "dgClassification");
  const citesClassification = profileField(profile, "citesClassification");
  const pharmaClassification = profileField(profile, "pharmaClassification");
  const agricultureClassification = profileField(profile, "agricultureClassification");
  const foodClassification = profileField(profile, "foodClassification");
  const chemicalClassification = profileField(profile, "chemicalClassification");
  const halalClassification = profileField(profile, "halalClassification");
  const kosherClassification = profileField(profile, "kosherClassification");

  // ----- Step 2: Trade agreement resolution -----
  let resolvedAgreementId: string | undefined;
  try {
    resolvedAgreementId = await resolveAgreementId(safeInput);
  } catch (e) {
    logger.error("[regulatory-product] agreement resolution failed", {
      error: e?.message || String(e),
    });
  }

  // ----- Step 3: Tariff -----
  let tariff: any = {
    hs6: classification?.hs6 || safeInput.hs6 || "",
    lines: [],
    totalDutyUsd: undefined,
    confidence: 0,
    notes: [],
    sourceIds: [],
    error: "not run",
  };
  try {
    tariff = await computeTariff({
      hs6: classification?.hs6 || safeInput.hs6 || "",
      hsCode: classification?.nationalCode,
      jurisdictionCode: safeInput.jurisdictionCode,
      originCountry: safeInput.originCountry,
      customsValueUsd: safeInput.customsValueUsd,
      quantity: safeInput.quantity,
      netWeightKg: safeInput.netWeightKg,
      agreementId: resolvedAgreementId,
      effectiveDate: safeInput.effectiveDate,
    });
  } catch (e) {
    logger.error("[regulatory-product] tariff computation failed", {
      hs6: classification?.hs6,
      error: e?.message || String(e),
    });
    tariff = {
      hs6: classification?.hs6 || safeInput.hs6 || "",
      lines: [],
      totalDutyUsd: undefined,
      confidence: 0,
      notes: [],
      sourceIds: [],
      error: e?.message || "tariff computation failed",
    };
  }

  // ----- Step 4: Origin -----
  // Compute nonOriginValueUsd from materials whose originCountry != the
  // shipped product's originCountry (case-insensitive).
  const materials = Array.isArray(safeInput.materials) ? safeInput.materials : [];
  const originUpper = upper(safeInput.originCountry);
  let nonOriginValueUsd = 0;
  for (const m of materials) {
    if (!m || typeof m !== "object") continue;
    if (upper(m.originCountry) !== originUpper) {
      nonOriginValueUsd += typeof m.valueUsd === "number" ? m.valueUsd : 0;
    }
  }

  let origin: any = {
    nonPreferential: {
      originCountry: safeInput.originCountry,
      basis: "unknown",
      qualifying: false,
    },
    qualifying: false,
    confidence: 0,
    requiredDocuments: [],
    restrictions: [],
    ruleIds: [],
    humanReviewRequired: true,
    verdict: "CONDITIONAL",
    error: "not run",
  };
  try {
    origin = await determineOrigin({
      hs6: classification?.hs6 || safeInput.hs6 || "",
      originCountry: safeInput.originCountry,
      jurisdictionCode: safeInput.jurisdictionCode,
      agreementId: resolvedAgreementId,
      materials,
      transactionValueUsd: safeInput.customsValueUsd,
      nonOriginValueUsd,
      shippingTransshipment: safeInput.shippingTransshipment,
      exporterApproved: safeInput.exporterApproved,
    });
  } catch (e) {
    logger.error("[regulatory-product] origin determination failed", {
      hs6: classification?.hs6,
      error: e?.message || String(e),
    });
    origin = {
      nonPreferential: {
        originCountry: safeInput.originCountry,
        basis: "unknown",
        qualifying: false,
      },
      qualifying: false,
      confidence: 0,
      requiredDocuments: [],
      restrictions: [],
      ruleIds: [],
      humanReviewRequired: true,
      verdict: "CONDITIONAL",
      error: e?.message || "origin determination failed",
    };
  }

  // ----- Step 5: Preferential eligibility -----
  const claimed = safeInput.claimPreferential === true || !!safeInput.agreementId;
  let preferentialEligibility: RegulatoryProductResult["preferentialEligibility"] = {
    claimed,
    eligible: false,
    agreementId: resolvedAgreementId,
    mfnRate: typeof tariff?.mfnRate === "number" ? tariff.mfnRate : undefined,
    reason: "not evaluated",
  };

  if (resolvedAgreementId) {
    try {
      const pe = await isPreferentialEligible({
        hs6: classification?.hs6 || safeInput.hs6 || "",
        originCountry: safeInput.originCountry,
        jurisdictionCode: safeInput.jurisdictionCode,
        agreementId: resolvedAgreementId,
      });
      preferentialEligibility = {
        claimed: true,
        eligible: pe?.eligible === true,
        agreementId: resolvedAgreementId,
        preferentialRate:
          typeof pe?.preferentialRate === "number" ? pe.preferentialRate : undefined,
        mfnRate:
          typeof pe?.mfnRate === "number"
            ? pe.mfnRate
            : typeof tariff?.mfnRate === "number"
              ? tariff.mfnRate
              : undefined,
        savings: typeof pe?.savings === "number" ? pe.savings : undefined,
        reason: pe?.reason || "evaluated",
      };
    } catch (e) {
      logger.error("[regulatory-product] preferential eligibility failed", {
        agreementId: resolvedAgreementId,
        error: e?.message || String(e),
      });
      preferentialEligibility.reason =
        e?.message || "preferential eligibility check failed";
    }
  } else if (claimed) {
    preferentialEligibility.reason =
      "preferential claimed but no active agreement found between origin and jurisdiction";
  } else {
    preferentialEligibility.reason = "preferential not claimed — MFN applies";
  }

  // ----- Steps 6-9: Derive documents / licenses / permits / certificates -----
  const documents = buildDocuments(
    origin,
    dgClassification,
    citesClassification,
    pharmaClassification,
    agricultureClassification,
    foodClassification,
  );
  const licenses = buildLicenses(
    dualUseClassification,
    strategicGoodsClassification,
    chemicalClassification,
    pharmaClassification,
    safeInput.jurisdictionCode,
  );
  const permits = buildPermits(citesClassification, dgClassification, agricultureClassification);
  const certificates = buildCertificates(
    origin,
    pharmaClassification,
    halalClassification,
    kosherClassification,
  );

  // ----- Step 10: Restrictions -----
  const restrictions = buildRestrictions(
    tariff,
    preferentialEligibility,
    citesClassification,
    dualUseClassification,
    pharmaClassification,
    certificates,
    safeInput.exporterApproved === true,
  );

  // ----- Step 11: Overall confidence -----
  const classificationConf =
    typeof classification?.confidence === "number" ? classification.confidence : 0;
  const tariffConf = typeof tariff?.confidence === "number" ? tariff.confidence : 0;
  const originConf = typeof origin?.confidence === "number" ? origin.confidence : 0;
  const overallConfidence = clamp(
    Math.min(classificationConf, tariffConf, originConf),
    0,
    1,
  );

  // ----- Step 12: Verdict -----
  let verdict: "ALLOW" | "CONDITIONAL" | "DENY" = "ALLOW";
  if (restrictions.some((r) => r.severity === "BLOCK")) {
    verdict = "DENY";
  } else if (
    overallConfidence < 0.85 ||
    restrictions.some((r) => r.severity === "WARN") ||
    classification?.humanReviewRequired === true ||
    origin?.humanReviewRequired === true
  ) {
    verdict = "CONDITIONAL";
  }

  // ----- Step 13: humanReviewRequired -----
  const humanReviewRequired = verdict === "CONDITIONAL" || verdict === "DENY";

  // ----- Assemble result -----
  const result: RegulatoryProductResult = {
    ustn: safeInput.ustn,
    tradeId: safeInput.tradeId,
    productId,
    classification,
    tariff,
    origin,
    preferentialEligibility,
    documents,
    licenses,
    permits,
    certificates,
    restrictions,
    overallConfidence,
    verdict,
    humanReviewRequired,
    generatedAt,
    generatedBy: "phase2-v1",
  };

  // ----- Step 14: Persist (defensive — never throws) -----
  try {
    const id = await persistResult(result);
    if (id) {
      logger.debug("[regulatory-product] persisted", {
        id,
        ustn: result.ustn,
        verdict,
        overallConfidence,
      });
    }
  } catch (e) {
    // Defensive — persistResult already swallows errors, but be extra safe.
    logger.error("[regulatory-product] persistResult threw unexpectedly", {
      error: e?.message || String(e),
    });
  }

  // ----- Step 15: Return -----
  return result;
}
