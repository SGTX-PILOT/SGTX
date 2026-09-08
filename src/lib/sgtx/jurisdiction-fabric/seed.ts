// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.6 — Jurisdiction Fabric seed (16 jurisdiction types)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Per v17 §20.6 ("Jurisdiction Fabric"), a jurisdiction is NOT just a country.
// The Fabric recognises 16 distinct jurisdiction types — from sovereign nations
// down to bonded warehouses — each with its own authority, rules and precedence
// in the hierarchy. When multiple jurisdictions apply to a trade (e.g. cargo
// moving through the Suez Canal SEZ, the Suez Canal transit corridor, Egyptian
// customs, and the GCC customs union simultaneously), the Sovereign Jurisdiction
// Supremacy rule (G3) says the strictest applicable rule wins.
//
// This file defines the 16 jurisdiction types as in-memory constants AND seeds
// a representative catalogue of real-world jurisdictions across those types.
// No Prisma schema change is required — the constants live entirely in memory
// and are consumed by the lib functions in `./index.ts`.
//
// The existing `Jurisdiction` Prisma model (countryCode + tier) is left untouched.
// The Fabric is a SUPERSET — when the `Jurisdiction` row for `EG` exists, the
// Fabric's `SOVEREIGN_COUNTRY` registry entry for `EG` complements it with the
// richer type/hierarchy/parent/authority metadata the v17 moat narrative needs.
// ═══════════════════════════════════════════════════════════════════════════════

// ── The 16 jurisdiction types (v17 §20.6) ───────────────────────────────────────
export type JurisdictionType =
  | "SOVEREIGN_COUNTRY"          // Egypt, Germany, UAE
  | "CUSTOMS_UNION"              // EU, GCC, EAC
  | "FREE_TRADE_AREA"            // NAFTA, RCEP
  | "FREE_ZONE"                  // SZFE, JAFZA
  | "SPECIAL_ECONOMIC_ZONE"      // Suez Canal Economic Zone
  | "PORT_JURISDICTION"          // Port of Alexandria, Port of Hamburg
  | "AIRPORT_JURISDICTION"       // Cairo Airport, Frankfurt Airport
  | "BORDER_CROSSING"            // Rafah, Salwa
  | "INLAND_DRY_PORT"            // 6th October Dry Port
  | "CUSTOMS_WAREHOUSE"          // Bonded warehouse
  | "FREE_TRADE_ZONE"            // Similar to free zone but broader
  | "EXPORT_PROCESSING_ZONE"     // EPZ
  | "OFFSHORE_FINANCIAL_CENTER"  // DIFC, QFC
  | "TRANSIT_CORRIDOR"          // Suez Canal, TIR corridor
  | "SPECIAL_ADMINISTRATIVE_REGION" // Hong Kong, Macao
  | "TERRITORIAL_WATER";         // 12nm territorial waters

// ── Type metadata catalogue ───────────────────────────────────────────────────
export interface JurisdictionTypeMeta {
  code: JurisdictionType;
  name: string;
  description: string;
  hasParent: boolean;        // Does this type normally nest under a sovereign country?
  typicalAuthority: string;  // The body that issues rules of this type
  precedenceTier: number;    // Lower = overrides higher when conflict (1 = highest)
}

