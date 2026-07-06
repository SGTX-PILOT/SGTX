// SGTX AI Customs Pricing Calculator
// Estimates average customs costs at port of discharge (destination) for buyer reference.
// Includes: import duty (ad valorem), VAT/GST, customs processing fee, customs broker fee,
// port handling, inspection fee, and other applicable charges.

export interface CustomsPricing {
  destinationPort: string;
  destinationCountry: string;
  commodity: string;
  hsCode: string;
  cargoValueUsd: number;
  // Duty calculation
  dutyRatePct: number;            // ad valorem duty %
  dutyAmountUsd: number;          // calculated duty
  // VAT/GST
  vatRatePct: number;             // VAT/GST %
  vatAmountUsd: number;           // calculated VAT (on cargo value + duty)
  // Fees
  customsProcessingFeeUsd: number;
  customsBrokerFeeUsd: number;
  portHandlingFeeUsd: number;
  inspectionFeeUsd: number;
  quarantineFeeUsd: number;
  // Totals
  totalCustomsCostUsd: number;    // duty + VAT + all fees
  totalLandedCostUsd: number;     // cargo value + total customs cost
  effectiveDutyRatePct: number;   // total customs cost as % of cargo value
  // Meta
  currency: string;
  notes: string[];
  aiGenerated: boolean;
  confidence: number;
  aiReasoning?: string;
}

// ─── Country-specific VAT/GST rates ───
export const VAT_RATES: Record<string, { rate: number; name: string }> = {
  DE: { rate: 19, name: "MwSt (VAT)" },
  FR: { rate: 20, name: "TVA (VAT)" },
  NL: { rate: 21, name: "BTW (VAT)" },
  BE: { rate: 21, name: "BTW (VAT)" },
  IT: { rate: 22, name: "IVA (VAT)" },
  ES: { rate: 21, name: "IVA (VAT)" },
  GB: { rate: 20, name: "VAT" },
  EG: { rate: 14, name: "VAT" },
  SA: { rate: 15, name: "VAT" },
  AE: { rate: 5, name: "VAT" },
  US: { rate: 0, name: "No federal VAT (state sales tax may apply)" },
  CN: { rate: 13, name: "VAT" },
  JP: { rate: 10, name: "Consumption Tax" },
  KR: { rate: 10, name: "VAT" },
  SG: { rate: 9, name: "GST" },
  MY: { rate: 10, name: "SST" },
  TH: { rate: 7, name: "VAT" },
  VN: { rate: 10, name: "VAT" },
  IN: { rate: 18, name: "GST" },
  AU: { rate: 10, name: "GST" },
  NZ: { rate: 15, name: "GST" },
  BR: { rate: 17, name: "ICMS" },
  AR: { rate: 21, name: "IVA" },
  MX: { rate: 16, name: "IVA" },
  CA: { rate: 5, name: "GST (federal)" },
  CH: { rate: 7.7, name: "VAT" },
  TR: { rate: 20, name: "KDV (VAT)" },
  ZA: { rate: 15, name: "VAT" },
};

