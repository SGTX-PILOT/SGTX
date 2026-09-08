// @ts-nocheck
/**
 * SGTX v17 §20 — Certificate Engine
 * ===========================================================================
 *
 * Returns the required CERTIFICATES for a given (HS code, origin, dest,
 * transport mode) combination. Validates existing certificate numbers +
 * lists certificate types per country.
 *
 * Certificate types covered (different from LICENSE / PERMIT — certificates
 * are DOCUMENTARY evidence of compliance, issued by accredited third parties):
 *   - Certificate of Origin (COO) — chamber of commerce
 *   - GSP Form A — Generalized System of Preferences
 *   - EUR.1 / EUR-MED — preferential origin (EG-EU, EU-MED)
 *   - Phytosanitary Certificate (PC) — NPPO
 *   - Veterinary Health Certificate — veterinary authority
 *   - Halal Certificate — accredited halal certifier
 *   - ISO 22000 / HACCP — food safety
 *   - ISO 9001 — quality
 *   - Certificate of Analysis (COA) — lab
 *   - Non-Preferential COO — WTO origin
 *   - GMP (Good Manufacturing Practice) — pharma
 *   - fumigation / heat treatment certificate — ISPM 15
 *
 * Reference: WTO agreements + ICC Certificate of Origin Guidelines 2012 +
 * national gazettes.
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type TransportMode = "SEA" | "AIR" | "ROAD" | "RAIL" | "MULTIMODAL" | "INLAND_WATER";

export interface CertificateRequirement {
  type: string;
  name: string;
  issuer: string;
  mandatory: boolean;
  notes?: string;
}

export interface CertificateRequirementsResult {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  transportMode: TransportMode;
  certificates: CertificateRequirement[];
  computedAt: string;
}

export interface CertificateValidation {
  certificateNumber: string;
  type: string;
  valid: boolean;
  issuer: string | null;
  expiryDate: string | null;
  errors: string[];
}

export interface CertificateType {
  code: string;
  name: string;
  issuer: string;
}

export interface CertificateTypeList {
  hsCode: string;
  country: string;
  types: CertificateType[];
}

// ── Reference: certificate requirements by chapter + country ────────────
// Format: `${hsChapter}|${destCountry}` → CertificateRequirement[]

const CERT_RULES: Record<string, CertificateRequirement[]> = {
  // Fresh produce → phytosanitary + ISPM 15 (fumigation/HT for wood packaging)
  "08|DE": [
    { type: "PHYTOSANITARY", name: "Phytosanitary Certificate (PC)", issuer: "NPPO of origin country", mandatory: true, notes: "EU Reg 2016/2031." },
    { type: "ISPM15", name: "ISPM 15 Wood Packaging Mark", issuer: "Accredited fumigation/HT facility", mandatory: true, notes: "Required for any wood packaging material (pallets/crates)." },
    { type: "COO_NON_PREF", name: "Non-preferential Certificate of Origin", issuer: "Chamber of commerce", mandatory: false, notes: "Required for some EU import surveillance categories." },
  ],
  "08|EG": [
    { type: "PHYTOSANITARY", name: "Phytosanitary Certificate (PC)", issuer: "NPPO of origin country", mandatory: true, notes: "Egypt MALR requires PC for all fresh produce imports." },
    { type: "ISPM15", name: "ISPM 15 Wood Packaging Mark", issuer: "Fumigation/HT facility", mandatory: true },
    { type: "HALAL", name: "Halal Certificate (if packaged/processed)", issuer: "Accredited halal certifier", mandatory: false, notes: "Egypt does not require halal for fresh produce but buyers may request." },
  ],
  "07|DE": [
    { type: "PHYTOSANITARY", name: "Phytosanitary Certificate", issuer: "NPPO of origin country", mandatory: true },
    { type: "ISPM15", name: "ISPM 15 Wood Packaging Mark", issuer: "Fumigation/HT facility", mandatory: true },
  ],
  "07|EG": [
    { type: "PHYTOSANITARY", name: "Phytosanitary Certificate", issuer: "NPPO of origin country", mandatory: true },
    { type: "ISPM15", name: "ISPM 15 Wood Packaging Mark", issuer: "Fumigation/HT facility", mandatory: true },
  ],
  // Meat + animal products → veterinary health cert
  "02|DE": [
    { type: "VET_HEALTH", name: "Veterinary Health Certificate", issuer: "Veterinary authority of origin", mandatory: true, notes: "EU Reg 2016/429 (Animal Health Law)." },
    { type: "TRACES", name: "TRACES-NT Notification + Common Health Entry Document (CHED)", issuer: "EU competent authority", mandatory: true, notes: "Electronic pre-notification required." },
    { type: "HALAL", name: "Halal Certificate", issuer: "Accredited halal certifier", mandatory: false },
    { type: "COO_NON_PREF", name: "Non-preferential COO", issuer: "Chamber of commerce", mandatory: false },
  ],
  "02|EG": [
    { type: "VET_HEALTH", name: "Veterinary Health Certificate", issuer: "Veterinary authority of origin", mandatory: true },
    { type: "HALAL", name: "Halal Certificate", issuer: "Accredited halal certifier", mandatory: true, notes: "Mandatory for meat imports into Egypt." },
  ],
  "02|SA": [
    { type: "VET_HEALTH", name: "Veterinary Health Certificate", issuer: "Veterinary authority of origin", mandatory: true, notes: "SFDA requirements apply." },
    { type: "HALAL", name: "Halal Certificate (SFDA-accredited certifier)", issuer: "SFDA-accredited halal certifier", mandatory: true },
  ],
  // Dairy + eggs + honey
  "04|DE": [
    { type: "VET_HEALTH", name: "Veterinary / Dairy Health Certificate", issuer: "Veterinary authority of origin", mandatory: true },
    { type: "TRACES", name: "TRACES-NT CHED", issuer: "EU competent authority", mandatory: true },
  ],
  // Fish + aquatic — catch certificate for EU (IUU Reg 1005/2008)
  "03|DE": [
    { type: "CATCH_CERT", name: "Catch Certificate (IUU Regulation)", issuer: "Flag state authority of the catching vessel", mandatory: true, notes: "EU Reg 1005/2008 — IUU fishing." },
    { type: "VET_HEALTH", name: "Aquatic Animal Health Certificate", issuer: "Competent authority", mandatory: false },
    { type: "ISPM15", name: "ISPM 15 Wood Packaging Mark", issuer: "Fumigation/HT facility", mandatory: true },
  ],
  "03|EG": [
    { type: "CATCH_CERT", name: "Catch Certificate", issuer: "Flag state authority", mandatory: true },
    { type: "VET_HEALTH", name: "Aquatic Animal Health Certificate", issuer: "Competent authority", mandatory: true },
    { type: "ISPM15", name: "ISPM 15 Wood Packaging Mark", issuer: "Fumigation/HT facility", mandatory: true },
  ],
  // Pharmaceutical → GMP + Certificate of Pharmaceutical Product (CPP)
  "30|DE": [
    { type: "GMP", name: "GMP Certificate (manufacturer)", issuer: "National regulatory authority of origin country", mandatory: true, notes: "EU GMP for the manufacturer site." },
    { type: "CPP", name: "Certificate of Pharmaceutical Product (WHO format)", issuer: "National regulatory authority of origin country", mandatory: true },
    { type: "MA", name: "Marketing Authorisation", issuer: "EMA or German BfArM", mandatory: true, notes: "Required before placing on the EU market." },
    { type: "COA", name: "Certificate of Analysis (per batch)", issuer: "Manufacturer QC lab", mandatory: true },
  ],
  "30|EG": [
    { type: "GMP", name: "GMP Certificate", issuer: "National regulatory authority", mandatory: true },
    { type: "CPP", name: "Certificate of Pharmaceutical Product", issuer: "National regulatory authority", mandatory: true },
    { type: "EDA", name: "EDA Import Authorization", issuer: "Egyptian Drug Authority", mandatory: true },
    { type: "COA", name: "Certificate of Analysis (per batch)", issuer: "Manufacturer QC lab", mandatory: true },
  ],
  // Processed food / beverages → HACCP + ISO 22000
  "20|DE": [
    { type: "HACCP", name: "HACCP Certification", issuer: "Accredited certification body", mandatory: true, notes: "EU food hygiene Reg 852/2004." },
    { type: "ISO22000", name: "ISO 22000 (optional but recommended)", issuer: "Accredited certification body", mandatory: false },
    { type: "COO_NON_PREF", name: "Non-preferential COO", issuer: "Chamber of commerce", mandatory: false },
  ],
  "22|DE": [
    { type: "HACCP", name: "HACCP Certification", issuer: "Accredited certification body", mandatory: true },
    { type: "EXCISE_LICENCE", name: "Excise Licence (if applicable)", issuer: "German customs", mandatory: false },
  ],
  // Garments → textile labeling
  "61|DE": [
    { type: "TEXTILE_LABEL", name: "Textile Fiber Composition Label", issuer: "Manufacturer", mandatory: true, notes: "EU Reg 1007/2011 (fiber names + labeling)." },
    { type: "REACH", name: "REACH Compliance Declaration", issuer: "Manufacturer", mandatory: true, notes: "EU Reg 1907/2006 (chemical safety)." },
    { type: "COO_PREF", name: "Preferential COO (EUR.1 or statement on origin)", issuer: "Customs of origin country", mandatory: false, notes: "If FTA preference is claimed." },
  ],
  "62|DE": [
    { type: "TEXTILE_LABEL", name: "Textile Fiber Composition Label", issuer: "Manufacturer", mandatory: true },
    { type: "REACH", name: "REACH Compliance Declaration", issuer: "Manufacturer", mandatory: true },
    { type: "COO_PREF", name: "Preferential COO (EUR.1)", issuer: "Customs of origin country", mandatory: false },
  ],
  // Electronics → CE mark + RoHS
  "85|DE": [
    { type: "CE_MARK", name: "CE Conformity Mark", issuer: "Manufacturer (Notified Body for some categories)", mandatory: true, notes: "EU EMC + LVD + RED Directives." },
    { type: "ROHS", name: "RoHS Declaration (Restriction of Hazardous Substances)", issuer: "Manufacturer", mandatory: true, notes: "EU 2011/65/EU." },
    { type: "REACH", name: "REACH Compliance Declaration", issuer: "Manufacturer", mandatory: true },
    { type: "WEEE", name: "WEEE Registration", issuer: "National WEEE register", mandatory: true },
  ],
  // Machinery → CE + machinery directive
  "84|DE": [
    { type: "CE_MARK", name: "CE Mark (Machinery Directive 2006/42/EC)", issuer: "Manufacturer (Notified Body for Annex IV)", mandatory: true },
    { type: "REACH", name: "REACH Compliance Declaration", issuer: "Manufacturer", mandatory: true },
  ],
  // Vehicles → type approval
  "87|DE": [
    { type: "TYPE_APPROVAL", name: "Type Approval (CoC — Certificate of Conformity)", issuer: "Manufacturer", mandatory: true, notes: "EU Reg 2018/858." },
    { type: "CE_MARK", name: "CE Mark (for components)", issuer: "Manufacturer", mandatory: true },
  ],
  // Toys → CE mark + EN 71
  "95|DE": [
    { type: "CE_MARK", name: "CE Mark (Toys Safety Directive 2009/48/EC)", issuer: "Manufacturer", mandatory: true },
    { type: "EN71", name: "EN 71 Test Report", issuer: "Accredited test lab", mandatory: true },
  ],
};

// ── Certificate number format reference ─────────────────────────────────

interface CertFormat {
  pattern: RegExp;
  issuer: string;
  validityDays: number;
}

const CERT_FORMATS: Record<string, CertFormat> = {
  PHYTOSANITARY: { pattern: /^[A-Z]{2}-PC-\d{4,12}$/i, issuer: "NPPO (National Plant Protection Organization)", validityDays: 14 },
  VET_HEALTH: { pattern: /^[A-Z]{2}-VHC-\d{4,12}$/i, issuer: "Veterinary authority", validityDays: 90 },
  CATCH_CERT: { pattern: /^[A-Z]{2}-CC-\d{4,12}$/i, issuer: "Flag state authority", validityDays: 180 },
  HALAL: { pattern: /^HALAL-[A-Z]{2}-\d{4,12}$/i, issuer: "Accredited halal certifier", validityDays: 365 },
  GMP: { pattern: /^GMP-[A-Z]{2}-\d{4,12}$/i, issuer: "National regulatory authority", validityDays: 1095 },
  CPP: { pattern: /^CPP-[A-Z]{2}-\d{4,12}$/i, issuer: "National regulatory authority", validityDays: 1095 },
  HACCP: { pattern: /^HACCP-[A-Z]{2}-\d{4,12}$/i, issuer: "Accredited certification body", validityDays: 1095 },
  ISO22000: { pattern: /^ISO22000-[A-Z]{2}-\d{4,12}$/i, issuer: "Accredited certification body", validityDays: 1095 },
  ISO9001: { pattern: /^ISO9001-[A-Z]{2}-\d{4,12}$/i, issuer: "Accredited certification body", validityDays: 1095 },
  COA: { pattern: /^COA-\d{4,12}$/i, issuer: "Manufacturer QC lab", validityDays: 365 },
  COO_NON_PREF: { pattern: /^[A-Z]{2}-COO-\d{4,12}$/i, issuer: "Chamber of commerce", validityDays: 180 },
  COO_PREF: { pattern: /^[A-Z]{2}-EUR\d?-\d{4,12}$/i, issuer: "Customs authority", validityDays: 180 },
  CE_MARK: { pattern: /^\d{4}-CE-\d{4,12}$/i, issuer: "Notified Body (where applicable)", validityDays: 1825 },
  ROHS: { pattern: /^ROHS-[A-Z]{2}-\d{4,12}$/i, issuer: "Manufacturer", validityDays: 1825 },
  REACH: { pattern: /^REACH-[A-Z]{2}-\d{4,12}$/i, issuer: "Manufacturer", validityDays: 1825 },
  TYPE_APPROVAL: { pattern: /^[A-Z]{2}-TYPE-\d{4,12}$/i, issuer: "Manufacturer / type approval authority", validityDays: 3650 },
  ISPM15: { pattern: /^ISPM15-[A-Z]{2}-\d{4,12}$/i, issuer: "Fumigation/HT facility", validityDays: 0 },
  TRACES: { pattern: /^TRACES-\d{4,12}$/i, issuer: "EU competent authority", validityDays: 0 },
  EDA: { pattern: /^EG-EDA-\d{4,12}$/i, issuer: "Egyptian Drug Authority", validityDays: 180 },
  MA: { pattern: /^[A-Z]{2}-MA-\d{4,12}$/i, issuer: "EMA / national authority", validityDays: 1825 },
  EXCISE_LICENCE: { pattern: /^EXCISE-[A-Z]{2}-\d{4,12}$/i, issuer: "National customs", validityDays: 365 },
  TEXTILE_LABEL: { pattern: /^TEXTILE-[A-Z]{2}-\d{4,12}$/i, issuer: "Manufacturer", validityDays: 1825 },
  WEEE: { pattern: /^WEEE-[A-Z]{2}-\d{4,12}$/i, issuer: "National WEEE register", validityDays: 1825 },
  EN71: { pattern: /^EN71-[A-Z]{2}-\d{4,12}$/i, issuer: "Accredited test lab", validityDays: 1825 },
};

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

// ── Public API ───────────────────────────────────────────────────────────

export function getRequiredCertificates(
  hsCode: string,
  originCountry: string,
  destCountry: string,
  transportMode: TransportMode = "SEA",
): CertificateRequirementsResult {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();
  const mode = (transportMode ?? "SEA").toUpperCase().trim() as TransportMode;

  const certs: CertificateRequirement[] = [];

  if (ch) {
    const key = `${String(ch).padStart(2, "0")}|${dest}`;
    if (CERT_RULES[key]) certs.push(...CERT_RULES[key]);
  }

  // Mode-specific additions
  if (mode === "SEA") {
    certs.push({ type: "BL", name: "Bill of Lading", issuer: "Carrier", mandatory: true });
    if (!certs.some((c) => c.type === "ISPM15")) {
      certs.push({ type: "ISPM15", name: "ISPM 15 Wood Packaging Mark", issuer: "Fumigation/HT facility", mandatory: true });
    }
  } else if (mode === "AIR") {
    certs.push({ type: "AWB", name: "Air Waybill", issuer: "Carrier", mandatory: true });
  } else if (mode === "ROAD") {
    certs.push({ type: "CMR", name: "CMR Consignment Note", issuer: "Carrier", mandatory: true });
    certs.push({ type: "TIR", name: "TIR Carnet (if cross-border transit)", issuer: "National guaranteeing association", mandatory: false });
  } else if (mode === "RAIL") {
    certs.push({ type: "CIM", name: "CIM Consignment Note", issuer: "Carrier", mandatory: true });
  }

  // Always include commercial invoice + packing list
  if (!certs.some((c) => c.type === "INVOICE")) {
    certs.unshift({ type: "INVOICE", name: "Commercial Invoice", issuer: "Seller", mandatory: true });
  }
  if (!certs.some((c) => c.type === "PACKING_LIST")) {
    certs.unshift({ type: "PACKING_LIST", name: "Packing List", issuer: "Seller", mandatory: true });
  }

  return {
    hsCode: hs,
    originCountry: origin,
    destCountry: dest,
    transportMode: mode,
    certificates: certs,
    computedAt: new Date().toISOString(),
  };
}

export function validateCertificate(
  certificateNumber: string,
  type: string,
): CertificateValidation {
  const num = String(certificateNumber ?? "").trim();
  const t = (type ?? "").toUpperCase().trim();

  if (!num) {
    return { certificateNumber: num, type: t, valid: false, issuer: null, expiryDate: null, errors: ["Certificate number is empty."] };
  }
  if (!t) {
    return { certificateNumber: num, type: t, valid: false, issuer: null, expiryDate: null, errors: ["Certificate type is required."] };
  }

  const fmt = CERT_FORMATS[t];
  if (!fmt) {
    return {
      certificateNumber: num, type: t, valid: false, issuer: null, expiryDate: null,
      errors: [`Unknown certificate type "${t}". Supported types: ${Object.keys(CERT_FORMATS).join(", ")}`],
    };
  }

  if (!fmt.pattern.test(num)) {
    return {
      certificateNumber: num, type: t, valid: false, issuer: null, expiryDate: null,
      errors: [`Certificate number "${num}" does not match the ${t} format. Issuer: ${fmt.issuer}.`],
    };
  }

  const expiry = fmt.validityDays > 0
    ? new Date(Date.now() + fmt.validityDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  return {
    certificateNumber: num,
    type: t,
    valid: true,
    issuer: fmt.issuer,
    expiryDate: expiry,
    errors: [],
  };
}

export function getCertificateTypes(hsCode: string, country: string): CertificateTypeList {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const cc = (country ?? "").toUpperCase().trim();

  const types: CertificateType[] = [];
  if (ch) {
    const key = `${String(ch).padStart(2, "0")}|${cc}`;
    if (CERT_RULES[key]) {
      for (const c of CERT_RULES[key]) {
        if (!types.some((t) => t.code === c.type)) {
          types.push({ code: c.type, name: c.name, issuer: c.issuer });
        }
      }
    }
  }

  return { hsCode: hs, country: cc, types };
}

export function listAllCertificateRules(): Array<{ hsChapter: number; country: string; certificates: CertificateRequirement[] }> {
  return Object.entries(CERT_RULES).map(([key, certs]) => {
    const [ch, country] = key.split("|");
    return { hsChapter: Number(ch), country, certificates: certs };
  });
}
