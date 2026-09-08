// @ts-nocheck
/**
 * SGTX v17 §20 — Permit Engine
 * ===========================================================================
 *
 * Checks whether a government PERMIT is required for a (HS, origin, dest)
 * combination. Validates existing permit numbers + lists permit types per
 * country. Different from LICENSE — permits are typically:
 *   - Health / sanitary permits (e.g. importation of animal products)
 *   - Environmental permits (e.g. trade in endangered species — CITES)
 *   - Transport permits (e.g. dangerous goods / hazmat transport)
 *   - Phytosanitary permits (re-export / plant material)
 *
 * Reference:
 *   - WTO SPS Agreement (1995) — permits required by competent authorities
 *   - CITES Appendices I/II/III
 *   - Egyptian Law 4/1994 + Decree 770/2019
 *   - EU Reg 2017/625 (official controls)
 *   - US 7 CFR 354 / APHIS permits
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface PermitRequirement {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  required: boolean;
  permitType: string | null;
  issuingAuthority: string | null;
  reason: string;
}

export interface PermitValidation {
  permitNumber: string;
  hsCode: string;
  country: string;
  valid: boolean;
  expiryDate: string | null;
  scope: string[];
  errors: string[];
}

export interface PermitType {
  code: string;
  name: string;
  authority: string;
  validityDays: number;
}

export interface PermitTypeList {
  hsCode: string;
  country: string;
  types: PermitType[];
}

// ── Permit rules reference ──────────────────────────────────────────────
// Format: `${hsChapter}|${destCountry}` → { permitType, authority, reason, validityDays }

interface PermitRule {
  permitType: string;
  authority: string;
  reason: string;
  validityDays: number;
}

const PERMIT_RULES: Record<string, PermitRule> = {
  // Egypt import of animals + animal products — veterinary permit
  "01|EG": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "GOVS (General Organization for Veterinary Services)", reason: "Live animals require a pre-import veterinary permit from GOVS.", validityDays: 30 },
  "02|EG": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "GOVS", reason: "Meat products require veterinary import permit + health certificate.", validityDays: 30 },
  // Egypt import of fish — veterinary permit (aquatic animals)
  "03|EG": { permitType: "AQUATIC_ANIMAL_PERMIT", authority: "GOVS Aquatic Unit", reason: "Fish + aquatic invertebrates require aquatic animal import permit.", validityDays: 30 },
  // Egypt import of dairy + eggs — veterinary permit
  "04|EG": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "GOVS", reason: "Dairy + eggs require veterinary import permit.", validityDays: 30 },
  // Egypt import of seeds / plants — phytosanitary + import permit
  "06|EG": { permitType: "PHYTO_IMPORT_PERMIT", authority: "MALR / Central Administration for Plant Quarantine", reason: "Live plants require a phytosanitary import permit from the CA-PQ.", validityDays: 60 },
  // Egypt import of fresh produce — phytosanitary permit (per shipment)
  "07|EG": { permitType: "PHYTO_IMPORT_PERMIT", authority: "MALR / CA-PQ", reason: "Fresh vegetables require a phytosanitary import permit.", validityDays: 60 },
  "08|EG": { permitType: "PHYTO_IMPORT_PERMIT", authority: "MALR / CA-PQ", reason: "Fresh fruit requires a phytosanitary import permit.", validityDays: 60 },
  // EU import of fresh produce — phytosanitary + plant passport
  "06|DE": { permitType: "PHYTO_IMPORT_PERMIT", authority: "Julius Kühn-Institut (JKI)", reason: "Live plants require a phytosanitary import permit (EU Reg 2016/2031).", validityDays: 60 },
  "07|DE": { permitType: "PHYTO_IMPORT_PERMIT", authority: "JKI", reason: "Fresh vegetables require phytosanitary import permit (some categories).", validityDays: 60 },
  "08|DE": { permitType: "PHYTO_IMPORT_PERMIT", authority: "JKI", reason: "Fresh fruit requires phytosanitary import permit (some categories).", validityDays: 60 },
  // EU import of animal products — veterinary permit
  "01|DE": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "BVL (German Federal Office of Consumer Protection)", reason: "Live animals require a veterinary import permit (EU Reg 2016/429).", validityDays: 90 },
  "02|DE": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "BVL", reason: "Meat products require a veterinary import permit.", validityDays: 90 },
  // EU import of products of animal origin (dairy, eggs, honey) — TRACES
  "04|DE": { permitType: "TRACES_IMPORT_PERMIT", authority: "BVL", reason: "Dairy + eggs + honey require a TRACES notification + import permit.", validityDays: 60 },
  // US import of plants — APHIS permit
  "06|US": { permitType: "APHIS_PLANT_IMPORT_PERMIT", authority: "USDA APHIS PPQ", reason: "Live plants require an APHIS PPQ import permit (7 CFR 354).", validityDays: 365 },
  "08|US": { permitType: "APHIS_FRUIT_IMPORT_PERMIT", authority: "USDA APHIS PPQ", reason: "Fresh fruit imports require an APHIS PPQ permit for some categories.", validityDays: 365 },
  // US import of meat — FSIS
  "02|US": { permitType: "FSIS_MEAT_IMPORT_PERMIT", authority: "USDA FSIS", reason: "Meat products require FSIS equivalence + import permit.", validityDays: 365 },
  // CITES — endangered species (chapter 05 animal products, 13 lac/gums, 41 hides, 71 pearls)
  "05|EG": { permitType: "CITES_IMPORT_PERMIT", authority: "Egyptian CITES Management Authority (NCS)", reason: "Animal products may be CITES-controlled — verify against CITES Appendices.", validityDays: 180 },
  "05|DE": { permitType: "CITES_IMPORT_PERMIT", authority: "BfN (German CITES Management Authority)", reason: "Animal products may be CITES-controlled — verify against CITES Appendices.", validityDays: 180 },
  "41|EG": { permitType: "CITES_IMPORT_PERMIT", authority: "Egyptian CITES Management Authority (NCS)", reason: "Hides/leather from protected species (e.g. crocodile, snake) require CITES permit.", validityDays: 180 },
  // Dangerous goods / hazmat (chapter 27 fuel, 28 inorganic, 29 organic chemicals, 30 pharma, 36 explosives)
  "27|EG": { permitType: "HAZMAT_IMPORT_PERMIT", authority: "EOS (Egyptian Organization for Standardization) + Civil Defense", reason: "Fuel imports require a hazmat transport + storage permit.", validityDays: 90 },
  "28|EG": { permitType: "HAZMAT_IMPORT_PERMIT", authority: "EOS + Civil Defense", reason: "Inorganic chemicals require a hazmat import permit + MSDS.", validityDays: 90 },
  "29|EG": { permitType: "HAZMAT_IMPORT_PERMIT", authority: "EOS + Civil Defense", reason: "Organic chemicals require a hazmat import permit + MSDS.", validityDays: 90 },
  "36|EG": { permitType: "EXPLOSIVES_IMPORT_PERMIT", authority: "Ministry of Interior (Explosives Dept.)", reason: "Explosives require a special import permit from MOI.", validityDays: 30 },
  // Saudi Arabia — animal / plant / hazmat
  "01|SA": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "MEWA + SFDA", reason: "Live animals require a veterinary import permit from MEWA + SFDA.", validityDays: 30 },
  "02|SA": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "SFDA", reason: "Meat products require a veterinary import permit from SFDA.", validityDays: 30 },
  "06|SA": { permitType: "PHYTO_IMPORT_PERMIT", authority: "MEWA", reason: "Live plants require a phytosanitary import permit from MEWA.", validityDays: 60 },
  "08|SA": { permitType: "PHYTO_IMPORT_PERMIT", authority: "MEWA", reason: "Fresh fruit requires a phytosanitary import permit from MEWA.", validityDays: 60 },
  // China — animal / plant / hazmat
  "01|CN": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "GACC (General Administration of Customs of China)", reason: "Live animals require a veterinary import permit.", validityDays: 90 },
  "02|CN": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "GACC", reason: "Meat products require a veterinary import permit.", validityDays: 90 },
  "06|CN": { permitType: "PHYTO_IMPORT_PERMIT", authority: "GACC + MARA", reason: "Live plants require a phytosanitary import permit.", validityDays: 60 },
  // India — animal / plant
  "01|IN": { permitType: "VETERINARY_IMPORT_PERMIT", authority: "DAHD (Dept. of Animal Husbandry & Dairying)", reason: "Live animals require a veterinary import permit.", validityDays: 30 },
  "06|IN": { permitType: "PHYTO_IMPORT_PERMIT", authority: "DPPQS (Directorate of Plant Protection, Quarantine & Storage)", reason: "Live plants require a phytosanitary import permit.", validityDays: 60 },
};

// ── Permit number format reference ──────────────────────────────────────

interface PermitFormat {
  authority: string;
  pattern: RegExp;
  validityDays: number;
  scope: string[];
}

const PERMIT_FORMATS: PermitFormat[] = [
  { authority: "GOVS (Egypt)", pattern: /^EG-GOVS-\d{4,10}$/i, validityDays: 30, scope: ["veterinary", "aquatic"] },
  { authority: "CA-PQ (Egypt)", pattern: /^EG-CAPQ-\d{4,10}$/i, validityDays: 60, scope: ["phytosanitary"] },
  { authority: "BVL (Germany)", pattern: /^DE-BVL-\d{4,10}$/i, validityDays: 90, scope: ["veterinary", "traces"] },
  { authority: "JKI (Germany)", pattern: /^DE-JKI-\d{4,10}$/i, validityDays: 60, scope: ["phytosanitary"] },
  { authority: "APHIS PPQ (USA)", pattern: /^US-APHIS-\d{4,10}$/i, validityDays: 365, scope: ["plants", "fruits"] },
  { authority: "FSIS (USA)", pattern: /^US-FSIS-\d{4,10}$/i, validityDays: 365, scope: ["meat"] },
  { authority: "CITES Egypt (NCS)", pattern: /^EG-CITES-\d{4,10}$/i, validityDays: 180, scope: ["endangered_species"] },
  { authority: "CITES Germany (BfN)", pattern: /^DE-CITES-\d{4,10}$/i, validityDays: 180, scope: ["endangered_species"] },
  { authority: "MEWA (Saudi)", pattern: /^SA-MEWA-\d{4,10}$/i, validityDays: 60, scope: ["phytosanitary", "veterinary"] },
  { authority: "SFDA (Saudi)", pattern: /^SA-SFDA-PERM-\d{4,10}$/i, validityDays: 30, scope: ["food", "veterinary"] },
  { authority: "GACC (China)", pattern: /^CN-GACC-\d{4,10}$/i, validityDays: 90, scope: ["veterinary", "phytosanitary"] },
  { authority: "DAHD (India)", pattern: /^IN-DAHD-\d{4,10}$/i, validityDays: 30, scope: ["veterinary"] },
  { authority: "DPPQS (India)", pattern: /^IN-DPPQS-\d{4,10}$/i, validityDays: 60, scope: ["phytosanitary"] },
  { authority: "Egyptian Civil Defense (Hazmat)", pattern: /^EG-HAZMAT-\d{4,10}$/i, validityDays: 90, scope: ["hazmat"] },
  { authority: "Egyptian MOI (Explosives)", pattern: /^EG-MOI-EXP-\d{4,10}$/i, validityDays: 30, scope: ["explosives"] },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

// ── Public API ───────────────────────────────────────────────────────────

export function checkPermitRequired(
  hsCode: string,
  originCountry: string,
  destCountry: string,
): PermitRequirement {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();

  if (!ch) {
    return {
      hsCode: hs, originCountry: origin, destCountry: dest,
      required: false, permitType: null, issuingAuthority: null,
      reason: "Invalid HS code — cannot determine chapter.",
    };
  }

  const key = `${String(ch).padStart(2, "0")}|${dest}`;
  const rule = PERMIT_RULES[key];
  if (!rule) {
    return {
      hsCode: hs, originCountry: origin, destCountry: dest,
      required: false, permitType: null, issuingAuthority: null,
      reason: `No permit required for HS chapter ${ch} imported into ${dest}.`,
    };
  }

  return {
    hsCode: hs, originCountry: origin, destCountry: dest,
    required: true, permitType: rule.permitType, issuingAuthority: rule.authority,
    reason: rule.reason,
  };
}

export function validatePermit(
  permitNumber: string,
  hsCode?: string,
  country?: string,
): PermitValidation {
  const num = String(permitNumber ?? "").trim();
  const cc = (country ?? "").toUpperCase().trim();

  if (!num) {
    return {
      permitNumber: num, hsCode: String(hsCode ?? ""), country: cc,
      valid: false, expiryDate: null, scope: [],
      errors: ["Permit number is empty."],
    };
  }

  const match = PERMIT_FORMATS.find((f) => f.pattern.test(num));
  if (!match) {
    return {
      permitNumber: num, hsCode: String(hsCode ?? ""), country: cc,
      valid: false, expiryDate: null, scope: [],
      errors: [`Permit number format not recognized. Expected format: <ISO2>-<AUTHORITY>-<digits>.`],
    };
  }

  const expiry = match.validityDays > 0
    ? new Date(Date.now() + match.validityDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  return {
    permitNumber: num, hsCode: String(hsCode ?? ""), country: cc,
    valid: true, expiryDate: expiry, scope: match.scope,
    errors: [],
  };
}

export function getPermitTypes(hsCode: string, country: string): PermitTypeList {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const cc = (country ?? "").toUpperCase().trim();

  const types: PermitType[] = [];
  if (ch) {
    for (const [key, rule] of Object.entries(PERMIT_RULES)) {
      const [kCh, kCountry] = key.split("|");
      if (Number(kCh) === ch && kCountry === cc) {
        types.push({
          code: rule.permitType,
          name: rule.permitType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
          authority: rule.authority,
          validityDays: rule.validityDays,
        });
      }
    }
  }

  return { hsCode: hs, country: cc, types };
}

export function listAllPermitRules(): Array<{ hsChapter: number; country: string; permitType: string; authority: string; reason: string }> {
  return Object.entries(PERMIT_RULES).map(([key, rule]) => {
    const [ch, country] = key.split("|");
    return {
      hsChapter: Number(ch),
      country,
      permitType: rule.permitType,
      authority: rule.authority,
      reason: rule.reason,
    };
  });
}
