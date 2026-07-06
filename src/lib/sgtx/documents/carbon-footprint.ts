// SGTX Part 5.9 — Carbon Footprint (ISO 14067)
//
// This module computes TWO separate emissions figures and keeps them clearly
// distinct in the result type:
//
//   1. TRANSPORT (logistics) emissions — Scope 1+2+3 of moving goods from
//      origin to destination (vessel/truck/rail/air fuel, cold-chain
//      electricity, well-to-tank). Reported as `scope1`, `scope2`, `scope3`
//      and `total` (transport total). Useful for logistics carbon reporting
//      (CDP, GLEC Framework, ISO 14083).
//
//   2. PRODUCTION (embedded) emissions — Scope 1+2 of MANUFACTURING the goods
//      at the producer's installation. This is the figure CBAM requires:
//      the carbon intensity embodied in the goods themselves. NOT transport.
//      Reported as `productionEmissionsKg`. For CBAM goods the same value is
//      also surfaced as `embeddedEmissionsKg` (CBAM terminology).
//
// CBAM embedded emissions are computed ONLY for CBAM goods (EU Reg 2023/956
// Annex I) shipped to the EU. For non-CBAM goods, `embeddedEmissionsKg` = 0
// unless the caller supplies an explicit `productionEmissionsKgCO2ePerTonne`
// (in which case `productionEmissionsKg` is still populated for transparency).
//
// IMPORTANT: EUDR (EU Deforestation Regulation, Reg (EU) 2023/1115) is NOT
// implemented here — it lives in a separate EUDR module.

// ============ CBAM Goods (mirror of src/app/api/sgtx/customs/cbam/route.ts) ============
// Must stay in sync with the canonical list in the CBAM route file.
// EU Reg 2023/956 Annex I — matched by first 4 digits of HS code (heading).
const CBAM_GOODS: Array<{ chapter?: string; chapters?: string[]; name: string }> = [
  { chapter: "2523", name: "Cement clinker" },
  { chapter: "2814", name: "Ammonia" },
  { chapter: "2845", name: "Hydrogen" },
  { chapter: "3102", name: "Nitrogen fertilisers" },
  { chapter: "3103", name: "Phosphatic fertilisers" },
  { chapter: "3104", name: "Potassic fertilisers" },
  { chapter: "3105", name: "Mixed fertilisers" },
  { chapter: "2716", name: "Electricity" },
  {
    chapters: [
      "7201","7202","7203","7204","7205","7206","7207","7208","7209","7210",
      "7211","7212","7213","7214","7215","7216","7217","7218","7219","7220",
      "7221","7222","7223","7224","7225","7226","7227","7228","7229","7230",
    ],
    name: "Iron and steel",
  },
  {
    chapters: [
      "7301","7302","7303","7304","7305","7306","7307","7308","7309","7310",
      "7311","7312","7313","7314","7315","7316","7317","7318","7319","7320",
      "7321","7322","7323","7324","7325","7326",
    ],
    name: "Iron/steel articles",
  },
  {
    chapters: [
      "7601","7602","7603","7604","7605","7606","7607","7608","7609","7610",
      "7611","7612","7613","7614","7615","7616",
    ],
    name: "Aluminium",
  },
];

// EU member states (CBAM applies to imports INTO the EU customs territory).
const EU_COUNTRIES = [
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE",
  "IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
];

function matchCbamGood(hsCode: string): { name: string } | null {
  const head4 = (hsCode || "").replace(/[^0-9]/g, "").substring(0, 4);
  if (head4.length < 4) return null;
  for (const g of CBAM_GOODS) {
    if (g.chapter && g.chapter === head4) return { name: g.name };
    if (g.chapters && g.chapters.includes(head4)) return { name: g.name };
  }
  return null;
}

// ============ Default production emission factors (tCO2e per tonne of product) ============
// Used when the caller does NOT supply an explicit `productionEmissionsKgCO2ePerTonne`.
// These are TYPICAL installation intensities (NOT EU best-in-class benchmarks).
// Sources: IEA World Energy Outlook, World Steel Association, IAI, IFA, IEA Hydrogen.
const DEFAULT_PRODUCTION_FACTORS_TCO2E_PER_T: Record<string, number> = {
  "Cement clinker": 0.9,        // ~0.9 tCO2e/t clinker (global avg, dry process)
  "Ammonia": 2.5,               // ~2.5 tCO2e/t NH3 (grey ammonia from natural gas)
  "Hydrogen": 0.5,              // ~0.5 tCO2e/t (lower bound; grey H2 from SMR ~10)
  "Nitrogen fertilisers": 2.5,  // ~2.5 tCO2e/t (urea/ammonium nitrate avg)
  "Phosphatic fertilisers": 1.0,
  "Potassic fertilisers": 0.5,
  "Mixed fertilisers": 2.0,
  "Electricity": 0.4,           // tCO2e/MWh (global grid average)
  "Iron and steel": 1.8,        // ~1.8 tCO2e/t crude steel (BF-BOF global avg)
  "Iron/steel articles": 1.8,
  "Aluminium": 16.5,            // ~16.5 tCO2e/t Al (global avg incl. electricity)
};

// ============ Transport emission factors (kg CO2e per tonne-km) ============
const EMISSION_FACTORS: Record<string, { scope1: number; scope2: number; scope3: number }> = {
  OCEAN: { scope1: 0.016, scope2: 0.002, scope3: 0.008 },
  AIR: { scope1: 0.602, scope2: 0.05, scope3: 0.1 },
  RAIL: { scope1: 0.022, scope2: 0.003, scope3: 0.005 },
  TRUCK: { scope1: 0.062, scope2: 0.004, scope3: 0.012 },
};