// ─── Country-specific fixed fees (USD) ───
export const COUNTRY_FEES: Record<string, { processing: number; broker: number; portHandling: number; inspection: number; quarantine: number }> = {
  DE: { processing: 35, broker: 85, portHandling: 65, inspection: 45, quarantine: 30 },
  FR: { processing: 32, broker: 80, portHandling: 60, inspection: 45, quarantine: 30 },
  NL: { processing: 30, broker: 75, portHandling: 55, inspection: 40, quarantine: 28 },
  BE: { processing: 32, broker: 78, portHandling: 58, inspection: 42, quarantine: 28 },
  IT: { processing: 35, broker: 85, portHandling: 62, inspection: 45, quarantine: 32 },
  ES: { processing: 33, broker: 80, portHandling: 60, inspection: 42, quarantine: 30 },
  GB: { processing: 30, broker: 75, portHandling: 55, inspection: 40, quarantine: 28 },
  EG: { processing: 25, broker: 65, portHandling: 50, inspection: 55, quarantine: 45 },
  SA: { processing: 28, broker: 70, portHandling: 55, inspection: 50, quarantine: 40 },
  AE: { processing: 30, broker: 75, portHandling: 60, inspection: 45, quarantine: 35 },
  US: { processing: 28, broker: 95, portHandling: 70, inspection: 50, quarantine: 65 },
  CN: { processing: 22, broker: 60, portHandling: 45, inspection: 40, quarantine: 35 },
  JP: { processing: 30, broker: 80, portHandling: 65, inspection: 55, quarantine: 50 },
  KR: { processing: 25, broker: 70, portHandling: 55, inspection: 45, quarantine: 40 },
  SG: { processing: 22, broker: 65, portHandling: 50, inspection: 38, quarantine: 30 },
  MY: { processing: 23, broker: 68, portHandling: 52, inspection: 40, quarantine: 32 },
  TH: { processing: 23, broker: 68, portHandling: 52, inspection: 42, quarantine: 35 },
  VN: { processing: 22, broker: 65, portHandling: 50, inspection: 40, quarantine: 32 },
  IN: { processing: 25, broker: 72, portHandling: 55, inspection: 45, quarantine: 38 },
  AU: { processing: 35, broker: 90, portHandling: 70, inspection: 60, quarantine: 85 },
  NZ: { processing: 32, broker: 85, portHandling: 65, inspection: 55, quarantine: 75 },
  BR: { processing: 30, broker: 78, portHandling: 62, inspection: 48, quarantine: 38 },
  AR: { processing: 30, broker: 78, portHandling: 62, inspection: 48, quarantine: 38 },
  MX: { processing: 27, broker: 72, portHandling: 58, inspection: 45, quarantine: 35 },
  CA: { processing: 28, broker: 75, portHandling: 60, inspection: 48, quarantine: 55 },
  CH: { processing: 32, broker: 82, portHandling: 65, inspection: 45, quarantine: 35 },
  TR: { processing: 27, broker: 70, portHandling: 55, inspection: 42, quarantine: 33 },
  ZA: { processing: 28, broker: 72, portHandling: 58, inspection: 45, quarantine: 38 },
};

// ─── HS chapter → typical MFN duty rate (WTO averages, indicative) ───
const DUTY_BY_CHAPTER: Record<number, number> = {
  1: 5, 2: 5, 3: 5, 4: 8, 5: 4,                   // Live animals, meat, dairy, eggs, honey
  6: 4, 7: 7, 8: 6, 9: 5, 10: 5, 11: 5, 12: 5,    // Plants, vegetables, fruits, coffee, cereals
  13: 4, 14: 4, 15: 6,                             // Lac, vegetable plaiting, oils
  16: 8, 17: 10, 18: 8, 19: 8, 20: 10, 21: 8,     // Meat prep, sugar, cocoa, cereal prep, veg prep, misc food
  22: 8, 23: 5, 24: 15,                            // Beverages, animal feed, tobacco
  25: 3, 26: 2, 27: 3,                             // Salt, ores, petroleum
  28: 4, 29: 4, 30: 0, 31: 4, 32: 5, 33: 5,       // Chemicals, pharmaceuticals (0!), fertilizers, dyes, cosmetics
  34: 5, 35: 4, 36: 5, 37: 5, 38: 4,               // Soaps, enzymes, explosives, photo, industrial chemicals
  39: 6, 40: 5,                                    // Plastics, rubber
  41: 5, 42: 5, 43: 5,                             // Hides, leather goods, fur
  44: 4, 45: 4, 46: 4,                             // Wood, cork, plaits
  47: 0, 48: 4, 49: 0,                             // Pulp (0!), paper, printed matter (0!)
  50: 5, 51: 5, 52: 5, 53: 4, 54: 5, 55: 5,        // Silk, wool, cotton, flax, synthetic filament, synthetic staple
  56: 5, 57: 6, 58: 5, 59: 5, 60: 5,                // Wadding, carpets, special fabrics, coated, knitted
  61: 12, 62: 12, 63: 5,                           // Apparel knit (12!), apparel woven (12!), home textiles
  64: 12, 65: 5, 66: 5, 67: 5,                     // Footwear (12!), headgear, umbrellas, feathers
  68: 5, 69: 5, 70: 5,                             // Stone, ceramics, glass
  71: 5,                                           // Precious stones/metals
  72: 5, 73: 5, 74: 5, 75: 5, 76: 5,               // Iron/steel, steel products, copper, nickel, aluminum
  78: 5, 79: 5, 80: 5, 81: 5, 82: 5, 83: 5,        // Lead, zinc, tin, other metals, tools, hardware
  84: 5, 85: 5,                                    // Machinery, electrical
  86: 3, 87: 10, 88: 0, 89: 0,                     // Railway, vehicles (10!), aircraft (0!), ships (0!)
  90: 5, 91: 5, 92: 5,                             // Instruments, clocks, musical
  93: 5,                                           // Arms
  94: 5, 95: 5, 96: 5, 97: 0,                      // Furniture, toys, misc, art (0!)
};

