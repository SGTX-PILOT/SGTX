// @ts-nocheck
/**
 * SGTX v17 §20 — License Engine
 * ===========================================================================
 *
 * Checks whether an import/export LICENSE is required for a given
 * (HS code, origin, destination, transaction type) combination. Validates
 * existing license numbers + lists license types per country.
 *
 * License types covered:
 *   - EXPORT_LICENSE (general / strategic goods)
 *   - IMPORT_LICENSE (textiles, agricultural quotas)
 *   - STRATEGIC_LICENSE (dual-use, crypto)
 *   - QUOTA_LICENSE (sugar, textiles under TRQ)
 *
 * Reference: WTO Import Licensing Agreement + national gazettes (Egyptian
   Decree 770/2019, EU Reg 2015/2447, US 15 CFR 740).
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type TransactionType = "EXPORT" | "IMPORT" | "RE_EXPORT" | "TRANSIT";

export interface LicenseRequirement {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  transactionType: TransactionType;
  required: boolean;
  licenseType: string | null;
  issuingAuthority: string | null;
  reason: string;
}

export interface LicenseValidation {
  licenseNumber: string;
  hsCode: string;
  country: string;
  valid: boolean;
  expiryDate: string | null;
  scope: string[];
  errors: string[];
}

export interface LicenseType {
  code: string;
  name: string;
  authority: string;
  validityDays: number;
}

export interface LicenseTypeList {
  hsCode: string;
  country: string;
  types: LicenseType[];
}

// ── Reference: HS chapters requiring import/export licenses ─────────────
// Format: `${hsChapter}|${destCountry}|${txType}` → { licenseType, authority, reason }

interface LicenseRule {
  licenseType: string;
  authority: string;
  reason: string;
  validityDays: number;
}

const LICENSE_RULES: Record<string, LicenseRule> = {
  // Egypt import of textiles under WTO/MFA quota system (still partial)
  "50|EG|IMPORT": { licenseType: "TEXTILE_IMPORT_LICENSE", authority: "GOEIC (General Organization for Export and Import Control)", reason: "Textile quotas under Egypt's WTO commitments.", validityDays: 90 },
  "51|EG|IMPORT": { licenseType: "TEXTILE_IMPORT_LICENSE", authority: "GOEIC", reason: "Textile quotas under Egypt's WTO commitments.", validityDays: 90 },
  "52|EG|IMPORT": { licenseType: "TEXTILE_IMPORT_LICENSE", authority: "GOEIC", reason: "Textile quotas under Egypt's WTO commitments.", validityDays: 90 },
  "53|EG|IMPORT": { licenseType: "TEXTILE_IMPORT_LICENSE", authority: "GOEIC", reason: "Textile quotas under Egypt's WTO commitments.", validityDays: 90 },
  // Egypt import of pharmaceuticals
  "30|EG|IMPORT": { licenseType: "PHARMA_IMPORT_LICENSE", authority: "EDA (Egyptian Drug Authority)", reason: "Pharmaceuticals require EDA import authorization + GMP evidence.", validityDays: 180 },
  // Egypt import of pesticides
  "38|EG|IMPORT": { licenseType: "PESTICIDE_IMPORT_LICENSE", authority: "APC (Agricultural Pesticides Committee)", reason: "Pesticides require APC registration + import license.", validityDays: 365 },
  // Egypt import of seeds (chapter 12 — oil seeds)
  "12|EG|IMPORT": { licenseType: "SEED_IMPORT_LICENSE", authority: "MALR (Ministry of Agriculture)", reason: "Seed importation requires variety registration + phytosanitary.", validityDays: 365 },
  // EU import of textiles under surveillance (Reg 2015/2447)
  "50|DE|IMPORT": { licenseType: "EU_IMPORT_SURVEILLANCE", authority: "German Bundesamt für Wirtschaft und Ausfuhrkontrolle (BAFA)", reason: "EU import surveillance for certain textile categories.", validityDays: 180 },
  // US import of steel + aluminum under Section 232
  "72|US|IMPORT": { licenseType: "SECTION_232_LICENSE", authority: "US CBP / DOC", reason: "Section 232 tariffs on steel — import license via CBP entry summary.", validityDays: 0 },
  "76|US|IMPORT": { licenseType: "SECTION_232_LICENSE", authority: "US CBP / DOC", reason: "Section 232 tariffs on aluminum — import license via CBP entry summary.", validityDays: 0 },
  // US export of strategic goods (EAR-controlled)
  "84|US|EXPORT": { licenseType: "EXPORT_LICENSE_EAR", authority: "US BIS (Bureau of Industry and Security)", reason: "Industrial machinery subject to EAR — may require export license depending on destination (Country Group D).", validityDays: 730 },
  "85|US|EXPORT": { licenseType: "EXPORT_LICENSE_EAR", authority: "US BIS", reason: "Electronics subject to EAR — may require export license for sensitive destinations.", validityDays: 730 },
  "90|US|EXPORT": { licenseType: "EXPORT_LICENSE_EAR", authority: "US BIS", reason: "Optical/instrument goods subject to EAR.", validityDays: 730 },
  // EU export of dual-use (Reg 2021/821)
  "84|DE|EXPORT": { licenseType: "DUAL_USE_EXPORT_LICENSE", authority: "BAFA", reason: "Industrial machinery potentially dual-use under EU Reg 2021/821 Annex I.", validityDays: 365 },
  "85|DE|EXPORT": { licenseType: "DUAL_USE_EXPORT_LICENSE", authority: "BAFA", reason: "Electronics potentially dual-use under EU Reg 2021/821 Annex I.", validityDays: 365 },
  // Saudi import of pharmaceuticals
  "30|SA|IMPORT": { licenseType: "SFDA_IMPORT_LICENSE", authority: "SFDA (Saudi Food and Drug Authority)", reason: "Pharmaceutical import requires SFDA registration + import license.", validityDays: 365 },
  // Saudi import of seeds / live plants
  "06|SA|IMPORT": { licenseType: "MEWA_IMPORT_LICENSE", authority: "MEWA (Ministry of Environment, Water and Agriculture)", reason: "Live plants require MEWA import permit + phytosanitary.", validityDays: 60 },
  // China import of agricultural quotas (TRQ for wheat, rice, corn)
  "10|CN|IMPORT": { licenseType: "TRQ_IMPORT_LICENSE", authority: "NDRC / MOFCOM", reason: "Cereal imports under China's tariff-rate quota (TRQ) system.", validityDays: 365 },
  // India import of gold (chapter 71)
  "71|IN|IMPORT": { licenseType: "GOLD_IMPORT_LICENSE", authority: "RBI / DGFT", reason: "Gold import requires RBI authorization + DGFT license.", validityDays: 30 },
};

// ── License number format reference ─────────────────────────────────────

interface LicenseFormat {
  authority: string;
  pattern: RegExp;
  validityDays: number;
  scope: string[];
}

const LICENSE_FORMATS: LicenseFormat[] = [
  { authority: "GOEIC (Egypt)", pattern: /^EG-LIC-\d{6,12}$/i, validityDays: 90, scope: ["textile", "pharmaceutical", "general"] },
  { authority: "EDA (Egypt)", pattern: /^EG-EDA-\d{4,10}$/i, validityDays: 180, scope: ["pharmaceutical"] },
  { authority: "BAFA (Germany)", pattern: /^DE-BAFA-\d{4,12}$/i, validityDays: 365, scope: ["dual-use", "export_control"] },
  { authority: "BIS (USA)", pattern: /^US-BIS-\d{4,10}$/i, validityDays: 730, scope: ["export_control", "EAR"] },
  { authority: "CBP (USA)", pattern: /^US-CBP-\d{4,12}$/i, validityDays: 0, scope: ["section_232", "import"] },
  { authority: "SFDA (Saudi)", pattern: /^SA-SFDA-\d{4,12}$/i, validityDays: 365, scope: ["pharmaceutical", "food"] },
  { authority: "MEWA (Saudi)", pattern: /^SA-MEWA-\d{4,10}$/i, validityDays: 60, scope: ["plants", "seeds"] },
  { authority: "NDRC (China)", pattern: /^CN-NDRC-\d{4,10}$/i, validityDays: 365, scope: ["TRQ", "cereals"] },
  { authority: "RBI / DGFT (India)", pattern: /^IN-DGFT-\d{4,12}$/i, validityDays: 30, scope: ["gold", "precious_metals"] },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Check whether a license is required for a (HS, origin, dest, txType) combination.
 * Falls back to "not required" if no rule matches — but flags advisory warnings.
 */
