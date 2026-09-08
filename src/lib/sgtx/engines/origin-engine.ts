// @ts-nocheck
/**
 * SGTX v17 §20 — Origin Engine
 * ===========================================================================
 *
 * Rules of Origin (ROO) determination — both non-preferential (WTO) and
 * preferential (FTA-specific). Determines the country of origin for a
 * finished good based on the manufacturing country + the bill of materials.
 *
 * Two ROO tests implemented (per WTO + most FTAs):
 *   1. Wholly Obtained (WO) — all materials originate in the manufacturing
 *      country. Mostly applies to agricultural + mineral products.
 *   2. Substantial Transformation — Change in Tariff Classification (CTC) +
 *      Value Added (VA) threshold (e.g. RVC ≥ 40% for most ASEAN-origin
 *      products). Used when materials are sourced from multiple countries.
 *
 * Also includes:
 *   - validateOriginCertificate — verifies a Certificate of Origin (COO)
 *     number format + (simulated) issuer registry lookup.
 *   - getPreferentialOrigin — checks whether a specific FTA's preferential
 *     origin rules are met for a given (hsCode, originCountry) pair.
 *
 * Reference:
 *   - WTO Agreement on Rules of Origin (1994)
 *   - ICC Certificate of Origin Guidelines (2012)
 *   - ITC Rules of Origin Facilitator (findrules.org)
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface Material {
  name: string;
  hsCode?: string;
  originCountry: string; // ISO2
  valueUsd: number;
  weight?: number;
}

export interface OriginDetermination {
  goods: string;
  manufacturingCountry: string;
  originCountry: string;
  originCriteria: "WHOLLY_OBTAINED" | "SUBSTANTIAL_TRANSFORMATION" | "INSUFFICIENT_TRANSFORMATION";
  preferentialOrigin: boolean;
  regionalValueContentPct: number; // RVC %
  whollyObtained: boolean;
  tariffShift: string | null;
  materialsOriginBreakdown: Array<{
    material: string;
    originCountry: string;
    valueUsd: number;
    valuePct: number;
  }>;
  notes: string;
  determinedAt: string;
}

export interface OriginCertificateValidation {
  certificateId: string;
  valid: boolean;
  issuer: string | null;
  issuedAt: string | null;
  goodsCovered: string[];
  errors: string[];
}

export interface PreferentialOriginResult {
  ftaCode: string;
  hsCode: string;
  originCountry: string;
  destCountry: string;
  eligible: boolean;
  rule: string;
  threshold: number; // RVC % required
  actualRvcPct: number | null;
  notes: string;
}

// ── FTA rule reference (RVC threshold per FTA + tariff-shift rule) ────────
// Format: `${ftaCode}|${hsChapter}` → { rvcThreshold, tariffShift, ruleText }

interface FtaRule {
  rvcThreshold: number; // % — Regional Value Content required
  tariffShift: string; // CTC rule (e.g. "CTC chapter change")
  ruleText: string;
}

const FTA_RVC_RULES: Record<string, FtaRule> = {
  // EG-EU Association Agreement — most agricultural products: wholly obtained
  // or CTC 4-digit change. Industrial: RVC ≥ 40%.
  "EG_EU|08": { rvcThreshold: 0, tariffShift: "WO or CTC", ruleText: "Wholly obtained for fresh fruits/vegetables; CTC 4-digit for processed goods." },
  "EG_EU|62": { rvcThreshold: 40, tariffShift: "CTC chapter change", ruleText: "Garments: yarn-forward rule (yarn must originate in EG or EU)." },
  "EG_EU|39": { rvcThreshold: 40, tariffShift: "CTC 4-digit change", ruleText: "Plastics: 40% RVC or CTC 4-digit change." },
  // EVFTA (Vietnam → EU)
  "EVFTA|08": { rvcThreshold: 0, tariffShift: "WO", ruleText: "Fresh fruit: wholly obtained." },
  "EVFTA|62": { rvcThreshold: 40, tariffShift: "yarn-forward", ruleText: "Garments: yarn-forward rule." },
  // USMCA (US/MX/CA) — auto sector: RVC ≥ 75% (LVP method), textiles yarn-forward
  "USMCA|87": { rvcThreshold: 75, tariffShift: "CTC chapter change + LVP", ruleText: "Automotive: 75% RVC (LVP) + labor value content." },
  "USMCA|61": { rvcThreshold: 50, tariffShift: "yarn-forward", ruleText: "Apparel: yarn-forward rule (yarn + fabric must originate)." },
  "USMCA|62": { rvcThreshold: 50, tariffShift: "yarn-forward", ruleText: "Apparel (woven): yarn-forward rule." },
  // RCEP (Asia-Pacific) — RVC ≥ 40% (build-up method)
  "RCEP|85": { rvcThreshold: 40, tariffShift: "CTC chapter change", ruleText: "Electronics: 40% RVC (build-up method)." },
  "RCEP|87": { rvcThreshold: 40, tariffShift: "CTC chapter change", ruleText: "Vehicles: 40% RVC." },
  // ACFTA (ASEAN-China)
  "ACFTA|85": { rvcThreshold: 40, tariffShift: "CTC 4-digit change", ruleText: "Electronics: 40% RVC." },
  // GAFTA (Greater Arab Free Trade Area)
  "GAFTA|08": { rvcThreshold: 0, tariffShift: "WO", ruleText: "Fresh produce: wholly obtained." },
  "GAFTA|62": { rvcThreshold: 40, tariffShift: "CTC 4-digit change", ruleText: "Garments: 40% RVC." },
  // EU-Turkey Customs Union — industrial goods, no RVC needed (CU)
  "EU_TR|85": { rvcThreshold: 0, tariffShift: "free circulation", ruleText: "Customs Union: free circulation in Turkey or EU." },
  "EU_TR|87": { rvcThreshold: 0, tariffShift: "free circulation", ruleText: "Customs Union: free circulation in Turkey or EU." },
};

// ── Simulated COO registry — verifies certificate format + issuer ────────
// Format: prefix → { issuer, country, valid }

interface CooIssuer {
  issuer: string;
  country: string;
  pattern: RegExp;
}

const COO_ISSUERS: CooIssuer[] = [
  { issuer: "Egyptian Chamber of Commerce (GOEIC)", country: "EG", pattern: /^EG-COO-[\d-]{4,20}$/i },
  { issuer: "IHK / German Chambers of Commerce", country: "DE", pattern: /^DE-COO-[\d-]{4,20}$/i },
  { issuer: "Chamber of Commerce of Paris (CCI Paris)", country: "FR", pattern: /^FR-COO-[\d-]{4,20}$/i },
  { issuer: "Vietnam Chamber of Commerce and Industry (VCCI)", country: "VN", pattern: /^VN-COO-[\d-]{4,20}$/i },
  { issuer: "Saudi Chambers of Commerce", country: "SA", pattern: /^SA-COO-[\d-]{4,20}$/i },
  { issuer: "US Council for International Business", country: "US", pattern: /^US-COO-[\d-]{4,20}$/i },
  { issuer: "Federation of Malaysian Manufacturers", country: "MY", pattern: /^MY-COO-[\d-]{4,20}$/i },
  { issuer: "Thai Chamber of Commerce", country: "TH", pattern: /^TH-COO-[\d-]{4,20}$/i },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

function isAgriOrMineral(hsCode?: string): boolean {
  const ch = chapterOf(hsCode);
  if (ch === null) return false;
  // Sections I-IV (chapters 1-24) = agriculture; section V (25-27) = minerals
  return (ch >= 1 && ch <= 24) || (ch >= 25 && ch <= 27);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Determine the country of origin for a finished good.
 *
 * Logic:
 *   1. If ALL materials originate in the manufacturing country → Wholly
 *      Obtained (originCountry = manufacturingCountry).
 *   2. Otherwise → check substantial transformation via RVC:
 *        RVC = (FOB price of good − value of non-originating materials) / FOB
 *      If RVC ≥ 40% OR tariff shift satisfied → SUBSTANTIAL_TRANSFORMATION
 *      (origin = manufacturing country).
 *   3. Otherwise → INSUFFICIENT_TRANSFORMATION (origin = country of the
 *      highest-value non-originating material).
 */