// ═══════════════════════════════════════════════════════════════════════════
// FTA ENGINE — Egypt-centered trade preference lookup
// ═══════════════════════════════════════════════════════════════════════════
// Covers the eight major FTAs relevant to Egypt-centered trade:
//   1. Egypt-EU Association Agreement (2004)
//   2. GAFTA — Greater Arab Free Trade Area
//   3. COMESA — Common Market for Eastern and Southern Africa
//   4. AfCFTA — African Continental Free Trade Area
//   5. QIZ — Qualifying Industrial Zones (Egypt → USA)
//   6. Egypt-Turkey FTA (2007)
//   7. Agadir Agreement (Egypt, Morocco, Tunisia, Jordan)
//   8. Pan-Euro-Mediterranean Cumulation framework
// ───────────────────────────────────────────────────────────────────────────

/** ISO 3166-1 alpha-2 codes for the 27 EU member states. */
export const EU_MEMBER_STATES: string[] = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
];

/** EFTA member states (used for Pan-Euro-Med cumulation). */
export const EFTA_COUNTRIES: string[] = ["NO", "IS", "CH", "LI"];

/**
 * Pan-Euro-Mediterranean cumulation parties: EU + EFTA + Turkey + Southern
 * Mediterranean (Egypt, Morocco, Tunisia, Algeria, Jordan, Lebanon, Israel,
 * Palestine, Syria) + Faroe Islands.
 */
export const PAN_EURO_MED_PARTIES: string[] = [
  ...EU_MEMBER_STATES,
  ...EFTA_COUNTRIES,
  "TR", "EG", "MA", "TN", "DZ", "JO", "LB", "IL", "PS", "SY", "FO",
];

/**
 * GAFTA (Greater Arab Free Trade Area) parties — 18 member states.
 */
export const GAFTA_PARTIES: string[] = [
  "EG", "SA", "AE", "IQ", "JO", "LB", "LY", "MA", "PS", "SD", "SY", "TN",
  "YE", "KW", "BH", "QA", "OM", "KM", "DJ", "MR", "SO",
];

/**
 * COMESA (Common Market for Eastern and Southern Africa) parties.
 */
export const COMESA_PARTIES: string[] = [
  "EG", "ET", "KE", "UG", "DJ", "ER", "BI", "RW", "MU", "MG", "MW", "ZM",
  "ZW", "SC", "KM", "LY", "TN", "SZ",
];

/**
 * AfCFTA (African Continental Free Trade Area) parties — 54 of 55 AU members
 * (Eritrea has not signed). Includes all continental African states.
 */
export const AFCFTA_PARTIES: string[] = [
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD",
  "CG", "CI", "DJ", "EG", "GQ", "SZ", "ET", "GA", "GM", "GH", "GN", "GW",
  "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA",
  "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ",
  "TG", "TN", "UG", "ZM", "ZW",
];

/** Agadir Agreement parties. */
export const AGADIR_PARTIES: string[] = ["EG", "MA", "TN", "JO"];

/** Designated Egyptian Qualifying Industrial Zones (QIZ) for the US program. */
export const QIZ_DESIGNATED_ZONES: string[] = [
  "Cairo", "Alexandria", "Giza", "Suez", "Canal Zone",
];

/**
 * A single FTA preference specification.
 *
 * `dutyReductionPct` is the headline percentage reduction from MFN duty that
 * applies to industrial goods (HS chapters 25–97). `agriculturalReductionPct`,
 * where applicable, governs the partial concession offered on agricultural
 * goods (HS chapters 1–24). `excludedChapters` lists chapters where the FTA
 * grants no preference at all (the trade falls back to MFN).
 */
export interface FtaSpec {
  id: string;
  name: string;
  shortName: string;
  parties: string[];
  originCriteria: string;
  /** Reduction from MFN for industrial goods (HS 25–97). */
  dutyReductionPct: number;
  /** Reduction from MFN for agricultural goods (HS 1–24). `undefined` ⇒ no
   *  agricultural concession; the FTA does not apply to agricultural goods. */
  agriculturalReductionPct?: number;
  /** HS chapters where the FTA grants no preference (fall back to MFN). */
  excludedChapters?: number[];
  certificateType: string;
  /** Other FTA ids whose parties' originating inputs may cumulate. */
  cumulationWith?: string[];
  /** Lower number = preferred when multiple FTAs tie on reduction % (specific
   *  bilateral FTAs beat broad regional ones). */
  priority: number;
  effectiveDate?: string;
  notes: string;
}