export const JURISDICTION_TYPES: JurisdictionTypeMeta[] = [
  {
    code: "SOVEREIGN_COUNTRY",
    name: "Sovereign Country",
    description:
      "An independent state with full sovereignty over its territory — the root of most jurisdiction trees. Issuing authority: national government (e.g. Egypt, Germany, UAE).",
    hasParent: false,
    typicalAuthority: "National customs authority (e.g. Egyptian Customs, German Zoll, UAE Federal Customs Authority)",
    precedenceTier: 2,
  },
  {
    code: "CUSTOMS_UNION",
    name: "Customs Union",
    description:
      "A bloc of countries that apply a common external tariff and customs code. Member states cede tariff autonomy to the union (e.g. EU, GCC, EAC).",
    hasParent: false,
    typicalAuthority: "Union customs authority (e.g. DG TAXUD for the EU, GCC Customs Union Commission)",
    precedenceTier: 1,
  },
  {
    code: "FREE_TRADE_AREA",
    name: "Free Trade Area",
    description:
      "A group of countries that have removed tariffs between themselves but retain independent external tariffs (e.g. NAFTA, RCEP).",
    hasParent: false,
    typicalAuthority: "FTA secretariat + national customs (rules of origin arbitration)",
    precedenceTier: 3,
  },
  {
    code: "FREE_ZONE",
    name: "Free Zone",
    description:
      "A designated area inside a country where goods are treated as outside the customs territory for duties (e.g. SZFE, JAFZA).",
    hasParent: true,
    typicalAuthority: "Free-zone authority (e.g. SCZone Authority, JAFZA regulator)",
    precedenceTier: 4,
  },
  {
    code: "SPECIAL_ECONOMIC_ZONE",
    name: "Special Economic Zone",
    description:
      "A geographically delimited area with liberalised economic laws (tax, labour, FDI) but generally inside the customs territory (e.g. Suez Canal Economic Zone).",
    hasParent: true,
    typicalAuthority: "SEZ authority under national law (e.g. SCZone Authority under Egyptian Law 72/2017)",
    precedenceTier: 4,
  },
  {
    code: "PORT_JURISDICTION",
    name: "Port Jurisdiction",
    description:
      "A sea-port customs jurisdiction — the entry/exit point for maritime cargo. Has its own port authority + customs house (e.g. Port of Alexandria, Port of Hamburg).",
    hasParent: true,
    typicalAuthority: "Port authority + port customs office (e.g. Alex Port Authority + Alexandria Customs)",
    precedenceTier: 5,
  },
  {
    code: "AIRPORT_JURISDICTION",
    name: "Airport Jurisdiction",
    description:
      "An airport customs jurisdiction — the entry/exit point for air cargo (e.g. Cairo International Airport, Frankfurt Airport).",
    hasParent: true,
    typicalAuthority: "Airport authority + airport customs office (e.g. Cairo Airport Co. + Airport Customs)",
    precedenceTier: 5,
  },
  {
    code: "BORDER_CROSSING",
    name: "Border Crossing",
    description:
      "A land-border crossing point with its own customs + immigration (e.g. Rafah EG-GZ, Salwa SA-QA).",
    hasParent: true,
    typicalAuthority: "Border customs office + border guard (e.g. Rafah Border Customs)",
    precedenceTier: 5,
  },
  {
    code: "INLAND_DRY_PORT",
    name: "Inland Dry Port",
    description:
      "An inland customs clearance location with port-like status (e.g. 6th October Dry Port, Egypt).",
    hasParent: true,
    typicalAuthority: "Dry-port operator + inland customs office",
    precedenceTier: 6,
  },
  {
    code: "CUSTOMS_WAREHOUSE",
    name: "Customs Warehouse",
    description:
      "A bonded warehouse where imported goods can be stored under customs supervision without payment of duty until release (e.g. Alexandria bonded warehouse).",
    hasParent: true,
    typicalAuthority: "Warehouse keeper + supervising customs office",
    precedenceTier: 7,
  },
  {
    code: "FREE_TRADE_ZONE",
    name: "Free Trade Zone",
    description:
      "A broader free-trade designation — often overlapping with FREE_ZONE but applied at multi-zone or sector level (e.g. Shanghai FTZ).",
    hasParent: true,
    typicalAuthority: "FTZ administration (e.g. Shanghai FTZ Administration)",
    precedenceTier: 4,
  },
  {
    code: "EXPORT_PROCESSING_ZONE",
    name: "Export Processing Zone",
    description:
      "A zone designed specifically for export-oriented manufacturing, typically with duty drawbacks on inputs (e.g. Nasr City EPZ).",
    hasParent: true,
    typicalAuthority: "EPZ authority (e.g. General Authority for Investment EPZ branch)",
    precedenceTier: 4,
  },
  {
    code: "OFFSHORE_FINANCIAL_CENTER",
    name: "Offshore Financial Center",
    description:
      "A jurisdiction specialising in financial services with light-touch regulation (e.g. DIFC, QFC). Has its own courts + civil law system.",
    hasParent: true,
    typicalAuthority: "Offshore financial-center authority (e.g. DFSA in DIFC, QFCRA in QFC)",
    precedenceTier: 4,
  },
  {
    code: "TRANSIT_CORRIDOR",
    name: "Transit Corridor",
    description:
      "A defined transit route with its own customs transit regime (e.g. Suez Canal, TIR Convention corridor).",
    hasParent: true,
    typicalAuthority: "Corridor authority + transit customs (e.g. Suez Canal Authority, IRU for TIR)",
    precedenceTier: 5,
  },
  {
    code: "SPECIAL_ADMINISTRATIVE_REGION",
    name: "Special Administrative Region",
    description:
      "A sub-national entity with high autonomy, separate legal system and (often) separate customs (e.g. Hong Kong SAR, Macao SAR).",
    hasParent: true,
    typicalAuthority: "SAR government (e.g. HKSAR Customs and Excise)",
    precedenceTier: 3,
  },
  {
    code: "TERRITORIAL_WATER",
    name: "Territorial Water",
    description:
      "The 12-nautical-mile territorial sea over which the coastal state exercises sovereignty (UNCLOS §2).",
    hasParent: true,
    typicalAuthority: "Coast guard + coastal-state maritime customs",
    precedenceTier: 5,
  },
];

