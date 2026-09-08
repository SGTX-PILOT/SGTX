// @ts-nocheck
/**
 * SGTX v17 §20 — TBT Engine (Technical Barriers to Trade)
 * ===========================================================================
 *
 * Returns TBT requirements (technical regulations, standards, labeling,
 * packaging, conformity assessment) for a (HS code, dest country)
 * combination. Different from SPS — TBT covers:
 *   - Product safety standards (e.g. CE Mark, FCC, BIS, SASO)
 *   - Energy efficiency labels (EU Energy Label, MEPS)
 *   - Packaging + material restrictions (REACH, RoHS)
 *   - Language requirements (e.g. Arabic labeling in EG, SA, AE)
 *   - Conformity assessment procedures (third-party testing, type approval)
 *
 * Reference:
 *   - WTO TBT Agreement (1995)
 *   - ISO/IEC + regional standards (CEN, CENELEC, ETSI, GCC Standardization Org)
 *   - Egyptian Organization for Standardization (EOS) Decrees
 *   - Saudi SASO COC programme + Saber platform
 *   - EU harmonised standards (e.g. EU Reg 2019/1794)
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface TbtRequirement {
  measure: string;
  authority: string;
  standard: string;
  mandatory: boolean;
  notes?: string;
}

export interface TbtRequirementsResult {
  hsCode: string;
  destCountry: string;
  requirements: TbtRequirement[];
  computedAt: string;
}

export interface TbtComplianceCheck {
  hsCode: string;
  destCountry: string;
  compliant: boolean;
  missing: string[];
  verified: string[];
  notes: string;
}

// ── TBT rules reference ──────────────────────────────────────────────────
// Format: `${hsChapter}|${destCountry}` → TbtRequirement[]

const TBT_RULES: Record<string, TbtRequirement[]> = {
  // EU — Machinery (chapter 84)
  "84|DE": [
    { measure: "CE_MARK", authority: "Notified Body (where Annex IV)", standard: "EU Machinery Directive 2006/42/EC", mandatory: true },
    { measure: "EMC_TEST", authority: "Notified Body / self-declaration", standard: "EMC Directive 2014/30/EU", mandatory: true, notes: "Electromagnetic compatibility for electrical equipment." },
    { measure: "REACH_SVHC", authority: "Manufacturer declaration", standard: "EU Reg 1907/2006 (REACH)", mandatory: true, notes: "Substances of Very High Concern declaration." },
    { measure: "OPERATING_MANUAL_DE", authority: "Manufacturer", standard: "Machinery Directive Annex I (1.7.4)", mandatory: true, notes: "Operating manual must be supplied in German." },
  ],
  // EU — Electrical/electronics (chapter 85)
  "85|DE": [
    { measure: "CE_MARK", authority: "Notified Body (for some categories)", standard: "LVD 2014/35/EU + EMC 2014/30/EU + RED 2014/53/EU", mandatory: true },
    { measure: "ROHS", authority: "Manufacturer declaration", standard: "EU 2011/65/EU + 2015/863 (RoHS 2)", mandatory: true, notes: "Restriction of 10 hazardous substances in EEE." },
    { measure: "REACH_SVHC", authority: "Manufacturer declaration", standard: "EU Reg 1907/2006", mandatory: true },
    { measure: "WEEE", authority: "Manufacturer", standard: "EU 2012/19/EU", mandatory: true, notes: "WEEE registration + recycling scheme required." },
    { measure: "ENERGY_LABEL", authority: "Manufacturer", standard: "EU Reg 2017/1369 (Energy Label)", mandatory: true, notes: "Energy efficiency label required for many product categories." },
    { measure: "ECO_DESIGN", authority: "Manufacturer", standard: "EU Reg 2009/125/EC (Ecodesign)", mandatory: true, notes: "Minimum energy performance standards (MEPS) for many categories." },
  ],
  // EU — Vehicles (chapter 87)
  "87|DE": [
    { measure: "TYPE_APPROVAL", authority: "Manufacturer (Notified Body for some)", standard: "EU Reg 2018/858 (Type Approval)", mandatory: true, notes: "Certificate of Conformity (CoC) required." },
    { measure: "WLTP", authority: "Manufacturer", standard: "EU Reg 2019/631 (CO2 emissions)", mandatory: true, notes: "WLTP CO2 declaration required." },
    { measure: "ECE_R100", authority: "Notified Body", standard: "UN ECE R100 (battery safety)", mandatory: true, notes: "For EVs — battery safety test report." },
  ],
  // EU — Toys (chapter 95)
  "95|DE": [
    { measure: "CE_MARK", authority: "Manufacturer (Notified Body for some)", standard: "Toy Safety Directive 2009/48/EC", mandatory: true },
    { measure: "EN71_TEST", authority: "Accredited test lab", standard: "EN 71 series", mandatory: true, notes: "Physical, mechanical, flammability, chemical tests." },
    { measure: "REACH_SVHC", authority: "Manufacturer declaration", standard: "EU Reg 1907/2006", mandatory: true, notes: "Phthalate limits strictly enforced for toys." },
  ],
  // Egypt — labeling + EOS standards (all consumer products)
  "84|EG": [
    { measure: "ARABIC_LABEL", authority: "Egyptian Organization for Standardization (EOS)", standard: "Decree 770/2019 (Arabic labeling)", mandatory: true, notes: "All consumer products require Arabic labeling." },
    { measure: "EOS_CONFORMITY", authority: "EOS / GOEIC", standard: "Egyptian Standards (ES) conformity", mandatory: true, notes: "Some chapters require EOS conformity assessment." },
  ],
  "85|EG": [
    { measure: "ARABIC_LABEL", authority: "EOS", standard: "Decree 770/2019", mandatory: true },
    { measure: "EAC_OR_NEMKO", authority: "Accredited body", standard: "IEC 60335 (household safety)", mandatory: true, notes: "IEC test report accepted for electrical household goods." },
  ],
  "62|EG": [
    { measure: "ARABIC_LABEL", authority: "EOS", standard: "Decree 770/2019 (Arabic textile labeling)", mandatory: true, notes: "Fiber composition + care instructions in Arabic." },
    { measure: "COTTON_CONTENT_DECL", authority: "Manufacturer", standard: "ES 153 (textile labeling)", mandatory: true },
  ],
  // Saudi Arabia — SASO COC + Saber
  "85|SA": [
    { measure: "SASO_COC", authority: "SASO-approved conformity body", standard: "SASO COC programme", mandatory: true, notes: "Certificate of Conformity required for customs clearance." },
    { measure: "SABER_REGISTRATION", authority: "SASO", standard: "SABER platform", mandatory: true, notes: "Product + shipment registration via Saber." },
    { measure: "ARABIC_LABEL", authority: "SASO", standard: "SASO GSO 1016 (Arabic labeling)", mandatory: true },
    { measure: "IEC_TEST", authority: "Accredited test lab", standard: "IEC 60335", mandatory: true },
  ],
  "62|SA": [
    { measure: "SASO_COC", authority: "SASO-approved body", standard: "SASO COC", mandatory: true },
    { measure: "SABER_REGISTRATION", authority: "SASO", standard: "SABER platform", mandatory: true },
    { measure: "ARABIC_LABEL", authority: "SASO", standard: "GSO 1016", mandatory: true },
  ],
  // GCC (covers SA, AE, BH, KW, QA, OM) — GSO conformity
  "84|AE": [
    { measure: "GSO_CONFORMITY", authority: "GSO-approved body", standard: "GSO standards", mandatory: true },
    { measure: "ARABIC_LABEL", authority: "ESMA (Emirates Authority for Standardization and Metrology)", standard: "GSO 1016", mandatory: true },
    { measure: "ECAS", authority: "ESMA", standard: "ECAS (Emirates Conformity Assessment Scheme)", mandatory: true, notes: "ECAS registration for electrical equipment." },
  ],
  "85|AE": [
    { measure: "ECAS", authority: "ESMA", standard: "ECAS", mandatory: true },
    { measure: "ARABIC_LABEL", authority: "ESMA", standard: "GSO 1016", mandatory: true },
    { measure: "GSO_CONFORMITY", authority: "GSO-approved body", standard: "GSO standards", mandatory: true },
  ],
  // China — CCC mark
  "84|CN": [
    { measure: "CCC_MARK", authority: "CNCA-approved certification body", standard: "CCC (China Compulsory Certification)", mandatory: true, notes: "Required for many categories of industrial + consumer equipment." },
    { measure: "GB_STANDARD", authority: "Manufacturer", standard: "GB (Guo Biao) national standards", mandatory: true, notes: "Compliance with applicable GB standards required." },
    { measure: "CHINESE_LABEL", authority: "Manufacturer", standard: "GB 5296 (labeling)", mandatory: true, notes: "Simplified Chinese labeling required." },
  ],
  "85|CN": [
    { measure: "CCC_MARK", authority: "CNCA-approved body", standard: "CCC", mandatory: true },
    { measure: "GB_STANDARD", authority: "Manufacturer", standard: "GB standards", mandatory: true },
    { measure: "CHINESE_LABEL", authority: "Manufacturer", standard: "GB 5296", mandatory: true },
  ],
  // India — BIS hallmarking + ISI mark
  "71|IN": [
    { measure: "BIS_HALLMARK", authority: "BIS (Bureau of Indian Standards)", standard: "IS 1417 (gold hallmarking)", mandatory: true, notes: "Mandatory hallmarking for gold jewellery." },
    { measure: "BIS_REG", authority: "BIS", standard: "BIS Registration Scheme", mandatory: true },
  ],
  "85|IN": [
    { measure: "BIS_REG", authority: "BIS", standard: "BIS Registration (CRS)", mandatory: true, notes: "Compulsory Registration Scheme for many electronics." },
    { measure: "HINDI_LABEL", authority: "Manufacturer", standard: "Legal Metrology Act 2009", mandatory: true, notes: "Mandatory declarations in Hindi + English." },
  ],
  // US — FCC + UL + FDA (where applicable)
  "85|US": [
    { measure: "FCC", authority: "FCC (Telecom)", standard: "FCC Part 15 (unintentional radiators)", mandatory: true, notes: "FCC ID + SDoC required for most electronics." },
    { measure: "UL_LISTING", authority: "UL (Underwriters Laboratories)", standard: "UL standards", mandatory: false, notes: "Not legally mandatory but de-facto required for retailers." },
    { measure: "DOE_CEC", authority: "DOE / CEC", standard: "10 CFR 430 (energy conservation)", mandatory: true, notes: "DOE efficiency for many household appliances." },
  ],
  "84|US": [
    { measure: "OSHA_NRTL", authority: "OSHA NRTL", standard: "29 CFR 1910.7 (NRTL)", mandatory: true, notes: "NRTL-listed equipment required for workplace electrical goods." },
    { measure: "DOE_CEC", authority: "DOE / CEC", standard: "10 CFR 431", mandatory: true },
  ],
  // Packaging — REACH + EU packaging directive
  "22|DE": [
    { measure: "PACKAGING_REG_94_62", authority: "Manufacturer", standard: "EU 94/62/EC (Packaging Directive)", mandatory: true, notes: "Heavy metal limits in packaging (< 100 ppm Pb, Cd, Hg, Cr VI)." },
    { measure: "ARABIC_NOT_REQUIRED", authority: "N/A", standard: "N/A", mandatory: false, notes: "German labeling for end-consumer products." },
  ],
  "22|SA": [
    { measure: "SASO_COC", authority: "SASO-approved body", standard: "SASO COC", mandatory: true },
    { measure: "SABER_REGISTRATION", authority: "SASO", standard: "SABER", mandatory: true },
    { measure: "ARABIC_LABEL", authority: "SASO", standard: "GSO 1016", mandatory: true, notes: "Arabic labeling for ingredient list + alcohol content + expiry date." },
    { measure: "HALAL", authority: "SFDA-accredited halal certifier", standard: "GSO 993", mandatory: false, notes: "Required for beverages containing animal-derived ingredients." },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

// ── Public API ───────────────────────────────────────────────────────────

export function getTbtRequirements(
  hsCode: string,
  destCountry: string,
): TbtRequirementsResult {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const dest = (destCountry ?? "").toUpperCase().trim();

  let requirements: TbtRequirement[] = [];
  if (ch) {
    const key = `${String(ch).padStart(2, "0")}|${dest}`;
    requirements = TBT_RULES[key] ?? [];
  }

  return {
    hsCode: hs,
    destCountry: dest,
    requirements,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Validate TBT compliance by checking that the product spec declares all
 * mandatory TBT measures. `productSpec` is a list of declared measures /
 * certificates the user has (e.g. ["CE_MARK", "ROHS", "REACH_SVHC"]).
 */