/**
 * The FTA preference table. Order matters only for documentation clarity —
 * the lookup in `applyFta` selects the BEST applicable preference (highest
 * reduction %, then lowest priority number) and is order-independent.
 */
export const FTA_TABLE: FtaSpec[] = [
  {
    id: "EG-EU-AA-2004",
    name: "Egypt-EU Association Agreement",
    shortName: "EG-EU AA (2004)",
    parties: [...EU_MEMBER_STATES, "EG"],
    originCriteria:
      "Wholly obtained in Egypt/EU OR sufficient transformation: change of tariff heading (CTH) for most industrial goods, with value-added ≥ 40% permitted as alternative for some lines. Pan-Euro-Med cumulation allowed with EU + EFTA + TR + Southern Mediterranean + Faroe Islands.",
    dutyReductionPct: 100,
    agriculturalReductionPct: 50,
    excludedChapters: [24], // tobacco — no concession
    certificateType: "EUR.1 movement certificate OR origin declaration on invoice (REX-registered exporters)",
    cumulationWith: ["PAN_EURO_MED"],
    priority: 10,
    effectiveDate: "2004-06-01",
    notes:
      "Industrial goods duty-free since entry into force. Agricultural concessions limited to tariff-rate quotas (TRQs) and seasonal windows for a basket of products.",
  },
  {
    id: "GAFTA",
    name: "Greater Arab Free Trade Area",
    shortName: "GAFTA",
    parties: GAFTA_PARTIES,
    originCriteria:
      "Wholly obtained in a GAFTA member state OR 40% value addition (factory-gate cost) + direct consignment between member states. Cumulation among GAFTA parties is permitted for originating inputs.",
    dutyReductionPct: 100,
    agriculturalReductionPct: 80,
    certificateType: "AR-1 (Arab Certificate of Origin) issued by the Chamber of Commerce of the exporting member state",
    cumulationWith: ["GAFTA"],
    priority: 40,
    effectiveDate: "1998-01-01",
    notes:
      "80–100% tariff reduction across GAFTA. Some members (e.g., Lebanon, Iraq) maintain limited exemption lists. Direct consignment rule: goods must not enter a non-GAFTA territory in transit (with limited exceptions).",
  },
  {
    id: "COMESA",
    name: "Common Market for Eastern and Southern Africa",
    shortName: "COMESA FTA",
    parties: COMESA_PARTIES,
    originCriteria:
      "Wholly obtained in a COMESA member state OR 35% value addition (factory-gate cost) + direct consignment. Cumulation among COMESA parties permitted for originating inputs.",
    dutyReductionPct: 100,
    agriculturalReductionPct: 100,
    certificateType: "COMESA Certificate of Origin (issued by designated authority in exporting member state)",
    cumulationWith: ["COMESA"],
    priority: 45,
    effectiveDate: "2000-10-31",
    notes:
      "0% duty for goods meeting COMESA origin (35% value addition). Not all COMESA members participate in the FTA — Egypt, Kenya, Mauritius, Madagascar, Malawi, Mauritius, Zambia, Zimbabwe, Seychelles, Comoros, Djibouti, Rwanda, Burundi are FTA members; others remain in the customs union transition.",
  },
  {
    id: "AFCFTA",
    name: "African Continental Free Trade Area",
    shortName: "AfCFTA",
    parties: AFCFTA_PARTIES,
    originCriteria:
      "Wholly obtained in an AfCFTA party OR 35% value addition (per AfCFTA Protocol on Rules of Origin, finalized Dec 2023). Cumulation across all 54 AfCFTA parties permitted. Sensitive products subject to tariff phase-down over 5–10 years.",
    dutyReductionPct: 90,
    agriculturalReductionPct: 90,
    excludedChapters: [24, 27], // tobacco & petroleum commonly on excluded lists
    certificateType: "AfCFTA Certificate of Origin (issued by designated Competent Authority in exporting party)",
    cumulationWith: ["AFCFTA"],
    priority: 50,
    effectiveDate: "2021-01-04",
    notes:
      "90% of tariff lines liberalized over 5–10 years; 7% sensitive (longer phase-down); 3% excluded. Member-state tariff offers (Schedules of Concessions) vary — actual preferential rate depends on the bilateral offer between origin and destination party. Indicative 90% reduction used here for originating goods not on a sensitive list.",
  },
  {
    id: "QIZ-EG-US",
    name: "Qualifying Industrial Zones (Egypt → USA)",
    shortName: "QIZ (EG→US)",
    parties: ["EG", "US"],
    originCriteria:
      "Goods produced in a designated Egyptian QIZ (Cairo, Alexandria, Giza, Suez, Canal Zone) containing at least 10.5% Israeli content by value + at least 35% total QIZ-region content (Egyptian + Israeli). Direct shipment to USA required.",
    dutyReductionPct: 100,
    agriculturalReductionPct: 100,
    certificateType: "QIZ certification via MOU — no traditional certificate of origin. Approved QIZ facility self-certifies; verified by Egyptian QIZ Unit + US Customs (CBP).",
    cumulationWith: [],
    priority: 5,
    effectiveDate: "1996-12-14",
    notes:
      "Egypt→USA one-directional program (Israeli content requirement makes it unique). 0% duty on qualifying goods that would otherwise face US MFN duty. Does NOT cover goods already duty-free under MFN. Apparel (HS 61–62) and textiles (HS 50–60) historically the largest beneficiaries.",
  },
  {
    id: "EG-TR-FTA-2007",
    name: "Egypt-Turkey Free Trade Agreement",
    shortName: "EG-TR FTA (2007)",
    parties: ["EG", "TR"],
    originCriteria:
      "Wholly obtained in Egypt/Turkey OR sufficient transformation (CTH for most industrial goods; value-added ≥ 50% for some lines). Pan-Euro-Med cumulation allowed with EU + EFTA + Southern Mediterranean parties.",
    dutyReductionPct: 100,
    agriculturalReductionPct: 50,
    excludedChapters: [24],
    certificateType: "EUR.1-style movement certificate (A.TR adapted) issued by Egyptian General Organization for Export & Import Control (GOEIC) or Turkish Exporters' Association",
    cumulationWith: ["PAN_EURO_MED"],
    priority: 15,
    effectiveDate: "2007-03-01",
    notes:
      "Industrial goods duty-free since entry into force. Agricultural concessions limited (TRQs). Note: Turkey-Egypt political tensions in 2013–2021 caused periodic implementation freezes — verify current status before relying on preference.",
  },
  {
    id: "AGADIR",
    name: "Agadir Agreement",
    shortName: "Agadir (EG-MA-TN-JO)",
    parties: AGADIR_PARTIES,
    originCriteria:
      "Wholly obtained in an Agadir party OR sufficient transformation with Pan-Euro-Med cumulation (inputs from EU + EFTA + TR + Southern Mediterranean + Faroe Islands count as originating). Value-added threshold 40–50% depending on product.",
    dutyReductionPct: 100,
    agriculturalReductionPct: 50,
    excludedChapters: [24],
    certificateType: "EUR.1 movement certificate (Pan-Euro-Med cumulation box on EUR.1 must be completed)",
    cumulationWith: ["PAN_EURO_MED"],
    priority: 20,
    effectiveDate: "2006-07-27",
    notes:
      "0% industrial + limited agricultural concessions. Operates as a sub-regional cumulation hub within the Pan-Euro-Med system — Agadir parties may cumulate origin with each other AND with all other Pan-Euro-Med parties.",
  },
  {
    id: "PAN_EURO_MED",
    name: "Pan-Euro-Mediterranean Cumulation System",
    shortName: "Pan-Euro-Med",
    parties: PAN_EURO_MED_PARTIES,
    originCriteria:
      "Cumulation framework (not a standalone FTA). Originating inputs from any Pan-Euro-Med party may be counted as originating in the exporting party, provided the final transformation is 'sufficient' (CTH or value-added per the underlying bilateral FTA). EUR-MED certificate required.",
    dutyReductionPct: 100,
    agriculturalReductionPct: 50,
    excludedChapters: [24],
    certificateType: "EUR.1 / EUR-MED movement certificate with cumulation statement (Pan-Euro-Med diagonal cumulation)",
    cumulationWith: ["EG-EU-AA-2004", "EG-TR-FTA-2007", "AGADIR"],
    priority: 30,
    effectiveDate: "2006-01-01",
    notes:
      "Framework enabling diagonal cumulation among EU + EFTA + Turkey + Southern Mediterranean (Egypt, Morocco, Tunisia, Algeria, Jordan, Lebanon, Israel, Palestine, Syria) + Faroe Islands. Note: Syria's participation is suspended since 2014. The 'best applicable preference' lookup treats Pan-Euro-Med as a fallback when a more specific bilateral FTA (EG-EU, EG-TR, Agadir) is not directly applicable between the requested pair.",
  },
];

