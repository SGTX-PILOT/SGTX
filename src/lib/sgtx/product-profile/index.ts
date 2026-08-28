// @ts-nocheck
/**
 * SGTX Part 11 — Product Regulatory Profile Engine
 * ===========================================================================
 *
 * Builds a regulatory profile for a product based on its HS code (and
 * optionally a free-text description for A2-assisted classification).
 *
 * Profile fields (per §11):
 *   hs6                  — HS 6-digit code (WTO HS 2022)
 *   nationalTariffCode   — country-specific 8/10-digit extension
 *   alternateClassification — HS heading if dual-classified
 *   composition          — chemical / material composition
 *   materials            — material list (for TBT / REACH / RoHS)
 *   cas                  — CAS registry numbers (chemical products)
 *   brand                — brand / trade name
 *   model                — model / SKU
 *   agriculturalClass    — fresh / frozen / dried / processed / organic
 *   foodClass            — beverage / dairy / meat / bakery / confectionery
 *   pharmaceuticalClass  — OTC / Rx / biological / API / device class
 *   dg                   — dangerous goods (UN class + packing group)
 *   dualUse              — dual-use export control classification
 *   cites                — CITES appendix (I / II / III / none)
 *   packaging            — packaging type (bulk / retail / pallet)
 *   labeling             — required label regimes (CE / FDA / Halal / Kosher)
 *   shelfLife            — shelf life in days
 *   temperature          — storage temperature range (°C)
 *   conformity           — conformity assessment regimes
 *   sps                  — SPS measures (phyto / vet / food safety)
 *
 * `classifyProduct()` invokes the existing A2 HS Code Detector
 * (src/lib/sgtx/ai/hs-code-detector.ts) for confidence-scored
 * classification when no HS code is provided.
 *
 * All calls are try/catch-wrapped with safe defaults. The engine never
 * throws into API routes.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ §11 Types ============

export interface ProductProfile {
  hs6: string;
  nationalTariffCode?: string;
  alternateClassification?: string;
  composition?: string;
  materials: string[];
  cas: string[];
  brand?: string;
  model?: string;
  agriculturalClass?: string;
  foodClass?: string;
  pharmaceuticalClass?: string;
  dg: { unClass?: string; packingGroup?: string; unNumber?: string } | null;
  dualUse: { regime?: string; controlCode?: string } | null;
  cites: "I" | "II" | "III" | "NONE";
  packaging?: string;
  labeling: string[];
  shelfLifeDays?: number;
  temperatureRangeC?: { min: number; max: number };
  conformity: string[];
  sps: string[];
  category: string;
  description: string;
  generatedAt: string;
}

export interface ClassificationResult {
  hs6: string;
  description: string;
  category: string;
  confidence: number;
  source: "exact" | "fuzzy" | "ai";
  alternatives: { hs: string; description: string; confidence: number }[];
}

// ============ §11 HS-Code Pattern Tables ============
// Hardcoded heuristics for the most common categories. Used as a fast
// pre-AI lookup; the A2 detector is the fallback.

const PROFILE_TABLE: Record<string, Partial<ProductProfile>> = {
  "08": { // Edible fruit & nuts
    agriculturalClass: "fresh",
    foodClass: "fruit",
    labeling: ["country_of_origin"],
    sps: ["phytosanitary", "MRL", "ISPM_15"],
    conformity: ["phytosanitary_certificate"],
    packaging: "carton",
    shelfLifeDays: 21,
    temperatureRangeC: { min: 0, max: 4 },
  },
  "0805": {
    agriculturalClass: "fresh", foodClass: "citrus",
    sps: ["phytosanitary", "MRL_citrus", "canker_free"],
    conformity: ["phytosanitary_certificate"],
    packaging: "carton", shelfLifeDays: 30, temperatureRangeC: { min: 4, max: 8 },
  },
  "0811": {
    agriculturalClass: "frozen", foodClass: "fruit",
    sps: ["phytosanitary", "HACCP", "temperature_controlled"],
    conformity: ["phytosanitary_certificate", "cold_chain_log"],
    packaging: "IQF_polybag_in_carton", shelfLifeDays: 730,
    temperatureRangeC: { min: -18, max: -12 },
  },
  "09": { // Coffee, tea, spices
    foodClass: "beverage",
    sps: ["MRL", "aflatoxin"],
    conformity: ["certificate_of_analysis"],
    packaging: "vacuum_bag", shelfLifeDays: 540,
  },
  "30": { // Pharmaceutical products
    pharmaceuticalClass: "Rx",
    labeling: ["GMP", "import_license", "batch_number"],
    conformity: ["GMP_certificate", "CPP", "certificate_of_analysis"],
    sps: ["GMP_audit"],
    shelfLifeDays: 730, temperatureRangeC: { min: 15, max: 25 },
  },
  "3002": {
    pharmaceuticalClass: "biological",
    conformity: ["GMP_certificate", "CPP", "cold_chain_log"],
    labeling: ["GMP", "cold_chain"],
    shelfLifeDays: 365, temperatureRangeC: { min: 2, max: 8 },
  },
  "3004": {
    pharmaceuticalClass: "OTC_or_Rx",
    conformity: ["GMP_certificate", "CPP", "certificate_of_analysis"],
    labeling: ["GMP", "patient_leaflet"],
    shelfLifeDays: 730,
  },
  "22": { // Beverages
    foodClass: "beverage",
    sps: ["food_safety", "additives"],
    conformity: ["health_certificate"],
    packaging: "bottle", shelfLifeDays: 365,
  },
  "2204": {
    foodClass: "wine",
    labeling: ["alcohol_content", "sulphites"],
    conformity: ["VI1_certificate", "VI2_certificate"],
    sps: ["sulphite_declaration"],
  },
  "27": { // Mineral fuels
    dg: { unClass: "3", packingGroup: "III" },
    dualUse: { regime: "EU_dual_use", controlCode: "3A" },
    labeling: ["GHS"],
    conformity: ["MSDS", "flash_point_test"],
    packaging: "bulk_tank",
  },
  "28": { // Inorganic chemicals
    dg: { unClass: "8", packingGroup: "II" },
    dualUse: { regime: "Australia_Group" },
    labeling: ["GHS", "REACH"],
    conformity: ["MSDS", "REACH_registration"],
    packaging: "drum",
  },
  "29": { // Organic chemicals
    cas: [],
    dg: { unClass: "3", packingGroup: "II" },
    dualUse: { regime: "Australia_Group" },
    labeling: ["GHS", "REACH"],
    conformity: ["MSDS", "REACH_registration"],
    packaging: "drum",
  },
  "30": { // Pharma (already above)
  },
  "36": { // Explosives
    dg: { unClass: "1", packingGroup: "I" },
    dualUse: { regime: "Wassenaar" },
    labeling: ["GHS", "explosive"],
    conformity: ["transport_approval", "competent_authority"],
    packaging: "UN_certified",
  },
  "38": { // Industrial chemicals
    dg: { unClass: "9", packingGroup: "III" },
    labeling: ["GHS", "REACH"],
    conformity: ["MSDS"],
    packaging: "drum",
  },
  "40": { // Rubber products
    materials: ["rubber"],
    labeling: ["CE"],
    conformity: ["CE_marking"],
    packaging: "pallet",
  },
  "61": { // Apparel (knitted)
    materials: ["textile"],
    labeling: ["fiber_content", "country_of_origin", "care_label"],
    conformity: ["textile_labeling"],
    packaging: "polybag_in_carton",
  },
  "62": { // Apparel (woven)
    materials: ["textile"],
    labeling: ["fiber_content", "country_of_origin", "care_label"],
    conformity: ["textile_labeling"],
    packaging: "polybag_in_carton",
  },
  "63": { // Made-up textile articles
    materials: ["textile"],
    labeling: ["fiber_content", "country_of_origin"],
    conformity: ["textile_labeling"],
    packaging: "bale",
  },
  "71": { // Precious stones & metals
    cites: "NONE",
    labeling: ["hallmark"],
    conformity: ["assay_certificate"],
    packaging: "secure_pouch",
  },
  "73": { // Iron/steel articles
    materials: ["steel"],
    labeling: ["CE"],
    conformity: ["CE_marking", "mill_test_certificate"],
    packaging: "pallet",
  },
  "84": { // Machinery
    materials: ["steel", "electronics"],
    labeling: ["CE", "RoHS"],
    conformity: ["CE_marking", "RoHS", "EMC"],
    packaging: "crate",
  },
  "85": { // Electrical
    materials: ["electronics", "plastic"],
    labeling: ["CE", "RoHS", "WEEE"],
    conformity: ["CE_marking", "RoHS", "EMC", "safety_test"],
    packaging: "carton",
    dualUse: { regime: "Wassenaar", controlCode: "5A002" },
  },
  "87": { // Vehicles
    materials: ["steel", "plastic", "glass"],
    labeling: ["E_mark"],
    conformity: ["type_approval", "CoC"],
    packaging: "RoRo",
  },
  "90": { // Optical / medical instruments
    materials: ["glass", "electronics"],
    labeling: ["CE", "FDA"],
    conformity: ["CE_marking", "FDA_510k"],
    packaging: "carton",
  },
  "94": { // Furniture
    materials: ["wood", "steel"],
    labeling: ["FSC", "CE"],
    conformity: ["FSC_certificate"],
    packaging: "flat_pack_carton",
  },
};

const CITES_TABLE: { species: string[]; appendix: "I" | "II" | "III" }[] = [
  { species: ["ivory", "elephant"], appendix: "I" },
  { species: ["rhino", "rhinoceros"], appendix: "I" },
  { species: ["tiger", "pangolin"], appendix: "I" },
  { species: ["mahogany", "rosewood", "agarwood"], appendix: "II" },
  { species: ["caviar", "sturgeon"], appendix: "II" },
  { species: ["coral"], appendix: "II" },
  { species: ["orchid"], appendix: "II" },
];

// ============ §11 Helpers ============

function lookupByHsPrefix(hs6: string): Partial<ProductProfile> | null {
  if (!hs6) return null;
  const clean = hs6.replace(/\D/g, "");
  if (clean.length < 2) return null;
  // Try 4-digit
  if (clean.length >= 4 && PROFILE_TABLE[clean.slice(0, 4)]) {
    return PROFILE_TABLE[clean.slice(0, 4)];
  }
  // Try 2-digit chapter
  if (PROFILE_TABLE[clean.slice(0, 2)]) return PROFILE_TABLE[clean.slice(0, 2)];
  return null;
}

function detectCITES(description: string): "I" | "II" | "III" | "NONE" {
  const d = (description || "").toLowerCase();
  for (const entry of CITES_TABLE) {
    if (entry.species.some((s) => d.includes(s))) return entry.appendix;
  }
  return "NONE";
}

function inferCategory(hs6: string): string {
  const c = (hs6 || "").replace(/\D/g, "").slice(0, 2);
  const map: Record<string, string> = {
    "01": "Live Animals", "02": "Meat", "03": "Seafood", "04": "Dairy",
    "05": "Animal Products", "06": "Live Plants", "07": "Vegetables",
    "08": "Fruits", "09": "Coffee/Tea/Spices", "10": "Cereals",
    "11": "Milling Products", "12": "Oilseeds", "13": "Gums/Resins",
    "14": "Vegetable Plaiting", "15": "Fats/Oils", "16": "Prepared Meat",
    "17": "Sugars", "18": "Cocoa", "19": "Cereals Prepared", "20": "Vegetable Preps",
    "21": "Misc Food", "22": "Beverages", "23": "Animal Feed", "24": "Tobacco",
    "25": "Salt/Sulphur/Stone", "26": "Ores", "27": "Fuels", "28": "Inorganic Chemicals",
    "29": "Organic Chemicals", "30": "Pharmaceuticals", "31": "Fertilizers",
    "32": "Dyes", "33": "Cosmetics", "34": "Soap", "35": "Albumins",
    "36": "Explosives", "37": "Photographic", "38": "Misc Chemicals",
    "39": "Plastics", "40": "Rubber", "41": "Hides", "42": "Leather Articles",
    "43": "Furskins", "44": "Wood", "45": "Cork", "46": "Plaiting Materials",
    "47": "Pulp", "48": "Paper", "49": "Printed Books", "50": "Silk",
    "51": "Wool", "52": "Cotton", "53": "Vegetable Textile", "54": "Man-made Filaments",
    "55": "Man-made Staple", "56": "Wadding", "57": "Carpets", "58": "Woven Fabrics",
    "59": "Impregnated Textiles", "60": "Knitted Fabrics", "61": "Apparel Knitted",
    "62": "Apparel Woven", "63": "Made-up Textiles", "64": "Footwear",
    "65": "Headgear", "66": "Umbrellas", "67": "Feather Articles",
    "68": "Stone Articles", "69": "Ceramic", "70": "Glass", "71": "Precious Stones",
    "72": "Iron", "73": "Iron Articles", "74": "Copper", "75": "Nickel",
    "76": "Aluminium", "78": "Lead", "79": "Zinc", "80": "Tin",
    "81": "Other Metals", "82": "Tools", "83": "Misc Base Metal",
    "84": "Machinery", "85": "Electrical", "86": "Railway", "87": "Vehicles",
    "88": "Aircraft", "89": "Ships", "90": "Optical/Medical", "91": "Clocks",
    "92": "Musical Instruments", "93": "Arms", "94": "Furniture",
    "95": "Toys", "96": "Misc Manufactured", "97": "Art", "98": "Special",
  };
  return map[c] || "Other";
}

// ============ §11 Main API: getProductProfile ============

export async function getProductProfile(
  hsCode: string,
  productName?: string,
): Promise<ProductProfile> {
  const now = new Date().toISOString();
  if (!hsCode && !productName) {
    return emptyProfile(now);
  }
  try {
    const hs6 = (hsCode || "").replace(/\D/g, "").slice(0, 6);
    const desc = productName || "";
    const tableEntry = lookupByHsPrefix(hs6) || {};
    const cites = detectCITES(desc);
    const category = inferCategory(hs6);
    const profile: ProductProfile = {
      hs6,
      nationalTariffCode: hsCode && hsCode.replace(/\D/g, "").length > 6 ? hsCode : undefined,
      composition: tableEntry.composition,
      materials: tableEntry.materials || [],
      cas: tableEntry.cas || [],
      brand: undefined,
      model: undefined,
      agriculturalClass: tableEntry.agriculturalClass,
      foodClass: tableEntry.foodClass,
      pharmaceuticalClass: tableEntry.pharmaceuticalClass,
      dg: tableEntry.dg || null,
      dualUse: tableEntry.dualUse || null,
      cites,
      packaging: tableEntry.packaging,
      labeling: tableEntry.labeling || [],
      shelfLifeDays: tableEntry.shelfLifeDays,
      temperatureRangeC: tableEntry.temperatureRangeC,
      conformity: tableEntry.conformity || [],
      sps: tableEntry.sps || [],
      category,
      description: desc,
      generatedAt: now,
    };
    logger.info("[product-profile] profile generated", { hs6, category, cites });
    return profile;
  } catch (err: any) {
    logger.error("[product-profile] getProductProfile failed", { hsCode, error: err?.message });
    return emptyProfile(now);
  }
}

function emptyProfile(now: string): ProductProfile {
  return {
    hs6: "", materials: [], cas: [], dg: null, dualUse: null,
    cites: "NONE", labeling: [], conformity: [], sps: [],
    category: "Unknown", description: "", generatedAt: now,
  };
}

// ============ §11 Main API: classifyProduct ============

export async function classifyProduct(
  hsCode: string,
  description: string,
): Promise<ClassificationResult> {
  try {
    // If a confident HS code is already provided, return it
    if (hsCode && hsCode.replace(/\D/g, "").length >= 6) {
      const clean = hsCode.replace(/\D/g, "").slice(0, 6);
      return {
        hs6: clean,
        description: description || "",
        category: inferCategory(clean),
        confidence: 0.95,
        source: "exact",
        alternatives: [],
      };
    }
    // Otherwise delegate to the A2 detector
    try {
      const { detectHsCode, searchHsCodeLocal } = await import("@/lib/sgtx/ai/hs-code-detector");
      const match = await detectHsCode(description || hsCode);
      const alternatives = (searchHsCodeLocal ? searchHsCodeLocal(description || hsCode) : [])
        .slice(1, 4)
        .map((m: any) => ({ hs: m.hsCode, description: m.description, confidence: m.confidence }));
      return {
        hs6: match.hsCode,
        description: match.description,
        category: match.category,
        confidence: match.confidence,
        source: match.source,
        alternatives,
      };
    } catch (inner: any) {
      logger.warn("[product-profile] A2 detector unavailable, falling back", { error: inner?.message });
      return {
        hs6: "",
        description: description || "",
        category: "Other",
        confidence: 0,
        source: "ai",
        alternatives: [],
      };
    }
  } catch (err: any) {
    logger.error("[product-profile] classifyProduct failed", { hsCode, description, error: err?.message });
    return {
      hs6: hsCode || "",
      description: description || "",
      category: "Other",
      confidence: 0,
      source: "ai",
      alternatives: [],
    };
  }
}

// ============ §11 Auxiliary: listCategories ============

export function listProductCategories(): string[] {
  return [...new Set(Object.values(PROFILE_TABLE).flatMap((p) => p.materials || []))].sort();
}
