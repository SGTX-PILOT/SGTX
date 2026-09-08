// @ts-nocheck
/**
 * SGTX v17 §20 — Classification Engine
 * ===========================================================================
 *
 * HS code classification using simulated AI keyword matching. Maps a free-text
 * product name + origin country to the most likely HS-6 code (with alternatives)
 * using a hardcoded reference table of HS chapters + product keywords.
 *
 * Real production would call the WCO HS database + an LLM classifier (e.g. a
 * fine-tuned BERT classifier on the WCO training corpus). The simulated engine
 * here implements the same shape so the SGTX Trade Command Center can render
 * real classification results today.
 *
 * Reference: WCO Harmonized System 2022 (21 sections / 97 chapters).
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  productName: string;
  originCountry: string;
  hsCode: string;
  description: string;
  confidence: number; // 0..1
  alternativeCodes: Array<{ hsCode: string; description: string; confidence: number }>;
  classificationSource: string;
  classifiedAt: string;
}

export interface HsCodeInfo {
  hsCode: string;
  description: string;
  unit: string;
  dutyRate: number; // % — generic MFN-ish fallback rate
  restrictions: string[];
  chapter: number;
  section: number;
}

export interface HsCodeValidation {
  hsCode: string;
  valid: boolean;
  format: string;
  chapter: number | null;
  errors: string[];
}

// ── HS chapter reference table (subset, top 30 chapters by trade volume) ──
// Format: chapter → { section, description, keywords[], defaultHsCode, unit }

interface HsChapter {
  chapter: number;
  section: number;
  description: string;
  keywords: string[];
  defaultHsCode: string; // HS-6 fallback
  unit: string;
  dutyRate: number; // generic MFN-ish fallback %
  restrictions: string[];
}

const HS_CHAPTERS: HsChapter[] = [
  { chapter: 1, section: 1, description: "Live animals", keywords: ["cattle", "horse", "live animal", "poultry", "sheep", "goat", "swine", "chicken"], defaultHsCode: "010121", unit: "head", dutyRate: 0, restrictions: ["veterinary_health_certificate"] },
  { chapter: 2, section: 1, description: "Meat and edible meat offals", keywords: ["beef", "lamb", "pork", "meat", "offal", "carcass", "fresh meat"], defaultHsCode: "020110", unit: "kg", dutyRate: 12, restrictions: ["health_certificate", "halal"] },
  { chapter: 3, section: 1, description: "Fish and aquatic invertebrates", keywords: ["fish", "salmon", "tuna", "shrimp", "prawn", "crab", "lobster", "aquatic"], defaultHsCode: "030111", unit: "kg", dutyRate: 8, restrictions: ["catch_certificate", "cold_chain"] },
  { chapter: 4, section: 1, description: "Dairy produce; birds' eggs; natural honey", keywords: ["milk", "cheese", "butter", "yogurt", "egg", "honey", "dairy", "whey"], defaultHsCode: "040110", unit: "kg", dutyRate: 15, restrictions: ["health_certificate"] },
  { chapter: 6, section: 1, description: "Live trees and other plants; bulbs, roots", keywords: ["live plant", "tulip", "rose", "seedling", "bulb", "cut flower"], defaultHsCode: "060110", unit: "number", dutyRate: 5, restrictions: ["phytosanitary_certificate"] },
  { chapter: 7, section: 2, description: "Edible vegetables and certain roots/tubers", keywords: ["tomato", "potato", "onion", "garlic", "carrot", "vegetable", "lettuce", "cabbage"], defaultHsCode: "070110", unit: "kg", dutyRate: 10, restrictions: ["phytosanitary_certificate"] },
  { chapter: 8, section: 2, description: "Edible fruit and nuts; peel of citrus/melons", keywords: ["strawberry", "apple", "banana", "orange", "lemon", "citrus", "mango", "grape", "fruit", "almond", "walnut"], defaultHsCode: "080810", unit: "kg", dutyRate: 8, restrictions: ["phytosanitary_certificate", "cold_chain"] },
  { chapter: 9, section: 2, description: "Coffee, tea, maté and spices", keywords: ["coffee", "tea", "spice", "pepper", "cinnamon", "ginger", "cumin"], defaultHsCode: "090111", unit: "kg", dutyRate: 12, restrictions: ["phytosanitary_certificate"] },
  { chapter: 10, section: 2, description: "Cereals", keywords: ["wheat", "rice", "corn", "maize", "barley", "oats", "grain", "cereal"], defaultHsCode: "100111", unit: "kg", dutyRate: 5, restrictions: ["phytosanitary_certificate"] },
  { chapter: 11, section: 2, description: "Products of the milling industry; malt and starch", keywords: ["flour", "malt", "starch", "wheat flour", "rice flour"], defaultHsCode: "110100", unit: "kg", dutyRate: 10, restrictions: [] },
  { chapter: 15, section: 3, description: "Animal or vegetable fats and oils", keywords: ["oil", "olive oil", "sunflower oil", "palm oil", "fat", "vegetable oil"], defaultHsCode: "150910", unit: "kg", dutyRate: 8, restrictions: ["health_certificate"] },
  { chapter: 16, section: 4, description: "Preparations of meat, fish or crustaceans", keywords: ["canned meat", "smoked salmon", "frozen fish", "preparation"], defaultHsCode: "160100", unit: "kg", dutyRate: 15, restrictions: ["health_certificate", "cold_chain"] },
  { chapter: 17, section: 4, description: "Sugars and sugar confectionery", keywords: ["sugar", "molasses", "confectionery", "candy", "sucrose"], defaultHsCode: "170199", unit: "kg", dutyRate: 20, restrictions: [] },
  { chapter: 18, section: 4, description: "Cocoa and cocoa preparations", keywords: ["cocoa", "chocolate", "cocoa butter", "cocoa powder"], defaultHsCode: "180100", unit: "kg", dutyRate: 10, restrictions: [] },
  { chapter: 22, section: 4, description: "Beverages, spirits and vinegar", keywords: ["water", "juice", "wine", "beer", "whisky", "vodka", "beverage", "soft drink"], defaultHsCode: "220110", unit: "litre", dutyRate: 25, restrictions: ["excise_licence"] },
  { chapter: 25, section: 5, description: "Salt; sulphur; earths and stones; plastering materials", keywords: ["salt", "sulphur", "marble", "granite", "cement", "clay"], defaultHsCode: "250100", unit: "kg", dutyRate: 5, restrictions: [] },
  { chapter: 27, section: 5, description: "Mineral fuels, mineral oils and products", keywords: ["oil", "crude", "petrol", "diesel", "gasoline", "kerosene", "fuel", "coal", "lng", "lpg"], defaultHsCode: "270900", unit: "kg", dutyRate: 8, restrictions: ["origin_certificate"] },
  { chapter: 28, section: 6, description: "Inorganic chemicals; organic/inorganic compounds", keywords: ["chemical", "inorganic", "ammonia", "hydrogen", "oxygen", "sodium", "chloride"], defaultHsCode: "280110", unit: "kg", dutyRate: 5, restrictions: ["reach_certificate"] },
  { chapter: 29, section: 6, description: "Organic chemicals", keywords: ["organic chemical", "ethylene", "propylene", "benzene", "alcohol", "acetic acid"], defaultHsCode: "290110", unit: "kg", dutyRate: 5, restrictions: ["reach_certificate"] },
  { chapter: 30, section: 6, description: "Pharmaceutical products", keywords: ["medicine", "pharmaceutical", "drug", "vaccine", "antibiotic", "tablet", "capsule", "insulin"], defaultHsCode: "300490", unit: "kg", dutyRate: 0, restrictions: ["gmp_certificate", "marketing_authorisation"] },
  { chapter: 33, section: 6, description: "Essential oils and resinoids; perfumery; cosmetics", keywords: ["perfume", "cosmetic", "essential oil", "makeup", "toiletry", "fragrance"], defaultHsCode: "330300", unit: "kg", dutyRate: 8, restrictions: [] },
  { chapter: 39, section: 7, description: "Plastics and articles thereof", keywords: ["plastic", "polymer", "pvc", "pet", "polyethylene", "polypropylene", "polystyrene"], defaultHsCode: "390110", unit: "kg", dutyRate: 6.5, restrictions: ["reach_certificate"] },
  { chapter: 40, section: 7, description: "Rubber and articles thereof", keywords: ["rubber", "tyre", "tire", "latex", "synthetic rubber"], defaultHsCode: "400110", unit: "kg", dutyRate: 8, restrictions: [] },
  { chapter: 42, section: 8, description: "Articles of leather; saddlery; travel goods", keywords: ["leather", "handbag", "wallet", "luggage", "suitcase", "belt"], defaultHsCode: "420210", unit: "number", dutyRate: 12, restrictions: [] },
  { chapter: 48, section: 10, description: "Paper and paperboard; articles of paper pulp", keywords: ["paper", "paperboard", "carton", "cardboard", "kraft paper"], defaultHsCode: "480100", unit: "kg", dutyRate: 5, restrictions: [] },
  { chapter: 61, section: 11, description: "Articles of apparel and clothing accessories, knitted", keywords: ["t-shirt", "shirt", "knit", "sweater", "pullover", "garment", "apparel", "clothing"], defaultHsCode: "610910", unit: "number", dutyRate: 12, restrictions: ["textile_labeling"] },
  { chapter: 62, section: 11, description: "Articles of apparel, not knitted", keywords: ["trousers", "jeans", "jacket", "coat", "dress", "skirt", "woven garment"], defaultHsCode: "620342", unit: "number", dutyRate: 12, restrictions: ["textile_labeling"] },
  { chapter: 64, section: 12, description: "Footwear, gaiters and parts of such articles", keywords: ["shoes", "footwear", "boot", "sandal", "sneaker", "trainer"], defaultHsCode: "640299", unit: "pair", dutyRate: 15, restrictions: [] },
  { chapter: 71, section: 14, description: "Natural or cultured pearls, precious stones and metals", keywords: ["gold", "silver", "diamond", "pearl", "jewellery", "jewelry", "gemstone"], defaultHsCode: "710811", unit: "gram", dutyRate: 5, restrictions: ["hallmarking"] },
  { chapter: 73, section: 15, description: "Articles of iron or steel", keywords: ["steel", "iron", "pipe", "tube", "fitting", "wire"], defaultHsCode: "730410", unit: "kg", dutyRate: 8, restrictions: [] },
  { chapter: 84, section: 16, description: "Nuclear reactors, boilers, machinery and mechanical appliances", keywords: ["machine", "machinery", "engine", "pump", "compressor", "valve", "bearing", "industrial equipment"], defaultHsCode: "841370", unit: "number", dutyRate: 5, restrictions: ["ce_mark"] },
  { chapter: 85, section: 16, description: "Electrical machinery and equipment; parts thereof", keywords: ["electronic", "electrical", "circuit", "transformer", "battery", "cable", "conductor", "smartphone", "laptop", "computer"], defaultHsCode: "850440", unit: "number", dutyRate: 0, restrictions: ["ce_mark", "fcc_mark"] },
  { chapter: 87, section: 17, description: "Vehicles other than railway", keywords: ["vehicle", "car", "truck", "bus", "motorcycle", "automobile", "trailer", "bicycle"], defaultHsCode: "870323", unit: "number", dutyRate: 10, restrictions: ["type_approval"] },
  { chapter: 90, section: 18, description: "Optical, photographic, cinematographic, measuring instruments", keywords: ["optical", "lens", "camera", "microscope", "telescope", "instrument", "medical device"], defaultHsCode: "900211", unit: "number", dutyRate: 5, restrictions: ["ce_mark"] },
  { chapter: 94, section: 20, description: "Furniture; bedding, mattresses; lamps and lighting", keywords: ["furniture", "chair", "table", "sofa", "mattress", "lamp", "lighting", "bed"], defaultHsCode: "940350", unit: "number", dutyRate: 5, restrictions: [] },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function normalizeText(s: string): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreChapter(product: string, chapter: HsChapter): number {
  const text = normalizeText(product);
  if (!text) return 0;
  let score = 0;
  for (const kw of chapter.keywords) {
    const k = normalizeText(kw);
    if (!k) continue;
    if (text.includes(k)) {
      // Longer keyword matches score higher (more specific)
      score += Math.max(1, k.split(" ").length * 2);
    }
  }
  return score;
}

function chapterForCode(hsCode: string): number | null {
  const ch = parseInt((hsCode ?? "").slice(0, 2), 10);
  if (!Number.isFinite(ch) || ch < 1 || ch > 97) return null;
  return ch;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Classify a product by keyword matching against HS chapter reference.
 * Returns the best HS-6 code + alternatives ranked by confidence.
 *
 * Real production: call WCO HS database + LLM (BERT classifier fine-tuned on
 * WCO training corpus). Returns confidence score from the classifier.
 */