// ── Seed catalogue of concrete jurisdictions ──────────────────────────────────
// A representative, real-world sample across all 16 types. Each entry links to
// its parent (by `parentCode`) so the hierarchy can be walked by the lib.

export interface JurisdictionSeed {
  code: string;            // Unique code (ISO 3166-1 alpha-2 for countries, custom for others)
  name: string;
  type: JurisdictionType;
  parentCode: string | null;  // null for roots (countries + customs unions)
  authority: string;
  country?: string;       // ISO 3166-1 alpha-2 of the underlying sovereign (for non-country types)
  rules: JurisdictionRule[]; // Default rules issued by this jurisdiction
}

export interface JurisdictionRule {
  rule: string;            // Short, human-readable rule statement
  authority: string;       // Who issued the rule
  precedence: number;      // Lower = overrides higher when conflict (1 = highest)
  hsCodes?: string[];      // Optional: rule only applies to these HS codes (empty/absent = all)
  category?: string;       // Free-form category (TARIFF, SPS, EXPORT_CONTROL, SANCTIONS, FINANCE, ...)
  legalRef?: string;       // Optional: official citation (e.g. "EU Reg 2015/847")
}

export const JURISDICTIONS_SEED: JurisdictionSeed[] = [
  // ── Sovereign Countries ──────────────────────────────────────────────────────
  {
    code: "EG", name: "Egypt", type: "SOVEREIGN_COUNTRY", parentCode: null,
    authority: "Egyptian Customs Authority",
    country: "EG",
    rules: [
      { rule: "Mandatory ACI pre-registration via Nafeza for all imports", authority: "Nafeza", precedence: 2, category: "CUSTOMS_PROCEDURE", legalRef: "Egyptian Customs Law 66/1963 Art. 38" },
      { rule: "USD/EUR/EGP FX controls — central-bank approval for transfers >= $10k", authority: "CBE", precedence: 2, category: "FINANCE", legalRef: "CBE circular 485/2022" },
      { rule: "Phytosanitary cert required for all plant-origin imports", authority: "CAPQ", precedence: 2, category: "SPS", legalRef: "WTO SPS Agreement" },
    ],
  },
  {
    code: "DE", name: "Germany", type: "SOVEREIGN_COUNTRY", parentCode: "EU",
    authority: "Bundeszentralamt fuer Steuern (BZSt) + Hauptzollamt",
    country: "DE",
    rules: [
      { rule: "EU customs tariff applies (CCT)", authority: "EU (DG TAXUD)", precedence: 2, category: "TARIFF", legalRef: "EU Reg 952/2013 (UCC)" },
      { rule: "EORI required for all customs filings", authority: "German Customs", precedence: 2, category: "CUSTOMS_PROCEDURE", legalRef: "EU Reg 952/2013 Art. 1" },
      { rule: "EUDR due-diligence for palm oil, cattle, soy, coffee, cocoa, rubber, wood", authority: "German Customs", precedence: 2, hsCodes: ["1511","0102","1201","0901","1801","4001","44"], category: "EXPORT_CONTROL", legalRef: "EU Reg 2023/1115 (EUDR)" },
    ],
  },
  {
    code: "AE", name: "United Arab Emirates", type: "SOVEREIGN_COUNTRY", parentCode: "GCC",
    authority: "UAE Federal Customs Authority",
    country: "AE",
    rules: [
      { rule: "GCC common external tariff applies (5% standard)", authority: "GCC Customs Union", precedence: 2, category: "TARIFF", legalRef: "GCC Customs Union Agreement 2003" },
      { rule: "Halal certificate required for meat imports", authority: "UAE Municipality", precedence: 2, hsCodes: ["0201","0202","0203","0210"], category: "SPS", legalRef: "UAE Food Law 2008" },
      { rule: "Sanctions screening mandatory for all Iran-related counterparties", authority: "UAE MoE", precedence: 1, category: "SANCTIONS", legalRef: "UAE Cabinet Decision 74/2021" },
    ],
  },

  // ── Customs Unions ───────────────────────────────────────────────────────────
  {
    code: "EU", name: "European Union (Customs Union)", type: "CUSTOMS_UNION", parentCode: null,
    authority: "DG TAXUD (Directorate-General for Taxation and Customs Union)",
    rules: [
      { rule: "Common Customs Tariff (CCT) applies at external border", authority: "EU Council", precedence: 1, category: "TARIFF", legalRef: "EU Reg 952/2013 (UCC)" },
      { rule: "ICS2 ENS filing mandatory for all inbound cargo", authority: "DG TAXUD", precedence: 1, category: "CUSTOMS_PROCEDURE", legalRef: "EU Reg 2019/632 (ICS2)" },
      { rule: "EU sanctions screening against consolidated list", authority: "EU Council", precedence: 1, category: "SANCTIONS", legalRef: "EU Reg 2580/2001 + 881/2002" },
      { rule: "REACH compliance for chemicals", authority: "ECHA", precedence: 1, hsCodes: ["28","29","30","31","32","38"], category: "SPS", legalRef: "EU Reg 1907/2006 (REACH)" },
    ],
  },
  {
    code: "GCC", name: "Gulf Cooperation Council (Customs Union)", type: "CUSTOMS_UNION", parentCode: null,
    authority: "GCC Customs Union Commission",
    rules: [
      { rule: "Common external tariff 5% standard rate", authority: "GCC Customs Union Commission", precedence: 1, category: "TARIFF", legalRef: "GCC Customs Union Agreement 2003" },
      { rule: "FASAH single-window integration for intra-GCC movements", authority: "GCC", precedence: 1, category: "CUSTOMS_PROCEDURE", legalRef: "GCC FASAH Agreement" },
    ],
  },
  {
    code: "EAC", name: "East African Community (Customs Union)", type: "CUSTOMS_UNION", parentCode: null,
    authority: "EAC Secretariat",
    rules: [
      { rule: "Common external tariff (3-band: 0%, 10%, 25%)", authority: "EAC Council", precedence: 1, category: "TARIFF", legalRef: "EAC Customs Union Protocol 2009" },
    ],
  },

  // ── Free Trade Areas ─────────────────────────────────────────────────────────
  {
    code: "RCEP", name: "Regional Comprehensive Economic Partnership", type: "FREE_TRADE_AREA", parentCode: null,
    authority: "RCEP Secretariat",
    rules: [
      { rule: "Cumulative rules-of-origin for 15-member state goods", authority: "RCEP", precedence: 3, category: "RULES_OF_ORIGIN", legalRef: "RCEP Agreement 2020 Ch.3" },
    ],
  },
  {
    code: "NAFTA", name: "North American Free Trade Agreement (USMCA)", type: "FREE_TRADE_AREA", parentCode: null,
    authority: "USMCA Secretariat",
    rules: [
      { rule: "Regional value content (RVC) requirement for tariff preference", authority: "USMCA", precedence: 3, category: "RULES_OF_ORIGIN", legalRef: "USMCA Agreement 2020 Ch.4" },
    ],
  },

  // ── Free Zones ───────────────────────────────────────────────────────────────
  {
    code: "SZFE", name: "Shanghai Free-Trade Zone", type: "FREE_ZONE", parentCode: "CN",
    authority: "Shanghai FTZ Administration",
    country: "CN",
    rules: [
      { rule: "Bonded status — goods in zone treated as outside customs territory", authority: "Shanghai FTZ", precedence: 4, category: "CUSTOMS_PROCEDURE", legalRef: "PRC Customs Law Art. 39" },
    ],
  },
  {
    code: "JAFZA", name: "Jebel Ali Free Zone", type: "FREE_ZONE", parentCode: "AE",
    authority: "JAFZA Authority (DP World)",
    country: "AE",
    rules: [
      { rule: "100% foreign ownership, no corporate tax for 50 years", authority: "JAFZA", precedence: 4, category: "FINANCE", legalRef: "JAFZA Law 1991 (as amended)" },
      { rule: "Goods in JAFZA are outside UAE customs territory for duties", authority: "JAFZA Customs", precedence: 4, category: "CUSTOMS_PROCEDURE", legalRef: "UAE Customs Law Art. 23" },
    ],
  },

  // ── Special Economic Zones ───────────────────────────────────────────────────
  {
    code: "SCZONE", name: "Suez Canal Economic Zone", type: "SPECIAL_ECONOMIC_ZONE", parentCode: "EG",
    authority: "SCZone Authority",
    country: "EG",
    rules: [
      { rule: "Reduced corporate tax (10% vs 22.5% standard) for manufacturing tenants", authority: "SCZone Authority", precedence: 4, category: "FINANCE", legalRef: "Egyptian Law 72/2017 Art. 35" },
      { rule: "Single-window SCZone permit (overlaps with Nafeza inside the zone)", authority: "SCZone Authority", precedence: 4, category: "CUSTOMS_PROCEDURE", legalRef: "Law 72/2017 Art. 38" },
    ],
  },

  // ── Port Jurisdictions ───────────────────────────────────────────────────────
  {
    code: "EGALX", name: "Port of Alexandria", type: "PORT_JURISDICTION", parentCode: "EG",
    authority: "Alexandria Port Authority + Alexandria Customs",
    country: "EG",
    rules: [
      { rule: "ACI (Advance Cargo Information) via Nafeza mandatory 48h before vessel arrival", authority: "Alexandria Customs", precedence: 5, category: "CUSTOMS_PROCEDURE", legalRef: "Nafeza Rule 2019" },
      { rule: "Port dues: USD 0.85/tonne cargo handling fee", authority: "Alex Port Authority", precedence: 5, category: "PORT_FEE", legalRef: "Alex Port Tariff 2024" },
    ],
  },
  {
    code: "DEHAM", name: "Port of Hamburg", type: "PORT_JURISDICTION", parentCode: "DE",
    authority: "Hamburg Port Authority + Hauptzollamt Hamburg",
    country: "DE",
    rules: [
      { rule: "EU ICS2 ENS filing mandatory 24h before loading at foreign port", authority: "Hamburg HZA", precedence: 5, category: "CUSTOMS_PROCEDURE", legalRef: "EU Reg 2019/632" },
      { rule: "Port dues: EUR 1.20/tonne + harbour master fee", authority: "HPA", precedence: 5, category: "PORT_FEE", legalRef: "HPA Tariff 2024" },
    ],
  },

  // ── Airport Jurisdictions ────────────────────────────────────────────────────
  {
    code: "EGCAI", name: "Cairo International Airport", type: "AIRPORT_JURISDICTION", parentCode: "EG",
    authority: "Cairo Airport Co. + Airport Customs",
    country: "EG",
    rules: [
      { rule: "Air-cargo AWB mandatory 4h before arrival", authority: "Cairo Airport Customs", precedence: 5, category: "CUSTOMS_PROCEDURE", legalRef: "Egyptian Customs Law Art. 39" },
    ],
  },
  {
    code: "DEFRA", name: "Frankfurt Airport", type: "AIRPORT_JURISDICTION", parentCode: "DE",
    authority: "Fraport AG + Hauptzollamt Frankfurt Airport",
    country: "DE",
    rules: [
      { rule: "EU ICS2 ENS filing mandatory for all inbound flights", authority: "FRA HZA", precedence: 5, category: "CUSTOMS_PROCEDURE", legalRef: "EU Reg 2019/632 (ICS2)" },
    ],
  },

  // ── Border Crossings ─────────────────────────────────────────────────────────
  {
    code: "EGRFA", name: "Rafah Border Crossing (EG-GZ)", type: "BORDER_CROSSING", parentCode: "EG",
    authority: "Rafah Border Customs",
    country: "EG",
    rules: [
      { rule: "Restricted — humanitarian + dual-use screening required", authority: "Rafah Border Customs", precedence: 5, category: "EXPORT_CONTROL", legalRef: "Presidential Decree on Rafah 2018" },
    ],
  },
  {
    code: "SASAL", name: "Salwa Border Crossing (SA-QA)", type: "BORDER_CROSSING", parentCode: "SA",
    authority: "Salwa Border Customs (Saudi + Qatari)",
    country: "SA",
    rules: [
      { rule: "GCC intra-union movement — minimal documentation required", authority: "GCC Customs", precedence: 5, category: "CUSTOMS_PROCEDURE", legalRef: "GCC Customs Union Agreement" },
    ],
  },

  // ── Inland Dry Ports ─────────────────────────────────────────────────────────
  {
    code: "EGOCT", name: "6th October Dry Port", type: "INLAND_DRY_PORT", parentCode: "EG",
    authority: "6th October Dry Port Authority",
    country: "EG",
    rules: [
      { rule: "Inland clearance — goods may clear customs here instead of port", authority: "6th October Customs", precedence: 6, category: "CUSTOMS_PROCEDURE", legalRef: "Egyptian Customs Law Art. 41" },
    ],
  },

  // ── Customs Warehouses ───────────────────────────────────────────────────────
  {
    code: "EGBOND1", name: "Alexandria Bonded Warehouse #1", type: "CUSTOMS_WAREHOUSE", parentCode: "EGALX",
    authority: "Warehouse keeper (private) + Alexandria Customs supervision",
    country: "EG",
    rules: [
      { rule: "Storage up to 12 months without duty payment; release triggers duty", authority: "Alexandria Customs", precedence: 7, category: "CUSTOMS_PROCEDURE", legalRef: "Egyptian Customs Law Art. 56" },
    ],
  },

  // ── Free Trade Zones (broader designation) ───────────────────────────────────
  {
    code: "CNFTZ", name: "Shanghai Pilot Free Trade Zone", type: "FREE_TRADE_ZONE", parentCode: "CN",
    authority: "Shanghai FTZ Administration",
    country: "CN",
    rules: [
      { rule: "Negative-list FDI approach — sectors not on list are open", authority: "Shanghai FTZ", precedence: 4, category: "FINANCE", legalRef: "PRC FTZ Catalogue 2024" },
    ],
  },

  // ── Export Processing Zones ──────────────────────────────────────────────────
  {
    code: "EGEPZ-NC", name: "Nasr City Export Processing Zone", type: "EXPORT_PROCESSING_ZONE", parentCode: "EG",
    authority: "General Authority for Investment (GAFI) EPZ Branch",
    country: "EG",
    rules: [
      { rule: "Duty drawback on inputs used for exports", authority: "GAFI", precedence: 4, category: "CUSTOMS_PROCEDURE", legalRef: "Egyptian Investment Law 72/2017" },
    ],
  },

  // ── Offshore Financial Centers ───────────────────────────────────────────────
  {
    code: "AEDIFC", name: "Dubai International Financial Centre", type: "OFFSHORE_FINANCIAL_CENTER", parentCode: "AE",
    authority: "Dubai Financial Services Authority (DFSA)",
    country: "AE",
    rules: [
      { rule: "English common law applies; DIFC courts have jurisdiction", authority: "DIFC", precedence: 4, category: "LEGAL", legalRef: "DIFC Law 9/2004" },
      { rule: "No restriction on foreign exchange repatriation", authority: "DFSA", precedence: 4, category: "FINANCE", legalRef: "DFSA Rulebook 2024" },
    ],
  },
  {
    code: "QAQFC", name: "Qatar Financial Centre", type: "OFFSHORE_FINANCIAL_CENTER", parentCode: "QA",
    authority: "QFC Regulatory Authority (QFCRA)",
    country: "QA",
    rules: [
      { rule: "English common law applies; QFC Civil and Commercial Court", authority: "QFC", precedence: 4, category: "LEGAL", legalRef: "QFC Law 7/2005" },
    ],
  },

  // ── Transit Corridors ───────────────────────────────────────────────────────
  {
    code: "EGSUEZ", name: "Suez Canal Transit Corridor", type: "TRANSIT_CORRIDOR", parentCode: "EG",
    authority: "Suez Canal Authority (SCA)",
    country: "EG",
    rules: [
      { rule: "Transit declaration (T1-equivalent) required; no duty on transit cargo", authority: "Suez Canal Authority", precedence: 5, category: "CUSTOMS_PROCEDURE", legalRef: "Constantinople Convention 1888 Art. 1" },
      { rule: "SCA transit dues: USD/SDR per SCNT (Suez Canal Net Tonnage)", authority: "SCA", precedence: 5, category: "PORT_FEE", legalRef: "SCA Tariff 2024" },
    ],
  },
  {
    code: "TIR-EU-MENA", name: "TIR Convention Transit Corridor (EU-MENA)", type: "TRANSIT_CORRIDOR", parentCode: null,
    authority: "IRU (International Road Transport Union) + national customs",
    rules: [
      { rule: "TIR carnet accepted as single customs document for all 77 TIR contracting parties", authority: "IRU", precedence: 5, category: "CUSTOMS_PROCEDURE", legalRef: "TIR Convention 1975" },
    ],
  },

  // ── Special Administrative Regions ───────────────────────────────────────────
  {
    code: "HK", name: "Hong Kong SAR", type: "SPECIAL_ADMINISTRATIVE_REGION", parentCode: "CN",
    authority: "HKSAR Customs and Excise Department",
    country: "CN",
    rules: [
      { rule: "Separate customs territory — distinct from mainland China (PRC)", authority: "HKSAR Customs", precedence: 3, category: "CUSTOMS_PROCEDURE", legalRef: "Basic Law Art. 116" },
      { rule: "Free port — most goods zero-rated for duty", authority: "HKSAR Customs", precedence: 3, category: "TARIFF", legalRef: "HKSAR Dutiable Commodities Ordinance" },
    ],
  },
  {
    code: "MO", name: "Macao SAR", type: "SPECIAL_ADMINISTRATIVE_REGION", parentCode: "CN",
    authority: "Macao SAR Customs",
    country: "CN",
    rules: [
      { rule: "Separate customs territory — distinct from mainland China (PRC)", authority: "Macao Customs", precedence: 3, category: "CUSTOMS_PROCEDURE", legalRef: "Macao Basic Law Art. 116" },
    ],
  },

  // ── Territorial Waters ───────────────────────────────────────────────────────
  {
    code: "EG-TW", name: "Egypt Territorial Waters (12nm)", type: "TERRITORIAL_WATER", parentCode: "EG",
    authority: "Egyptian Coast Guard + Maritime Customs",
    country: "EG",
    rules: [
      { rule: "Coastal state sovereignty over 12nm territorial sea (UNCLOS Part II)", authority: "Egyptian Coast Guard", precedence: 5, category: "MARITIME", legalRef: "UNCLOS 1982 Part II" },
      { rule: "EEP boarding + inspection rights for customs + sanctions enforcement", authority: "Egyptian Maritime Customs", precedence: 5, category: "SANCTIONS", legalRef: "UNCLOS Art. 110" },
    ],
  },

  // ── Auxiliary countries referenced as parents above ─────────────────────────
  {
    code: "CN", name: "China (PRC)", type: "SOVEREIGN_COUNTRY", parentCode: null,
    authority: "General Administration of Customs of the PRC (GACC)",
    country: "CN",
    rules: [
      { rule: "GACC single-window declaration mandatory", authority: "GACC", precedence: 2, category: "CUSTOMS_PROCEDURE", legalRef: "PRC Customs Law" },
      { rule: "Export control on dual-use per Export Control Law 2020", authority: "MOFCOM", precedence: 2, category: "EXPORT_CONTROL", legalRef: "PRC Export Control Law 2020" },
    ],
  },
  {
    code: "SA", name: "Saudi Arabia", type: "SOVEREIGN_COUNTRY", parentCode: "GCC",
    authority: "ZATCA (Zakat, Tax and Customs Authority)",
    country: "SA",
    rules: [
      { rule: "FASAH single-window declaration mandatory", authority: "ZATCA", precedence: 2, category: "CUSTOMS_PROCEDURE", legalRef: "Saudi Customs Law" },
    ],
  },
  {
    code: "QA", name: "Qatar", type: "SOVEREIGN_COUNTRY", parentCode: "GCC",
    authority: "General Authority of Customs (GAC)",
    country: "QA",
    rules: [
      { rule: "NAKISA single-window declaration mandatory", authority: "GAC", precedence: 2, category: "CUSTOMS_PROCEDURE", legalRef: "Qatar Customs Law 2002" },
    ],
  },
];