/** Result of an FTA preference assessment for a single trade. */
export interface FtaAssessment {
  applicable: boolean;
  ftaId: string | null;
  ftaName: string | null;
  /** Pre-preference (MFN) duty rate, percent. */
  mfnDutyRatePct: number;
  /** Post-preference duty rate, percent (rounded to 1 decimal). */
  dutyRatePct: number;
  /** Reduction percentage achieved (0–100). */
  dutyReductionPct: number;
  certificateType: string | null;
  originCriteria: string | null;
  cumulationParties: string[];
  notes: string[];
}

/** Parse the first two digits of an HS code as a chapter number. Returns 0 if
 *  the HS code is unparseable. */
function hsChapter(hsCode: string): number {
  const digits = (hsCode || "").replace(/\D/g, "");
  if (digits.length < 2) return 0;
  return parseInt(digits.slice(0, 2), 10);
}

/** True if the HS chapter is an agricultural/food chapter (1–24). */
function isAgriculturalChapter(chapter: number): boolean {
  return chapter >= 1 && chapter <= 24;
}

/** Effective reduction percentage for a given FTA on a given HS chapter. */
function ftaReductionForChapter(fta: FtaSpec, chapter: number): number {
  if (fta.excludedChapters?.includes(chapter)) return 0;
  if (isAgriculturalChapter(chapter)) {
    return fta.agriculturalReductionPct ?? 0;
  }
  return fta.dutyReductionPct;
}