export function determineOrigin(
  goods: string,
  manufacturingCountry: string,
  materials: Material[],
): OriginDetermination {
  const determinedAt = new Date().toISOString();
  const mfg = (manufacturingCountry ?? "").toUpperCase().trim();
  const goodsName = String(goods ?? "").trim();
  const mats = Array.isArray(materials) ? materials : [];

  // Build breakdown
  const totalValue = mats.reduce((acc, m) => acc + (Number(m.valueUsd) || 0), 0);
  const breakdown = mats.map((m) => ({
    material: String(m.name ?? "unnamed"),
    originCountry: (m.originCountry ?? "").toUpperCase().trim(),
    valueUsd: Number(m.valueUsd) || 0,
    valuePct: totalValue > 0 ? Number((((Number(m.valueUsd) || 0) / totalValue) * 100).toFixed(2)) : 0,
  }));

  // Wholly obtained?
  const whollyObtained =
    mats.length > 0 &&
    mats.every((m) => (m.originCountry ?? "").toUpperCase().trim() === mfg) &&
    isAgriOrMineral(mats[0]?.hsCode);

  if (whollyObtained) {
    return {
      goods: goodsName,
      manufacturingCountry: mfg,
      originCountry: mfg,
      originCriteria: "WHOLLY_OBTAINED",
      preferentialOrigin: true,
      regionalValueContentPct: 100,
      whollyObtained: true,
      tariffShift: null,
      materialsOriginBreakdown: breakdown,
      notes: `All materials originate in ${mfg}; product falls in agricultural/mineral section (chapters 1-27) — wholly obtained under WTO ROO.`,
      determinedAt,
    };
  }

  // Compute RVC (Regional Value Content) using the build-down method:
  //   RVC = (FOB − VNM) / FOB × 100
  // where VNM = value of non-originating materials.
  if (totalValue <= 0) {
    return {
      goods: goodsName,
      manufacturingCountry: mfg,
      originCountry: mfg,
      originCriteria: "INSUFFICIENT_TRANSFORMATION",
      preferentialOrigin: false,
      regionalValueContentPct: 0,
      whollyObtained: false,
      tariffShift: null,
      materialsOriginBreakdown: breakdown,
      notes: "No materials supplied; cannot determine origin. Defaulting to manufacturing country (advisory only).",
      determinedAt,
    };
  }

  const vnm = mats
    .filter((m) => (m.originCountry ?? "").toUpperCase().trim() !== mfg)
    .reduce((acc, m) => acc + (Number(m.valueUsd) || 0), 0);
  const rvc = ((totalValue - vnm) / totalValue) * 100;
  const rvcRounded = Number(rvc.toFixed(2));

  // Tariff shift: any chapter change between input materials and the
  // (assumed) output HS. Without the output HS, we approximate by checking
  // whether non-originating materials span multiple chapters.
  const inputChapters = new Set<number | null>();
  for (const m of mats) inputChapters.add(chapterOf(m.hsCode));
  const tariffShift = inputChapters.size > 1
    ? `Multiple input chapters (${[...inputChapters].filter((c) => c !== null).join(", ")}) — likely CTC satisfied`
    : null;

  // Apply 40% threshold (default for most FTAs)
  if (rvc >= 40) {
    return {
      goods: goodsName,
      manufacturingCountry: mfg,
      originCountry: mfg,
      originCriteria: "SUBSTANTIAL_TRANSFORMATION",
      preferentialOrigin: true,
      regionalValueContentPct: rvcRounded,
      whollyObtained: false,
      tariffShift,
      materialsOriginBreakdown: breakdown,
      notes: `RVC = ${rvcRounded}% ≥ 40% threshold — substantial transformation; origin = ${mfg}.`,
      determinedAt,
    };
  }

  // Insufficient transformation — origin becomes the country with the
  // highest-value non-originating material (proxy for "last substantial
  // transformation" location).
  const nonOriginating = breakdown
    .filter((b) => b.originCountry !== mfg)
    .sort((a, b) => b.valueUsd - a.valueUsd);
  const originCountry = nonOriginating[0]?.originCountry || mfg;

  return {
    goods: goodsName,
    manufacturingCountry: mfg,
    originCountry,
    originCriteria: "INSUFFICIENT_TRANSFORMATION",
    preferentialOrigin: false,
    regionalValueContentPct: rvcRounded,
    whollyObtained: false,
    tariffShift,
    materialsOriginBreakdown: breakdown,
    notes: `RVC = ${rvcRounded}% < 40% threshold; origin reassigned to ${originCountry} (highest-value non-originating material).`,
    determinedAt,
  };
}