export function validateTbtCompliance(
  hsCode: string,
  destCountry: string,
  productSpec: string[],
): TbtComplianceCheck {
  const hs = String(hsCode ?? "").trim();
  const dest = (destCountry ?? "").toUpperCase().trim();
  const specs = Array.isArray(productSpec) ? productSpec.map((s) => String(s ?? "").toUpperCase().trim()).filter(Boolean) : [];

  const reqs = getTbtRequirements(hs, dest).requirements;
  const mandatory = reqs.filter((r) => r.mandatory);

  const verified: string[] = [];
  const missing: string[] = [];
  for (const r of mandatory) {
    if (specs.includes(r.measure)) {
      verified.push(r.measure);
    } else {
      missing.push(r.measure);
    }
  }

  return {
    hsCode: hs,
    destCountry: dest,
    compliant: missing.length === 0,
    missing,
    verified,
    notes: missing.length === 0
      ? `All ${mandatory.length} mandatory TBT measures are covered by the supplied product spec.`
      : `${missing.length} mandatory TBT measure(s) missing: ${missing.join(", ")}.`,
  };
}

export function listAllTbtRules(): Array<{ hsChapter: number; country: string; requirements: TbtRequirement[] }> {
  return Object.entries(TBT_RULES).map(([key, reqs]) => {
    const [ch, country] = key.split("|");
    return { hsChapter: Number(ch), country, requirements: reqs };
  });
}