/**
 * Apply the BEST applicable FTA preference for a given trade.
 *
 * Iterates over all FTAs in `FTA_TABLE`, finds every FTA where BOTH the
 * origin and destination countries are parties, computes the effective
 * reduction for the relevant HS chapter, and selects the FTA delivering the
 * lowest post-preference duty rate (highest reduction %, then lowest
 * `priority` number for tie-breaking).
 *
 * The `fobValueUsd` parameter is accepted for API completeness — it does not
 * change the duty RATE returned, but is included in the notes for downstream
 * duty-amount calculations (see `calculateCustomsPricing`).
 */
export function applyFta(
  hsCode: string,
  originCountry: string,
  destCountry: string,
  fobValueUsd: number,
): FtaAssessment {
  const origin = (originCountry || "").toUpperCase().trim();
  const dest = (destCountry || "").toUpperCase().trim();
  const chapter = hsChapter(hsCode);
  const mfnRate = DUTY_BY_CHAPTER[chapter] ?? 5;
  const notes: string[] = [];

  if (!origin || !dest || !chapter) {
    return {
      applicable: false,
      ftaId: null,
      ftaName: null,
      mfnDutyRatePct: mfnRate,
      dutyRatePct: mfnRate,
      dutyReductionPct: 0,
      certificateType: null,
      originCriteria: null,
      cumulationParties: [],
      notes: ["FTA assessment skipped: missing origin, destination, or HS code."],
    };
  }

  // Find every FTA that has BOTH origin and destination as parties.
  const candidates = FTA_TABLE.filter(
    (fta) => fta.parties.includes(origin) && fta.parties.includes(dest) && origin !== dest,
  );

  if (candidates.length === 0) {
    return {
      applicable: false,
      ftaId: null,
      ftaName: null,
      mfnDutyRatePct: mfnRate,
      dutyRatePct: mfnRate,
      dutyReductionPct: 0,
      certificateType: null,
      originCriteria: null,
      cumulationParties: [],
      notes: [
        `No FTA covers the ${origin}→${dest} corridor for HS ${hsCode}; MFN rate ${mfnRate}% applies.`,
      ],
    };
  }

  // Score each candidate: pick the lowest resulting duty rate, then the lowest
  // priority number (more specific bilateral FTA beats broad regional FTA).
  let best: { fta: FtaSpec; reduction: number; rate: number } | null = null;
  for (const fta of candidates) {
    const reduction = ftaReductionForChapter(fta, chapter);
    const rate = Math.round(mfnRate * (1 - reduction / 100) * 100) / 100;
    if (
      !best ||
      rate < best.rate ||
      (rate === best.rate && fta.priority < best.fta.priority)
    ) {
      best = { fta, reduction, rate };
    }
  }

  if (!best || best.reduction === 0) {
    return {
      applicable: false,
      ftaId: null,
      ftaName: null,
      mfnDutyRatePct: mfnRate,
      dutyRatePct: mfnRate,
      dutyReductionPct: 0,
      certificateType: null,
      originCriteria: null,
      cumulationParties: [],
      notes: [
        `FTA(s) cover the ${origin}→${dest} corridor but grant no preference on HS chapter ${chapter} (MFN ${mfnRate}% applies).`,
      ],
    };
  }

  const cumulationParties = (best.fta.cumulationWith ?? []).flatMap((id) => {
    const f = FTA_TABLE.find((x) => x.id === id);
    return f ? f.parties : [];
  });

  notes.push(
    `${best.fta.shortName}: duty reduced from MFN ${mfnRate}% to ${best.rate}% (${best.reduction}% reduction) for originating goods.`,
  );
  notes.push(`Certificate required: ${best.fta.certificateType}`);
  if (fobValueUsd > 0) {
    const dutySaving = Math.round((fobValueUsd * (mfnRate - best.rate) / 100) * 100) / 100;
    notes.push(`Estimated duty saving on FOB $${fobValueUsd.toFixed(2)}: $${dutySaving.toFixed(2)}`);
  }
  if (isAgriculturalChapter(chapter) && best.reduction < 100) {
    notes.push("Agricultural product: FTA grants limited concession (TRQs / seasonal windows may apply — verify with destination customs).");
  }

  return {
    applicable: true,
    ftaId: best.fta.id,
    ftaName: best.fta.name,
    mfnDutyRatePct: mfnRate,
    dutyRatePct: best.rate,
    dutyReductionPct: best.reduction,
    certificateType: best.fta.certificateType,
    originCriteria: best.fta.originCriteria,
    cumulationParties: Array.from(new Set(cumulationParties)),
    notes,
  };
}