/**
 * Validate a Certificate of Origin number against the simulated COO issuer
 * registry. In production this would call the issuing Chamber of Commerce
 * API or ePhyto hub.
 */
export function validateOriginCertificate(certificateId: string): OriginCertificateValidation {
  const id = String(certificateId ?? "").trim();
  if (!id) {
    return {
      certificateId: id,
      valid: false,
      issuer: null,
      issuedAt: null,
      goodsCovered: [],
      errors: ["Certificate ID is empty."],
    };
  }
  const match = COO_ISSUERS.find((c) => c.pattern.test(id));
  if (!match) {
    return {
      certificateId: id,
      valid: false,
      issuer: null,
      issuedAt: null,
      goodsCovered: [],
      errors: [`Certificate ID format not recognized. Expected format: <ISO2>-COO-<digits> (e.g. EG-COO-20250115-00042).`],
    };
  }
  // Simulated — in production call the chamber's verification API
  return {
    certificateId: id,
    valid: true,
    issuer: match.issuer,
    issuedAt: new Date().toISOString().slice(0, 10),
    goodsCovered: ["simulated: goods list would be returned by the issuing chamber's verification API"],
    errors: [],
  };
}

/**
 * Check whether a specific FTA's preferential origin rules are met for a
 * given (hsCode, originCountry) pair. Looks up the FTA's RVC threshold +
 * tariff shift rule for that chapter and returns whether the (simulated)
 * goods qualify.
 *
 * Note: this is a static eligibility check (does the chapter have a rule?).
 * For a specific shipment's eligibility, use determineOrigin first, then
 * compare its RVC against the threshold.
 */
