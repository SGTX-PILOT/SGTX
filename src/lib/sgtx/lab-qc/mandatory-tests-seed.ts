// @ts-nocheck — defensive; the seed map is a static reference table.
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SGTX v17 §6 — Mandatory / Recommended / Optional Lab Tests & QC Inspections
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This module is a STATIC REFERENCE TABLE (a "seed" in the data sense, not
 * a DB seed script). It maps HS-code prefixes to the lab test types and QC
 * inspection types that SGTX mandates for agricultural exports from a given
 * origin → destination route.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * v17 §6 — Mandatory / Recommended / Optional tiers
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The Buyer Workflow §6 Step 5 (Lab Test Requirements) classifies each test
 * into one of three tiers:
 *
 *   • MANDATORY  — the trade CANNOT proceed without these tests. For
 *                  perishable commodities, mandatory tests are LOCKED
 *                  (the buyer cannot remove them). Example: pesticide
 *                  residue (MRL) for fresh/frozen fruit entering the EU.
 *
 *   • RECOMMENDED — strongly advised for the commodity/route, but the
 *                   buyer may opt out. Example: heavy-metals panel for
 *                   root vegetables from non-EU origins.
 *
 *   • OPTIONAL   — buyer-added extras. The buyer may add any additional
 *                  test the chosen lab offers.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RIA-driven mandatory tests
 * ────────────────────────────────────────────────────────────────────────────
 *
 * "RIA" = Regulation Import Authority. The destination country's import
 * regulator publishes a list of mandatory tests for each commodity.
 * For the v17 Phase 1 (Agricultural Exports MVP) we encode the most common
 * authorities: EU (Regulation (EC) 396/2005 — pesticide MRLs),
 * Codex Alimentarius (international), and Egypt NFSA.
 *
 * For HS 0811 (frozen strawberries) → EU: pesticide residue + microbiological
 * + heavy metals are MANDATORY. The buyer cannot opt out.
 *
 * For HS 0806 (fresh grapes) → EU: pesticide residue + microbiological +
 * sulphites (SO2) are MANDATORY.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Capability codes
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The `tests` and `types` arrays below use the same capability codes that the
 * Service Provider Capability Model (v17 §11) registers in the
 * ServiceCapabilityDefinition table. This keeps the lab-test catalogue aligned
 * with the provider capability catalogue: a provider that covers a country for
 * capability `PESTICIDE_RESIDUE` is a valid match for the mandatory
 * PESTICIDE_RESIDUE test on a perishable 0811 shipment.
 *
 * Lab test codes (group LAB):
 *   PESTICIDE_RESIDUE   — Multi-residue pesticide panel (EU MRL + Codex MRL)
 *   MICROBIOLOGICAL     — E. coli, Salmonella, Listeria, Yeast & Mould
 *   HEAVY_METALS        — Pb, Cd, As, Hg
 *   MYCOTOXIN           — Aflatoxin, Ochratoxin, DON
 *   OCHRATOXIN          — Ochratoxin A (coffee, dried fruit)
 *   SULPHITE            — SO2 (dried fruit, grapes)
 *   FUNGICIDE           — Post-harvest fungicide residue (apples, citrus)
 *   NUTRITION           — Nutritional label claim verification
 *   GMO                 — GMO screening
 *   ALLERGEN            — Allergen panel
 *   AUTHENTICITY         — Origin / varietal authenticity (DNA / isotopes)
 *
 * QC inspection codes (group QC):
 *   PRE_SHIPMENT_QC     — Pre-shipment quality inspection (origin warehouse)
 *   LOADING_SUPERVISION — Container loading supervision (origin port)
 *   DESTINATION_QC     — Destination-side quality inspection
 *   SAMPLING            — Draw samples per ISO 2859 / AQL plan
 *   COLD_CHAIN_AUDIT    — Cold-chain temperature & humidity audit
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Non-marketplace guardrail
 * ────────────────────────────────────────────────────────────────────────────
 *
 * This module is a pure data table. It NEVER recommends specific providers.
 * It returns test types and tiers — the caller (the trade-request wizard or
 * the validate endpoints) uses it to compute which tests the buyer must lock
 * in. Provider selection is a separate, explicit step.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// Lab test types