export function classifyProduct(
  productName: string,
  originCountry?: string,
): ClassificationResult {
  const classifiedAt = new Date().toISOString();
  const name = String(productName ?? "").trim();
  const origin = String(originCountry ?? "").toUpperCase().trim();

  if (!name) {
    return {
      productName: "",
      originCountry: origin,
      hsCode: "",
      description: "",
      confidence: 0,
      alternativeCodes: [],
      classificationSource: "simulated-keyword-match",
      classifiedAt,
    };
  }

  const scored = HS_CHAPTERS.map((c) => ({ chapter: c, score: scoreChapter(name, c) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // No keyword match — fall back to unknown
    return {
      productName: name,
      originCountry: origin,
      hsCode: "999999",
      description: "Unclassified — no keyword match. Manual classification required.",
      confidence: 0.1,
      alternativeCodes: [],
      classificationSource: "simulated-keyword-match (fallback)",
      classifiedAt,
    };
  }

  const total = scored.reduce((acc, s) => acc + s.score, 0);
  const best = scored[0];
  const bestChapter = best.chapter;
  const bestConfidence = Math.min(0.98, best.score / total * (scored.length === 1 ? 1.2 : 0.85) + 0.05);

  const alternatives: Array<{ hsCode: string; description: string; confidence: number }> =
    scored.slice(1, 4).map((s) => ({
      hsCode: s.chapter.defaultHsCode,
      description: s.chapter.description,
      confidence: Number((s.score / total).toFixed(3)),
    }));

  return {
    productName: name,
    originCountry: origin,
    hsCode: bestChapter.defaultHsCode,
    description: bestChapter.description,
    confidence: Number(bestConfidence.toFixed(3)),
    alternativeCodes: alternatives,
    classificationSource: "simulated-keyword-match",
    classifiedAt,
  };
}

/**
 * Lookup info for a specific HS code (chapter description, unit, fallback
 * duty rate, known restrictions). Falls back to a generic chapter lookup if
 * the exact code isn't in the table.
 */
export function getHsCodeInfo(hsCode: string): HsCodeInfo {
  const code = String(hsCode ?? "").trim();
  const chapterNum = chapterForCode(code);
  const chapter = HS_CHAPTERS.find((c) => c.chapter === chapterNum);

  if (chapter) {
    return {
      hsCode: code,
      description: chapter.description,
      unit: chapter.unit,
      dutyRate: chapter.dutyRate,
      restrictions: chapter.restrictions,
      chapter: chapter.chapter,
      section: chapter.section,
    };
  }

  // Generic fallback — chapters not in the curated table
  return {
    hsCode: code,
    description: chapterNum
      ? `HS chapter ${chapterNum} (not in curated reference; see WCO HS 2022 for full description)`
      : "Unknown HS code",
    unit: "kg",
    dutyRate: 5,
    restrictions: [],
    chapter: chapterNum ?? 0,
    section: 0,
  };
}

/**
 * Validate an HS code's format (length + numeric + chapter range).
 * HS codes are typically 6, 8, or 10 digits. Chapter = first 2 digits (1-97).
 */
export function validateHsCode(hsCode: string): HsCodeValidation {
  const code = String(hsCode ?? "").trim();
  const errors: string[] = [];

  if (!code) {
    errors.push("HS code is empty.");
    return { hsCode: code, valid: false, format: "empty", chapter: null, errors };
  }

  if (!/^\d{4,10}$/.test(code)) {
    errors.push("HS code must be 4-10 numeric digits (HS-4 / HS-6 / HS-8 / HS-10).");
    return { hsCode: code, valid: false, format: "invalid", chapter: null, errors };
  }

  const ch = chapterForCode(code);
  if (ch === null || ch < 1 || ch > 97) {
    errors.push(`Chapter "${code.slice(0, 2)}" is outside the valid HS chapter range (01-97).`);
    return { hsCode: code, valid: false, format: "invalid_chapter", chapter: null, errors };
  }

  const format =
    code.length === 4 ? "HS-4" :
    code.length === 6 ? "HS-6" :
    code.length === 8 ? "HS-8 (national)" :
    code.length === 10 ? "HS-10 (national)" :
    `HS-${code.length}`;

  return {
    hsCode: code,
    valid: true,
    format,
    chapter: ch,
    errors: [],
  };
}

// ── Convenience exports ──────────────────────────────────────────────────

export function listHsChapters(): Array<{ chapter: number; section: number; description: string; defaultHsCode: string }> {
  return HS_CHAPTERS.map((c) => ({
    chapter: c.chapter,
    section: c.section,
    description: c.description,
    defaultHsCode: c.defaultHsCode,
  }));
}