/**
 * Convenience: return the BEST FTA spec (without computed rates) for a pair.
 * Useful for UI displays that want to show "eligible FTAs" without full
 * duty math.
 */
export function getBestFtaPreference(
  hsCode: string,
  originCountry: string,
  destCountry: string,
): FtaSpec | null {
  const assessment = applyFta(hsCode, originCountry, destCountry, 0);
  if (!assessment.applicable || !assessment.ftaId) return null;
  return FTA_TABLE.find((f) => f.id === assessment.ftaId) ?? null;
}

export function getDutyRate(hsCode: string, destinationCountry: string, originCountry: string): { rate: number; notes: string[] } {
  const chapter = parseInt(hsCode.replace(/\D/g, "").slice(0, 2), 10);
  let rate = DUTY_BY_CHAPTER[chapter] ?? 5;
  const notes: string[] = [];

  // Resolve FTA preference via the expanded engine.
  const fta = applyFta(hsCode, originCountry, destinationCountry, 0);
  if (fta.applicable) {
    notes.push(...fta.notes);
    rate = fta.dutyRatePct;
  }

  // Egypt-specific: higher duties on luxury goods
  if (destinationCountry === "EG") {
    if (chapter >= 50 && chapter <= 63) { rate = Math.max(rate, 30); notes.push("Egypt: textile/apparel duty 30% (protective tariff)"); }
    if (chapter === 87) { rate = Math.max(rate, 40); notes.push("Egypt: vehicle duty 40%+ (protective tariff)"); }
    if (chapter >= 84 && chapter <= 85) { rate = Math.max(rate, 20); notes.push("Egypt: machinery/electronics duty 20% (protective tariff)"); }
  }

  // Saudi/UAE: duty-free for most food
  if ((destinationCountry === "SA" || destinationCountry === "AE") && chapter >= 1 && chapter <= 24) {
    rate = 0;
    notes.push(`${destinationCountry}: food products duty-free (GCC common external tariff)`);
  }

  // US: very low duties on many items
  if (destinationCountry === "US" && (chapter === 49 || chapter === 84 || chapter === 85 || chapter === 88 || chapter === 89 || chapter === 97)) {
    rate = 0;
    notes.push("US: duty-free for this category");
  }

  return { rate: Math.round(rate * 10) / 10, notes };
}