// ────────────────────────────────────────────────────────────────────────────

export type LabTestType =
  | "PESTICIDE_RESIDUE"
  | "MICROBIOLOGICAL"
  | "HEAVY_METALS"
  | "MYCOTOXIN"
  | "OCHRATOXIN"
  | "SULPHITE"
  | "FUNGICIDE"
  | "NUTRITION"
  | "GMO"
  | "ALLERGEN"
  | "AUTHENTICITY";

export type QcInspectionType =
  | "PRE_SHIPMENT_QC"
  | "LOADING_SUPERVISION"
  | "DESTINATION_QC"
  | "SAMPLING"
  | "COLD_CHAIN_AUDIT";

export type TestTier = "MANDATORY" | "RECOMMENDED" | "OPTIONAL";

export interface MandatoryLabTestEntry {
  /** HS code prefix (4-digit minimum, may extend to 6 or 10 digits). */
  hsPrefix: string;
  description: string;
  /** Tests that are MANDATORY for this commodity. */
  tests: LabTestType[];
  /**
   * When true, the mandatory tests are LOCKED for perishable commodities —
   * the buyer cannot remove them. v17 §6 Step 5: "for perishables, mandatory
   * lab tests are locked."
   */
  mandatory_for_perishable: boolean;
  /** Recommended (not mandatory) tests for this commodity. */
  recommended?: LabTestType[];
  /** Source regulation(s) that drive the mandatory tier. */
  source_regulations?: string[];
}