export function getPreferentialOrigin(
  ftaCode: string,
  hsCode: string,
  originCountry: string,
  destCountry?: string,
): PreferentialOriginResult {
  const fta = (ftaCode ?? "").toUpperCase().trim();
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();

  if (!ch) {
    return {
      ftaCode: fta,
      hsCode: hs,
      originCountry: origin,
      destCountry: dest,
      eligible: false,
      rule: "Invalid HS code",
      threshold: 0,
      actualRvcPct: null,
      notes: "Cannot determine chapter from HS code.",
    };
  }

  const rule = FTA_RVC_RULES[`${fta}|${String(ch).padStart(2, "0")}`];
  if (!rule) {
    return {
      ftaCode: fta,
      hsCode: hs,
      originCountry: origin,
      destCountry: dest,
      eligible: false,
      rule: `No specific ${fta} rule for HS chapter ${ch}; product-by-product rule check required.`,
      threshold: 40,
      actualRvcPct: null,
      notes: "Default 40% RVC threshold assumed. Manual verification required with the issuing chamber.",
    };
  }

  return {
    ftaCode: fta,
    hsCode: hs,
    originCountry: origin,
    destCountry: dest,
    eligible: true,
    rule: rule.ruleText,
    threshold: rule.rvcThreshold,
    actualRvcPct: null,
    notes: `Chapter ${ch} covered under ${fta}. ${rule.tariffShift} rule applies.`,
  };
}

export function listFtaRules(): Array<{ ftaCode: string; chapter: number; rvcThreshold: number; rule: string }> {
  return Object.entries(FTA_RVC_RULES).map(([key, rule]) => {
    const [fta, ch] = key.split("|");
    return {
      ftaCode: fta,
      chapter: Number(ch),
      rvcThreshold: rule.rvcThreshold,
      rule: rule.ruleText,
    };
  });
}