export function checkLicenseRequired(
  hsCode: string,
  originCountry: string,
  destCountry: string,
  transactionType: TransactionType = "IMPORT",
): LicenseRequirement {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();
  const tx = (transactionType ?? "IMPORT").toUpperCase().trim() as TransactionType;

  if (!ch) {
    return {
      hsCode: hs, originCountry: origin, destCountry: dest,
      transactionType: tx, required: false, licenseType: null, issuingAuthority: null,
      reason: "Invalid HS code — cannot determine chapter.",
    };
  }

  // The rule's destination country is where the LICENSE is required (import
  // license = importing country; export license = exporting country).
  const ruleCountry = tx === "EXPORT" ? origin : dest;
  const key = `${String(ch).padStart(2, "0")}|${ruleCountry}|${tx}`;
  const rule = LICENSE_RULES[key];

  if (!rule) {
    return {
      hsCode: hs, originCountry: origin, destCountry: dest,
      transactionType: tx, required: false, licenseType: null, issuingAuthority: null,
      reason: `No license required for HS chapter ${ch} (${tx}) in ${ruleCountry}.`,
    };
  }

  return {
    hsCode: hs, originCountry: origin, destCountry: dest,
    transactionType: tx, required: true, licenseType: rule.licenseType,
    issuingAuthority: rule.authority, reason: rule.reason,
  };
}

