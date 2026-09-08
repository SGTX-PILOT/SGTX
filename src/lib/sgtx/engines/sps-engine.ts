// @ts-nocheck
/**
 * SGTX v17 §20 — SPS Engine (Sanitary and Phytosanitary Measures)
 * ===========================================================================
 *
 * Returns SPS requirements for a (HS code, origin, dest) combination. SPS
 * measures protect human, animal, and plant life from pests, diseases, and
 * contaminants. Different from CERTIFICATE engine — SPS measures include:
 *   - Pest Risk Analysis (PRA)
 *   - Heat treatment / cold treatment for fruit flies
 *   - Fumigation (methyl bromide, phosphine)
 *   - Quarantine periods
 *   - Microbiological testing (salmonella, listeria)
 *   - MRL (Maximum Residue Limit) verification
 *
 * Reference:
 *   - WTO SPS Agreement (1995)
 *   - Codex Alimentarius standards
 *   - IPPC (International Plant Protection Convention) ISPMs
 *   - WOAH (World Organisation for Animal Health) Terrestrial/Aquatic Codes
 *   - Egyptian Decree 770/2019 + GSO 1016 standards
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface SpsRequirement {
  measure: string;
  authority: string;
  standard: string;
  mandatory: boolean;
  notes?: string;
}

export interface SpsRequirementsResult {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  requirements: SpsRequirement[];
  computedAt: string;
}

export interface SpsComplianceCheck {
  hsCode: string;
  originCountry: string;
  destCountry: string;
  compliant: boolean;
  missing: string[];
  verified: string[];
  notes: string;
}

// ── SPS rules reference ──────────────────────────────────────────────────
// Format: `${hsChapter}|${destCountry}` → SpsRequirement[]

const SPS_RULES: Record<string, SpsRequirement[]> = {
  // Egypt — fresh produce (chapter 8)
  "08|EG": [
    { measure: "PEST_RISK_ANALYSIS", authority: "MALR / CA-PQ", standard: "IPPC ISPM 11 (Pest Risk Analysis)", mandatory: true, notes: "PRA required for first-time imports of new commodities." },
    { measure: "PHYTOSANITARY_CERT", authority: "NPPO of origin", standard: "IPPC ISPM 12", mandatory: true, notes: "Phytosanitary certificate required at port of entry." },
    { measure: "COLD_TREATMENT", authority: "MALR / CA-PQ", standard: "ISPM 35 (cold treatment for fruit flies)", mandatory: true, notes: "Citrus + stone fruit require cold treatment (0°C for 14 days)." },
    { measure: "MRL_PESTICIDES", authority: "MALR / APC", standard: "Codex MRLs + Egyptian pesticide residue limits (Decree 770/2019)", mandatory: true, notes: "MRL compliance required for all fresh produce." },
    { measure: "QUARANTINE_INSPECTION", authority: "MALR Quarantine", standard: "ISPM 23 (inspection)", mandatory: true, notes: "100% quarantine inspection at port of entry." },
  ],
  // EU — fresh produce (chapter 8)
  "08|DE": [
    { measure: "PHYTOSANITARY_CERT", authority: "NPPO of origin", standard: "EU Reg 2016/2031 (Plant Health Law)", mandatory: true },
    { measure: "PEST_RISK_ANALYSIS", authority: "JKI / EFSA", standard: "IPPC ISPM 11", mandatory: true, notes: "Required for new commodities + high-risk plants." },
    { measure: "MRL_PESTICIDES", authority: "EFSA", standard: "EU Reg 396/2005 (MRLs)", mandatory: true, notes: "MRL compliance strictly enforced; EFSA publishes weekly RASFF alerts." },
    { measure: "COLD_TREATMENT", authority: "EU competent authority", standard: "ISPM 35", mandatory: false, notes: "Required only for fruit-fly host commodities from infested areas." },
    { measure: "PLANT_PASSPORT", authority: "EU competent authority", standard: "EU Reg 2016/2031", mandatory: true, notes: "Plant passport needed for movement within EU after import." },
  ],
  // Egypt — fresh vegetables (chapter 7)
  "07|EG": [
    { measure: "PHYTOSANITARY_CERT", authority: "NPPO of origin", standard: "IPPC ISPM 12", mandatory: true },
    { measure: "MRL_PESTICIDES", authority: "MALR / APC", standard: "Codex MRLs + Egyptian Decree 770/2019", mandatory: true },
    { measure: "QUARANTINE_INSPECTION", authority: "MALR", standard: "ISPM 23", mandatory: true },
  ],
  "07|DE": [
    { measure: "PHYTOSANITARY_CERT", authority: "NPPO of origin", standard: "EU Reg 2016/2031", mandatory: true },
    { measure: "MRL_PESTICIDES", authority: "EFSA", standard: "EU Reg 396/2005", mandatory: true },
  ],
  // Meat products (chapter 2) — heavy SPS regime
  "02|DE": [
    { measure: "VET_HEALTH_CERT", authority: "Veterinary authority of origin", standard: "EU Reg 2016/429 (Animal Health Law) + Reg 853/2004 (Hygiene)", mandatory: true },
    { measure: "ABATTOIR_APPROVAL", authority: "Competent authority of origin country", standard: "EU equivalence list (Reg 2019/628)", mandatory: true, notes: "Establishment must be on the EU-approved list for the species." },
    { measure: "SALMONELLA_TESTING", authority: "Manufacturer / lab", standard: "EU Reg 2073/2005 (microbiological criteria)", mandatory: true, notes: "Salmonella absent in 25g for poultry; Listeria absent in 25g for RTE." },
    { measure: "COLD_CHAIN", authority: "Carrier", standard: "EU Reg 852/2004 (food hygiene)", mandatory: true, notes: "Maintain ≤ 4°C (poultry) or ≤ 7°C (red meat) throughout the cold chain." },
    { measure: "TRACES_CHED", authority: "EU BIP", standard: "EU Reg 2017/625 (official controls)", mandatory: true, notes: "Common Health Entry Document required at Border Inspection Post." },
    { measure: "HORMONES_CONTROL", authority: "Veterinary authority", standard: "EU Reg 2003/74 (hormone ban)", mandatory: true, notes: "Hormone-treated beef is BANNED in EU." },
    { measure: "TSE_CONTROL", authority: "Veterinary authority", standard: "EU Reg 999/2001 (TSE)", mandatory: true, notes: "BSE Specified Risk Material removal required." },
  ],
  "02|EG": [
    { measure: "VET_HEALTH_CERT", authority: "GOVS", standard: "Egyptian Law 4/1994", mandatory: true },
    { measure: "HALAL", authority: "Accredited halal certifier", standard: "Egyptian standards for halal slaughter", mandatory: true },
    { measure: "SALMONELLA_TESTING", authority: "Manufacturer / lab", standard: "Egyptian Standard 1534", mandatory: true },
    { measure: "COLD_CHAIN", authority: "Carrier", standard: "≤ 4°C throughout", mandatory: true },
  ],
  "02|SA": [
    { measure: "VET_HEALTH_CERT", authority: "Veterinary authority of origin", standard: "GSO 1016", mandatory: true },
    { measure: "HALAL", authority: "SFDA-accredited halal certifier", standard: "GSO 993 / 994 (halal)", mandatory: true },
    { measure: "SALMONELLA_TESTING", authority: "Manufacturer / lab", standard: "GSO 20", mandatory: true },
    { measure: "COLD_CHAIN", authority: "Carrier", standard: "≤ 4°C throughout", mandatory: true },
  ],
  // Dairy + eggs (chapter 4) — heavy SPS
  "04|DE": [
    { measure: "VET_HEALTH_CERT", authority: "Veterinary authority of origin", standard: "EU Reg 853/2004", mandatory: true },
    { measure: "SALMONELLA_TESTING", authority: "Manufacturer", standard: "EU Reg 2073/2005", mandatory: true },
    { measure: "LISTERIA_TESTING", authority: "Manufacturer", standard: "EU Reg 2073/2005 (RTE)", mandatory: true, notes: "Required for ready-to-eat dairy products." },
    { measure: "MILK_PASTEURISATION", authority: "Manufacturer", standard: "EU Reg 853/2004 (pasteurisation)", mandatory: true, notes: "Heat treatment verified at ≥ 72°C for 15 sec." },
    { measure: "AFLATOXIN_M1", authority: "Manufacturer / lab", standard: "EU Reg 1881/2006 (contaminants)", mandatory: true, notes: "Max 0.05 µg/kg for milk." },
  ],
  // Fish + aquatic — cold chain + IUU + histamine
  "03|DE": [
    { measure: "CATCH_CERT", authority: "Flag state authority", standard: "EU Reg 1005/2008 (IUU)", mandatory: true },
    { measure: "HISTAMINE_TESTING", authority: "Manufacturer / lab", standard: "EU Reg 2073/2005 (histamine ≤ 100mg/kg for scombroid)", mandatory: true, notes: "Required for scombroid fish (tuna, mackerel)." },
    { measure: "COLD_CHAIN", authority: "Carrier", standard: "≤ 0°C (frozen) or ≤ 4°C (chilled)", mandatory: true },
    { measure: "HEAVY_METALS", authority: "Lab", standard: "EU Reg 1881/2006 (Hg, Pb, Cd)", mandatory: true, notes: "Mercury limits strict for predatory fish." },
  ],
  "03|EG": [
    { measure: "CATCH_CERT", authority: "Flag state authority", standard: "FAO Port State Measures Agreement", mandatory: true },
    { measure: "HISTAMINE_TESTING", authority: "Manufacturer / lab", standard: "Egyptian Standard 1544", mandatory: true },
    { measure: "COLD_CHAIN", authority: "Carrier", standard: "≤ 0°C (frozen) or ≤ 4°C (chilled)", mandatory: true },
  ],
  // Pharmaceuticals (chapter 30) — sterile / endotoxin testing
  "30|DE": [
    { measure: "GMP", authority: "EU GMP inspectorate", standard: "EU GMP guidelines (Eudralex Vol 4)", mandatory: true },
    { measure: "STERILITY_TEST", authority: "Manufacturer QC", standard: "Ph. Eur. 2.6.1 (sterility)", mandatory: true, notes: "Required for sterile products." },
    { measure: "ENDOTOXIN_TEST", authority: "Manufacturer QC", standard: "Ph. Eur. 2.6.14 (LAL)", mandatory: true, notes: "Required for parenteral products." },
    { measure: "BIOBURDEN_TEST", authority: "Manufacturer QC", standard: "Ph. Eur. 2.6.12", mandatory: true },
  ],
  "30|EG": [
    { measure: "GMP", authority: "EDA GMP inspectorate", standard: "WHO GMP guidelines", mandatory: true },
    { measure: "STERILITY_TEST", authority: "Manufacturer QC", standard: "USP <71> / Ph. Eur. 2.6.1", mandatory: true },
    { measure: "ENDOTOXIN_TEST", authority: "Manufacturer QC", standard: "USP <85> / Ph. Eur. 2.6.14", mandatory: true },
  ],
  // Cereals (chapter 10) — mycotoxins
  "10|DE": [
    { measure: "MYCOTOXIN_TEST", authority: "Lab", standard: "EU Reg 1881/2006 (aflatoxin B1, DON, zearalenone, ochratoxin A)", mandatory: true, notes: "Strict EU limits for cereals + cereal products." },
    { measure: "PESTICIDE_MRL", authority: "Lab", standard: "EU Reg 396/2005", mandatory: true },
    { measure: "PHYTOSANITARY_CERT", authority: "NPPO of origin", standard: "EU Reg 2016/2031", mandatory: false },
  ],
  "10|EG": [
    { measure: "MYCOTOXIN_TEST", authority: "Lab", standard: "Egyptian Standard 1532 (aflatoxin)", mandatory: true },
    { measure: "PESTICIDE_MRL", authority: "Lab", standard: "Codex MRLs", mandatory: true },
  ],
  // Cocoa + cocoa preparations (chapter 18) — heavy metals + microbiology
  "18|DE": [
    { measure: "HEAVY_METALS", authority: "Lab", standard: "EU Reg 1881/2006 (Cd, Pb)", mandatory: true, notes: "Cadmium limits for cocoa powder (0.6 mg/kg)." },
    { measure: "MICROBIOLOGY", authority: "Manufacturer", standard: "EU Reg 2073/2005", mandatory: true },
    { measure: "MELAMINE_TEST", authority: "Lab", standard: "EU Reg 1881/2006", mandatory: false, notes: "Risk-based, particularly for dairy-containing chocolate." },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────

function chapterOf(hs?: string): number | null {
  const n = parseInt((hs ?? "").slice(0, 2), 10);
  return Number.isFinite(n) && n >= 1 && n <= 97 ? n : null;
}

// ── Public API ───────────────────────────────────────────────────────────

export function getSpsRequirements(
  hsCode: string,
  originCountry: string,
  destCountry: string,
): SpsRequirementsResult {
  const hs = String(hsCode ?? "").trim();
  const ch = chapterOf(hs);
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();

  let requirements: SpsRequirement[] = [];
  if (ch) {
    const key = `${String(ch).padStart(2, "0")}|${dest}`;
    requirements = SPS_RULES[key] ?? [];
  }

  return {
    hsCode: hs,
    originCountry: origin,
    destCountry: dest,
    requirements,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Validate SPS compliance by checking that all mandatory SPS measures have
 * a corresponding document / certificate in the supplied documents list.
 *
 * `documents` is a list of document types the user claims to have (e.g.
 * ["PHYTOSANITARY_CERT", "MRL_PESTICIDES_REPORT", "COLD_TREATMENT_LOG"]).
 */