const ROUTE_DISTANCES: Record<string, number> = {
  "EG-DE": 3200, "EG-IT": 2500, "EG-SA": 1800, "EG-AE": 2800,
  "VN-DE": 9500, "VN-US": 11500, "US-CN": 10500, "DE-US": 7500,
  "EG-JP": 9500, "EG-US": 8500,
};

export interface CarbonResult {
  ustn: string;
  hsCode?: string;
  // --- Transport (logistics) emissions, kg CO2e ---
  scope1: number;
  scope2: number;
  scope3: number;
  total: number; // total transport emissions (scope1+scope2+scope3)
  // --- Production (embedded) emissions, kg CO2e ---
  productionEmissionsKg: number; // production Scope 1+2 of manufacturing the goods
  embeddedEmissionsKg: number;   // CBAM embedded emissions (= productionEmissionsKg when cbamApplicable, else 0)
  cbamApplicable: boolean;
  cbamGood?: string | null;
  confidenceInterval: [number, number];
  dataSources: string[];
  modelVersion: string;
}

export function calculateCarbonFootprint(input: {
  ustn: string;
  transportMode: string;
  originCountry: string;
  destCountry: string;
  grossWeightKg: number;
  distanceKm?: number;
  coldChain?: boolean;
  hsCode?: string;
  /** Production carbon intensity, kg CO2e per tonne of product (Scope 1+2 of manufacturing). */
  productionEmissionsKgCO2ePerTonne?: number;
}): CarbonResult {
  const factors = EMISSION_FACTORS[input.transportMode] || EMISSION_FACTORS.OCEAN;
  const distance = input.distanceKm || ROUTE_DISTANCES[`${input.originCountry}-${input.destCountry}`] || 5000;
  const weightTonnes = input.grossWeightKg / 1000;

  // --- TRANSPORT emissions (Scope 1+2+3 of logistics) ---
  const scope1 = Math.round(factors.scope1 * distance * weightTonnes * 100) / 100;
  const scope2 = Math.round(factors.scope2 * distance * weightTonnes * (input.coldChain ? 1.15 : 1) * 100) / 100;
  const scope3 = Math.round(factors.scope3 * distance * weightTonnes * 100) / 100;
  const total = Math.round((scope1 + scope2 + scope3) * 100) / 100;

  // --- PRODUCTION (embedded) emissions ---
  const cbamGood = input.hsCode ? matchCbamGood(input.hsCode) : null;
  const isEU = EU_COUNTRIES.includes((input.destCountry || "").toUpperCase());
  const cbamApplicable = !!cbamGood && isEU;

  let productionIntensityTonne: number; // tCO2e per tonne of product
  if (typeof input.productionEmissionsKgCO2ePerTonne === "number") {
    // Explicit intensity takes precedence — the caller is asserting the actual
    // production carbon intensity (e.g. from an EU CBAM third-party verifier or
    // an operator-specific LCA). Applies regardless of CBAM status.
    productionIntensityTonne = input.productionEmissionsKgCO2ePerTonne / 1000;
  } else if (cbamGood) {
    // Default factor only for CBAM goods (per Task spec).
    productionIntensityTonne = DEFAULT_PRODUCTION_FACTORS_TCO2E_PER_T[cbamGood.name] ?? 0;
  } else {
    productionIntensityTonne = 0;
  }

  const productionEmissionsKg = Math.round(productionIntensityTonne * weightTonnes * 1000 * 100) / 100;

  // embeddedEmissionsKg = the CBAM-relevant figure. For CBAM goods this equals
  // production emissions. When the caller supplies an explicit intensity we also
  // surface it as embeddedEmissionsKg (the verifier-attested number IS the CBAM
  // embedded emissions). Otherwise, for non-CBAM goods, embeddedEmissionsKg = 0.
  const embeddedEmissionsKg =
    cbamApplicable || typeof input.productionEmissionsKgCO2ePerTonne === "number"
      ? productionEmissionsKg
      : 0;

  return {
    ustn: input.ustn,
    hsCode: input.hsCode,
    scope1,
    scope2,
    scope3,
    total,
    productionEmissionsKg,
    embeddedEmissionsKg,
    cbamApplicable,
    cbamGood: cbamGood?.name ?? null,
    confidenceInterval: [Math.round(total * 0.85 * 100) / 100, Math.round(total * 1.15 * 100) / 100],
    dataSources: [
      "IMO EEXI 2025",
      "IEA grid factors 2025",
      "Sea/Road distance calculator",
      "EU Reg 2023/956 Annex I (CBAM goods)",
    ],
    modelVersion: "SGTX-CARBON-2.0",
  };
}

export function generateCbamXml(result: CarbonResult): string {
  if (!result.cbamApplicable) return "";
  return `<?xml version="1.0"?><CbamReport><Ustn>${result.ustn}</Ustn><HsCode>${result.hsCode || ""}</HsCode><CbamGood>${result.cbamGood || ""}</CbamGood><ProductionEmissionsKg>${result.productionEmissionsKg}</ProductionEmissionsKg><EmbeddedEmissionsKg>${result.embeddedEmissionsKg}</EmbeddedEmissionsKg><TransportEmissionsKg><Scope1>${result.scope1}</Scope1><Scope2>${result.scope2}</Scope2><Scope3>${result.scope3}</Scope3><Total>${result.total}</Total></TransportEmissionsKg></CbamReport>`;
}