export interface MandatoryQcInspectionEntry {
  hsPrefix: string;
  description: string;
  types: QcInspectionType[];
  /** Whether QC is MANDATORY for this commodity (e.g. EU perishable imports). */
  mandatory?: boolean;
  source_regulations?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// MANDATORY_LAB_TESTS — HS-code prefix → mandatory tests map
// ────────────────────────────────────────────────────────────────────────────
//
// Lookup is by LONGEST-MATCHING PREFIX. The caller passes the full HS code
// (e.g. "081110") and the engine walks the map from longest prefix to
// shortest to find the first match. This means "0811" matches both
// "081110" (frozen strawberries) and "081120" (frozen raspberries) — which
// is intentional: the EU MRL regulation applies to all frozen fruit under
// 0811.
//
// The seeds below cover the v17 Phase 1 priority commodities (the
// Egyptian agricultural export catalogue) plus the most common HS-08
// (fruit & vegetables) and HS-09 (coffee, spices) entries.
// ────────────────────────────────────────────────────────────────────────────

export const MANDATORY_LAB_TESTS: Record<string, MandatoryLabTestEntry> = {
  // ── HS-08: Fruit & vegetables (fresh, frozen, dried) ───────────────────
  "0811": {
    hsPrefix: "0811",
    description: "Frozen fruit and berries (strawberries, raspberries, mango)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS"],
    mandatory_for_perishable: true,
    recommended: ["MYCOTOXIN", "NUTRITION"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
      "EU Regulation (EC) 2073/2005 — Microbiological criteria",
      "EU Regulation (EC) 1881/2006 — Heavy metals",
    ],
  },
  "0806": {
    hsPrefix: "0806",
    description: "Fresh grapes (table grapes)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "SULPHITE"],
    mandatory_for_perishable: true,
    recommended: ["FUNGICIDE"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
      "EU Regulation (EC) 1333/2008 — Sulphites (SO2)",
    ],
  },
  "0808": {
    hsPrefix: "0808",
    description: "Fresh apples and pears (pome fruit)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "FUNGICIDE"],
    mandatory_for_perishable: true,
    recommended: ["HEAVY_METALS"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
      "EU Regulation (EC) 2073/2005 — Microbiological criteria",
    ],
  },
  "0805": {
    hsPrefix: "0805",
    description: "Fresh citrus (oranges, lemons, mandarins)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "FUNGICIDE"],
    mandatory_for_perishable: true,
    recommended: ["HEAVY_METALS", "MYCOTOXIN"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
      "EU Regulation (EC) 2073/2005 — Microbiological criteria",
    ],
  },
  "0809": {
    hsPrefix: "0809",
    description: "Fresh stone fruit (peaches, plums, cherries, apricots)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL"],
    mandatory_for_perishable: true,
    recommended: ["FUNGICIDE", "HEAVY_METALS"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },
  "0810": {
    hsPrefix: "0810",
    description: "Other fresh fruit (berries, kiwi, persimmon, etc.)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL"],
    mandatory_for_perishable: true,
    recommended: ["HEAVY_METALS", "MYCOTOXIN"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },
  "0813": {
    hsPrefix: "0813",
    description: "Dried fruit (dates, apricots, figs, prunes)",
    tests: ["PESTICIDE_RESIDUE", "SULPHITE", "MICROBIOLOGICAL"],
    mandatory_for_perishable: false,
    recommended: ["MYCOTOXIN", "OCHRATOXIN"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
      "EU Regulation (EC) 1333/2008 — Sulphites",
      "EU Regulation (EC) 1881/2006 — Aflatoxins in dried fruit",
    ],
  },
  "0814": {
    hsPrefix: "0814",
    description: "Dried citrus peel & melon peel",
    tests: ["PESTICIDE_RESIDUE", "SULPHITE"],
    mandatory_for_perishable: false,
    recommended: ["MICROBIOLOGICAL"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },
  "0801": {
    hsPrefix: "0801",
    description: "Coconut, Brazil nuts, cashew — fresh or dried",
    tests: ["MICROBIOLOGICAL", "MYCOTOXIN"],
    mandatory_for_perishable: false,
    recommended: ["PESTICIDE_RESIDUE", "HEAVY_METALS"],
    source_regulations: ["EU Regulation (EC) 1881/2006 — Aflatoxins"],
  },
  "0802": {
    hsPrefix: "0802",
    description: "Other nuts (almonds, hazelnuts, walnuts, pistachios)",
    tests: ["MICROBIOLOGICAL", "MYCOTOXIN", "HEAVY_METALS"],
    mandatory_for_perishable: false,
    recommended: ["PESTICIDE_RESIDUE"],
    source_regulations: [
      "EU Regulation (EC) 1881/2006 — Aflatoxins in nuts",
      "EU Regulation (EC) 2073/2005 — Microbiological criteria",
    ],
  },
  "0811.10": {
    hsPrefix: "0811.10",
    description: "Strawberries, frozen",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS"],
    mandatory_for_perishable: true,
    recommended: ["MYCOTOXIN"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs (strawberries)",
      "EU Regulation (EC) 2073/2005 — Salmonella, Listeria",
    ],
  },

  // ── HS-09: Coffee, tea, spices ─────────────────────────────────────────
  "0901": {
    hsPrefix: "0901",
    description: "Coffee (roasted, green, decaffeinated)",
    tests: ["PESTICIDE_RESIDUE", "OCHRATOXIN", "HEAVY_METALS"],
    mandatory_for_perishable: false,
    recommended: ["MYCOTOXIN", "MICROBIOLOGICAL"],
    source_regulations: [
      "EU Regulation (EC) 466/2001 — Ochratoxin A in roasted coffee (3 µg/kg)",
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
    ],
  },
  "0902": {
    hsPrefix: "0902",
    description: "Tea (green, black, fermented)",
    tests: ["PESTICIDE_RESIDUE", "HEAVY_METALS"],
    mandatory_for_perishable: false,
    recommended: ["MICROBIOLOGICAL", "MYCOTOXIN"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },
  "0904": {
    hsPrefix: "0904",
    description: "Pepper (Piper spp.), dry",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "MYCOTOXIN"],
    mandatory_for_perishable: false,
    recommended: ["HEAVY_METALS"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },
  "0910": {
    hsPrefix: "0910",
    description: "Ginger, turmeric, cumin, caraway (dried spices)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL"],
    mandatory_for_perishable: false,
    recommended: ["MYCOTOXIN", "HEAVY_METALS"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },

  // ── HS-07: Vegetables (fresh, frozen, dried) ───────────────────────────
  "0701": {
    hsPrefix: "0701",
    description: "Fresh potatoes",
    tests: ["PESTICIDE_RESIDUE"],
    mandatory_for_perishable: false,
    recommended: ["HEAVY_METALS", "MICROBIOLOGICAL"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },
  "0710": {
    hsPrefix: "0710",
    description: "Frozen vegetables (peas, beans, corn)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL"],
    mandatory_for_perishable: true,
    recommended: ["HEAVY_METALS"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
      "EU Regulation (EC) 2073/2005 — Microbiological criteria",
    ],
  },
  "0712": {
    hsPrefix: "0712",
    description: "Dried vegetables (onions, mushrooms, garlic)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL"],
    mandatory_for_perishable: false,
    recommended: ["MYCOTOXIN", "SULPHITE"],
    source_regulations: ["EU Regulation (EC) 396/2005 — Pesticide MRLs"],
  },
  "0713": {
    hsPrefix: "0713",
    description: "Dried leguminous vegetables (peas, beans, lentils)",
    tests: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "MYCOTOXIN"],
    mandatory_for_perishable: false,
    recommended: ["HEAVY_METALS"],
    source_regulations: [
      "EU Regulation (EC) 396/2005 — Pesticide MRLs",
      "EU Regulation (EC) 1881/2006 — Aflatoxins",
    ],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// MANDATORY_QC_INSPECTIONS — HS-code prefix → QC inspection types map
// ────────────────────────────────────────────────────────────────────────────
//
// v17 §6 Step 6 (QC Inspection Request): for perishable commodities, the
// buyer should request a PRE_SHIPMENT_QC + LOADING_SUPERVISION combination
// (covering both the warehouse quality check and the container loading
// seal). DESTINATION_QC is optional but recommended for high-value cold
// chains.
// ────────────────────────────────────────────────────────────────────────────

export const MANDATORY_QC_INSPECTIONS: Record<string, MandatoryQcInspectionEntry> = {
  "0811": {
    hsPrefix: "0811",
    description: "Frozen fruit — pre-shipment + loading supervision mandatory",
    types: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION"],
    mandatory: true,
    source_regulations: [
      "v17 §6 Step 6 — perishable cold-chain QC",
      "ISO 2859-1 General Level II sampling",
    ],
  },
  "0806": {
    hsPrefix: "0806",
    description: "Fresh grapes — pre-shipment QC mandatory (cold-chain)",
    types: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "COLD_CHAIN_AUDIT"],
    mandatory: true,
    source_regulations: ["v17 §6 Step 6 — perishable cold-chain QC"],
  },
  "0808": {
    hsPrefix: "0808",
    description: "Fresh apples/pears — pre-shipment + loading supervision",
    types: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION"],
    mandatory: true,
    source_regulations: ["v17 §6 Step 6 — perishable cold-chain QC"],
  },
  "0805": {
    hsPrefix: "0805",
    description: "Fresh citrus — pre-shipment + loading supervision",
    types: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION"],
    mandatory: true,
    source_regulations: ["v17 §6 Step 6 — perishable cold-chain QC"],
  },
  "0809": {
    hsPrefix: "0809",
    description: "Fresh stone fruit — pre-shipment + loading supervision",
    types: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION"],
    mandatory: true,
    source_regulations: ["v17 §6 Step 6 — perishable cold-chain QC"],
  },
  "0810": {
    hsPrefix: "0810",
    description: "Other fresh fruit — pre-shipment QC recommended",
    types: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION"],
    mandatory: true,
  },
  "0813": {
    hsPrefix: "0813",
    description: "Dried fruit — pre-shipment QC recommended (not mandatory)",
    types: ["PRE_SHIPMENT_QC"],
    mandatory: false,
  },
  "0710": {
    hsPrefix: "0710",
    description: "Frozen vegetables — pre-shipment + loading supervision",
    types: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION"],
    mandatory: true,
  },
  "0901": {
    hsPrefix: "0901",
    description: "Coffee — pre-shipment QC optional (not perishable)",
    types: ["PRE_SHIPMENT_QC"],
    mandatory: false,
  },
  "0902": {
    hsPrefix: "0902",
    description: "Tea — pre-shipment QC optional",
    types: ["PRE_SHIPMENT_QC"],
    mandatory: false,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Perishable HS code prefixes (HS-08 fresh + frozen, HS-07 fresh + frozen)
// ────────────────────────────────────────────────────────────────────────────
//
// Used by the validator to decide whether a commodity is perishable when the
// Trade row has `coldChain=true` OR the HS code is in this set. v17 §6 Step 5
// states "for perishables, mandatory lab tests are locked."
// ────────────────────────────────────────────────────────────────────────────

export const PERISHABLE_HS_PREFIXES: string[] = [
  "0701", "0702", "0703", "0704", "0705", "0706", "0707", "0708", "0709",
  "0710", "0711", // fresh + frozen vegetables
  "0801", "0802", "0803", "0804", "0805", "0806", "0807", "0808", "0809",
  "0810", "0811", // fresh + frozen fruit (NOT 0812/0813/0814 — dried)
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers — longest-prefix lookup
// ────────────────────────────────────────────────────────────────────────────

/**
 * Find the longest-matching HS prefix in the given map for a full HS code.
 * The map is keyed by 4-, 6-, or 8-digit prefixes. The function walks the
 * map from the longest prefix to the shortest to find the first match.
 *
 * Returns `null` when no prefix matches. The caller is responsible for the
 * "no mandatory tests for this commodity" fallback (the validator treats
 * null as "no mandatory tier").
 */
export function findLongestHsPrefix<T extends { hsPrefix: string }>(
  map: Record<string, T>,
  hsCode: string,
): T | null {
  if (!hsCode) return null;
  // Normalise — strip dots, uppercase, truncate to 10 digits.
  const code = String(hsCode).replace(/[^0-9]/g, "").toUpperCase();
  if (!code) return null;

  // Walk from longest possible prefix down to 4 (the minimum HS chapter
  // heading we encode).
  for (let len = Math.min(code.length, 10); len >= 4; len--) {
    const prefix = code.slice(0, len);
    if (map[prefix]) {
      return map[prefix];
    }
  }
  return null;
}

/**
 * Whether a given HS code represents a perishable commodity. Returns true
 * when the HS code starts with one of the PERISHABLE_HS_PREFIXES entries
 * (fresh + frozen fruit & vegetables under HS-07/08).
 */
export function isPerishableHsCode(hsCode: string | null | undefined): boolean {
  if (!hsCode) return false;
  const code = String(hsCode).replace(/[^0-9]/g, "").toUpperCase();
  if (!code) return false;
  return PERISHABLE_HS_PREFIXES.some((p) => code.startsWith(p));
}

/**
 * Default estimated lab-test price band per test type (USD). Used as a
 * fallback when the historical-price-range engine has insufficient samples
 * (< 3 historical quotes). Values are deliberately coarse round numbers
 * representing typical market prices in 2026 for a single panel.
 */
export const DEFAULT_LAB_TEST_PRICE_BAND_USD: Record<LabTestType, { low: number; mid: number; high: number }> = {
  PESTICIDE_RESIDUE: { low: 180, mid: 280, high: 420 },
  MICROBIOLOGICAL: { low: 120, mid: 180, high: 260 },
  HEAVY_METALS: { low: 90, mid: 150, high: 240 },
  MYCOTOXIN: { low: 140, mid: 220, high: 360 },
  OCHRATOXIN: { low: 110, mid: 180, high: 290 },
  SULPHITE: { low: 60, mid: 95, high: 150 },
  FUNGICIDE: { low: 130, mid: 210, high: 320 },
  NUTRITION: { low: 200, mid: 320, high: 540 },
  GMO: { low: 160, mid: 250, high: 410 },
  ALLERGEN: { low: 140, mid: 220, high: 360 },
  AUTHENTICITY: { low: 240, mid: 380, high: 640 },
};

/**
 * Default estimated QC inspection price band per inspection type (USD).
 * Same fallback semantics as DEFAULT_LAB_TEST_PRICE_BAND_USD.
 */
export const DEFAULT_QC_INSPECTION_PRICE_BAND_USD: Record<QcInspectionType, { low: number; mid: number; high: number }> = {
  PRE_SHIPMENT_QC: { low: 220, mid: 380, high: 640 },
  LOADING_SUPERVISION: { low: 150, mid: 240, high: 420 },
  DESTINATION_QC: { low: 320, mid: 540, high: 920 },
  SAMPLING: { low: 110, mid: 190, high: 310 },
  COLD_CHAIN_AUDIT: { low: 180, mid: 300, high: 520 },
};