export async function calculateCustomsPricing(input: {
  destinationPort: string;
  commodity: string;
  hsCode: string;
  cargoValueUsd: number;
  originCountry?: string;
  incoterm?: string;
  weight?: number;
}): Promise<CustomsPricing> {
  const destinationCountry = input.destinationPort.slice(0, 2).toUpperCase();
  const originCountry = (input.originCountry || "").toUpperCase();
  const notes: string[] = [];

  // 1. Get duty rate from DB
  const { rate: dutyRatePct, notes: dutyNotes } = getDutyRate(input.hsCode, destinationCountry, originCountry);
  notes.push(...dutyNotes);

  // 2. Get VAT/GST rate
  const vatInfo = VAT_RATES[destinationCountry] || { rate: 10, name: "VAT" };
  const vatRatePct = vatInfo.rate;
  notes.push(`${destinationCountry} ${vatInfo.name}: ${vatRatePct}%`);

  // 3. Get fixed fees
  const fees = COUNTRY_FEES[destinationCountry] || { processing: 30, broker: 75, portHandling: 55, inspection: 45, quarantine: 35 };

  // 4. Calculate duty
  const dutyAmountUsd = Math.round((input.cargoValueUsd * dutyRatePct / 100) * 100) / 100;

  // 5. Calculate VAT (on cargo value + duty — "CIF + duty" basis in most countries)
  const vatBase = input.cargoValueUsd + dutyAmountUsd;
  const vatAmountUsd = Math.round((vatBase * vatRatePct / 100) * 100) / 100;

  // 6. AI enrichment — get more accurate duty rate + country-specific notes
  let aiGenerated = false;
  let aiReasoning = "";
  let finalDutyRate = dutyRatePct;
  let finalVatRate = vatRatePct;

  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: "You are a customs duty and tax expert. Provide accurate import duty and VAT rates for the destination country. Respond with VALID JSON ONLY.",
        },
        {
          role: "user",
          content: `Cargo: ${input.commodity} (HS ${input.hsCode}), value $${input.cargoValueUsd}, importing to ${destinationCountry} (port ${input.destinationPort}).
Origin: ${originCountry || "unknown"}.
Estimated duty rate from DB: ${dutyRatePct}%. Estimated VAT: ${vatRatePct}%.

Provide the most accurate current duty rate and any additional notes (anti-dumping duties, seasonal tariffs, special permits, etc.):

{"duty_rate_pct": 6.5, "vat_rate_pct": 19, "additional_notes": ["Note 1", "Note 2"], "reasoning": "Brief explanation"}

Rules:
- "duty_rate_pct": MFN or FTA rate for this HS code in this country
- "vat_rate_pct": standard VAT/GST rate
- "additional_notes": any extra charges, anti-dumping, seasonal, permit requirements
- "reasoning": 1-sentence explanation`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      finalDutyRate = Math.round((parsed.duty_rate_pct || dutyRatePct) * 10) / 10;
      finalVatRate = Math.round((parsed.vat_rate_pct || vatRatePct) * 10) / 10;
      if (Array.isArray(parsed.additional_notes)) {
        notes.push(...parsed.additional_notes.map((n: string) => `AI: ${n}`));
      }
      aiReasoning = parsed.reasoning || "";
      aiGenerated = true;
    }
  } catch (err) {
    notes.push("AI enrichment skipped (API unavailable)");
  }

  // Recalculate with AI-adjusted rates if different
  const finalDutyAmount = Math.round((input.cargoValueUsd * finalDutyRate / 100) * 100) / 100;
  const finalVatAmount = Math.round(((input.cargoValueUsd + finalDutyAmount) * finalVatRate / 100) * 100) / 100;

  const totalCustomsCost = finalDutyAmount + finalVatAmount + fees.processing + fees.broker + fees.portHandling + fees.inspection + fees.quarantine;
  const totalLandedCost = input.cargoValueUsd + totalCustomsCost;
  const effectiveDutyRate = Math.round((totalCustomsCost / input.cargoValueUsd) * 1000) / 10;

  return {
    destinationPort: input.destinationPort,
    destinationCountry,
    commodity: input.commodity,
    hsCode: input.hsCode,
    cargoValueUsd: input.cargoValueUsd,
    dutyRatePct: finalDutyRate,
    dutyAmountUsd: finalDutyAmount,
    vatRatePct: finalVatRate,
    vatAmountUsd: finalVatAmount,
    customsProcessingFeeUsd: fees.processing,
    customsBrokerFeeUsd: fees.broker,
    portHandlingFeeUsd: fees.portHandling,
    inspectionFeeUsd: fees.inspection,
    quarantineFeeUsd: fees.quarantine,
    totalCustomsCostUsd: Math.round(totalCustomsCost * 100) / 100,
    totalLandedCostUsd: Math.round(totalLandedCost * 100) / 100,
    effectiveDutyRatePct: effectiveDutyRate,
    currency: "USD",
    notes,
    aiGenerated,
    confidence: aiGenerated ? 0.85 : 0.7,
    aiReasoning,
  };
}