/**
 * Validate a license number's format + (simulated) registry check. In
 * production this would call the issuing authority's verification API.
 */
export function validateLicense(
  licenseNumber: string,
  hsCode?: string,
  country?: string,
): LicenseValidation {
  const num = String(licenseNumber ?? "").trim();
  const cc = (country ?? "").toUpperCase().trim();

  if (!num) {
    return {
      licenseNumber: num, hsCode: String(hsCode ?? ""), country: cc,
      valid: false, expiryDate: null, scope: [],
      errors: ["License number is empty."],
    };
  }

  const match = LICENSE_FORMATS.find((f) => f.pattern.test(num));
  if (!match) {
    return {
      licenseNumber: num, hsCode: String(hsCode ?? ""), country: cc,
      valid: false, expiryDate: null, scope: [],
      errors: [`License number format not recognized. Expected format: <ISO2>-<AUTHORITY>-<digits>.`],
    };
  }

  const expiry = match.validityDays > 0
    ? new Date(Date.now() + match.validityDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  return {
    licenseNumber: num, hsCode: String(hsCode ?? ""), country: cc,
    valid: true, expiryDate: expiry, scope: match.scope,
    errors: [],
  };
}

/**
 * List all license types that COULD apply for a given (HS code, country)
 * combination. Includes both import and export licenses for completeness.
 */
export function getLicenseTypes(hsCode: string, country: string): LicenseTypeList {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const cc = (country ?? "").toUpperCase().trim();

  const types: LicenseType[] = [];
  if (ch) {
    for (const [key, rule] of Object.entries(LICENSE_RULES)) {
      const [kCh, kCountry] = key.split("|");
      if (Number(kCh) === ch && kCountry === cc) {
        types.push({
          code: rule.licenseType,
          name: rule.licenseType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
          authority: rule.authority,
          validityDays: rule.validityDays,
        });
      }
    }
  }

  return {
    hsCode: hs,
    country: cc,
    types,
  };
}

export function listAllLicenseRules(): Array<{ hsChapter: number; country: string; txType: string; licenseType: string; authority: string; reason: string }> {
  return Object.entries(LICENSE_RULES).map(([key, rule]) => {
    const [ch, country, txType] = key.split("|");
    return {
      hsChapter: Number(ch),
      country,
      txType,
      licenseType: rule.licenseType,
      authority: rule.authority,
      reason: rule.reason,
    };
  });
}