export function validateSpsCompliance(
  hsCode: string,
  originCountry: string,
  destCountry: string,
  documents: string[],
): SpsComplianceCheck {
  const hs = String(hsCode ?? "").trim();
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destCountry ?? "").toUpperCase().trim();
  const docs = Array.isArray(documents) ? documents.map((d) => String(d ?? "").toUpperCase().trim()).filter(Boolean) : [];

  const reqs = getSpsRequirements(hs, origin, dest).requirements;
  const mandatory = reqs.filter((r) => r.mandatory);

  const verified: string[] = [];
  const missing: string[] = [];
  for (const r of mandatory) {
    if (docs.includes(r.measure)) {
      verified.push(r.measure);
    } else {
      missing.push(r.measure);
    }
  }

  return {
    hsCode: hs,
    originCountry: origin,
    destCountry: dest,
    compliant: missing.length === 0,
    missing,
    verified,
    notes: missing.length === 0
      ? `All ${mandatory.length} mandatory SPS measures are covered by the supplied documents.`
      : `${missing.length} mandatory SPS measure(s) missing: ${missing.join(", ")}.`,
  };
}

export function listAllSpsRules(): Array<{ hsChapter: number; country: string; requirements: SpsRequirement[] }> {
  return Object.entries(SPS_RULES).map(([key, reqs]) => {
    const [ch, country] = key.split("|");
    return { hsChapter: Number(ch), country, requirements: reqs };
  });
}
