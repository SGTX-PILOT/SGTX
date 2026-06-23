// SGTX Perishable Cargo Requirements Database
// Comprehensive temperature, humidity, and air circulation requirements for
// fruits, vegetables, and other perishable commodities under reefer transport.
// Based on USDA, FDA, Codex Alimentarius, and major shipping line reefer guidelines.

export interface PerishableRequirement {
  commodity: string;
  hsCode: string;
  category: "Fresh Fruit" | "Fresh Vegetable" | "Frozen Fruit" | "Frozen Vegetable" | "Meat" | "Dairy" | "Seafood" | "Flowers" | "Pharma";
  // Temperature
  setPointTempC: number;          // carrier set point (°C)
  temperatureMinC: number;        // minimum allowable (°C)
  temperatureMaxC: number;        // maximum allowable (°C)
  temperatureToleranceC: number;  // ±°C tolerance
  // Humidity
  humidityMinPct: number;         // relative humidity minimum (%)
  humidityMaxPct: number;         // relative humidity maximum (%)
  // Air circulation
  airCirculationCfm: number;      // cubic feet per minute (CFM)
  airCirculationMode: "CONTINUOUS" | "CYCLE" | "CONTROLLED_ATMOSPHERE";
  freshAirVentPct: number;        // fresh air ventilation (% open) — 0 for CA
  // Atmosphere (Controlled/Modified)
  controlledAtmosphere?: {
    o2Pct: number;                // oxygen %
    co2Pct: number;               // carbon dioxide %
    n2Pct: number;                // nitrogen %
  };
  // Other
  maxStorageDays: number;         // maximum reefer storage days
  ethyleneSensitive: boolean;     // sensitive to ethylene?
  ethyleneProducer: boolean;      // produces ethylene?
  preCoolingRequired: boolean;    // pre-cooling required before loading
  humidityControlRequired: boolean;
  notes: string[];
  source: "database" | "ai";
}

// ─── Comprehensive perishable requirements database ───
// Sources: Maersk Reefers Guide, MSC Reefer Manual, USDA Handbook 66,
// IIR (International Institute of Refrigeration) recommendations
export const PERISHABLE_DB: PerishableRequirement[] = [
  // ═══ FRESH FRUITS ═══
  {
    commodity: "Strawberries (fresh)",
    hsCode: "0810.10",
    category: "Fresh Fruit",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 7, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Highly perishable — rapid pre-cooling to 0°C within 6h of harvest", "Pre-cooling @ 0.5°C recommended", "Avoid ethylene exposure (causes softening)", "Modified Atmosphere Packaging (MAP) extends shelf life to 14 days"],
    source: "database",
  },
  {
    commodity: "Strawberries (frozen IQF)",
    hsCode: "0811.10",
    category: "Frozen Fruit",
    setPointTempC: -22, temperatureMinC: -25, temperatureMaxC: -18, temperatureToleranceC: 2,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 0,
    maxStorageDays: 365, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["IQF (Individually Quick Frozen) — blast freeze at -35°C before storage", "Maintain deep frozen chain (-18°C or colder)", "No fresh air ventilation (sealed)", "Do not re-freeze after thawing"],
    source: "database",
  },
  {
    commodity: "Oranges (fresh)",
    hsCode: "0805.10",
    category: "Fresh Fruit",
    setPointTempC: 4, temperatureMinC: 3, temperatureMaxC: 6, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 56, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Cold treatment for fruit fly (Ceratitis capitata) export: 1°C for 14 days continuous (Japan, Korea, US)", "Temperature below 3°C causes chilling injury", "Degreening requires 20-25°C + ethylene — done pre-shipment"],
    source: "database",
  },
  {
    commodity: "Lemons (fresh)",
    hsCode: "0805.20",
    category: "Fresh Fruit",
    setPointTempC: 10, temperatureMinC: 9, temperatureMaxC: 12, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 90, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Sensitive to chilling injury below 9°C", "Irradiation (150 Gy) for some export markets (VN, AU)"],
    source: "database",
  },
  {
    commodity: "Mandarins / Tangerines (fresh)",
    hsCode: "0805.21",
    category: "Fresh Fruit",
    setPointTempC: 5, temperatureMinC: 4, temperatureMaxC: 7, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 42, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Cold treatment option: 1.5°C for 17 days"],
    source: "database",
  },
  {
    commodity: "Grapes (fresh table grapes)",
    hsCode: "0806.10",
    category: "Fresh Fruit",
    setPointTempC: -0.5, temperatureMinC: -1, temperatureMaxC: 0.5, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 56, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["SO2 generator pads (UVAS) for mold prevention (Botrytis)", "Pre-cool within 4h of harvest to -0.5°C", "CA storage: 2% O2 + 5% CO2 extends shelf life"],
    source: "database",
  },
  {
    commodity: "Apples (fresh)",
    hsCode: "0808.10",
    category: "Fresh Fruit",
    setPointTempC: -1, temperatureMinC: -2, temperatureMaxC: 0, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3000, airCirculationMode: "CONTROLLED_ATMOSPHERE", freshAirVentPct: 0,
    controlledAtmosphere: { o2Pct: 2, co2Pct: 2, n2Pct: 96 },
    maxStorageDays: 240, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["CA storage essential for long-term (2% O2, 2% CO2, 96% N2)", "Ethylene scrubber recommended", "Some varieties sensitive to CO2 injury (>5%)", "Scald prevention: DPA treatment (1-2 g/L)"],
    source: "database",
  },
  {
    commodity: "Pears (fresh)",
    hsCode: "0808.30",
    category: "Fresh Fruit",
    setPointTempC: -1, temperatureMinC: -1.5, temperatureMaxC: 0, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3000, airCirculationMode: "CONTROLLED_ATMOSPHERE", freshAirVentPct: 0,
    controlledAtmosphere: { o2Pct: 2, co2Pct: 1, n2Pct: 97 },
    maxStorageDays: 180, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["CA storage: 2% O2 + 1% CO2", "Ripening induction with ethylene (100 ppm, 24h) before marketing"],
    source: "database",
  },
  {
    commodity: "Bananas (fresh)",
    hsCode: "0803.90",
    category: "Fresh Fruit",
    setPointTempC: 13.5, temperatureMinC: 13, temperatureMaxC: 14, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 4500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 25,
    maxStorageDays: 28, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: false, humidityControlRequired: true,
    notes: ["CRITICAL: never below 13°C (chilling injury — brown peel)", "Ethylene scrubber essential (bananas produce high ethylene)", "Ripening rooms: 18-20°C + 100-150 ppm ethylene for 24h", "MAP bags (Banavac) extend transit life"],
    source: "database",
  },
  {
    commodity: "Mangoes (fresh)",
    hsCode: "0804.50",
    category: "Fresh Fruit",
    setPointTempC: 10, temperatureMinC: 9, temperatureMaxC: 12, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 21, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Hot water treatment (46°C, 90 min) for fruit fly (USDA APHIS)", "Irradiation (150 Gy) alternative", "Chilling injury below 8°C", "CA storage: 5% O2 + 5% CO2 extends shelf life"],
    source: "database",
  },
  {
    commodity: "Avocados (fresh Hass)",
    hsCode: "0804.40",
    category: "Fresh Fruit",
    setPointTempC: 5, temperatureMinC: 4, temperatureMaxC: 6, temperatureToleranceC: 0.5,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 28, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["CA storage: 2% O2 + 10% CO2", "Controlled ripening at 18-20°C + 100 ppm ethylene", "Chilling injury below 4°C (varies by variety)"],
    source: "database",
  },
  {
    commodity: "Pineapples (fresh)",
    hsCode: "0804.30",
    category: "Fresh Fruit",
    setPointTempC: 8, temperatureMinC: 7, temperatureMaxC: 10, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 28, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: false,
    notes: ["Chilling injury below 7°C", "No CA storage (low response)"],
    source: "database",
  },
  {
    commodity: "Kiwis (fresh)",
    hsCode: "0810.50",
    category: "Fresh Fruit",
    setPointTempC: 0, temperatureMinC: -0.5, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3000, airCirculationMode: "CONTROLLED_ATMOSPHERE", freshAirVentPct: 0,
    controlledAtmosphere: { o2Pct: 2, co2Pct: 5, n2Pct: 93 },
    maxStorageDays: 120, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["EXTREMELY ethylene sensitive (even 10 ppb causes softening)", "Ethylene scrubber essential", "CA: 2% O2 + 5% CO2 extends to 6+ months"],
    source: "database",
  },
  {
    commodity: "Blueberries (fresh)",
    hsCode: "0810.40",
    category: "Fresh Fruit",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 21, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Rapid pre-cooling within 4h", "MAP packaging extends shelf life"],
    source: "database",
  },
  {
    commodity: "Cherries (fresh)",
    hsCode: "0809.20",
    category: "Fresh Fruit",
    setPointTempC: -0.5, temperatureMinC: -1, temperatureMaxC: 0, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 21, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Hydro-cooling recommended at harvest", "MAP (15% O2 + 5% CO2) extends shelf life"],
    source: "database",
  },
  {
    commodity: "Peaches / Nectarines (fresh)",
    hsCode: "0809.30",
    category: "Fresh Fruit",
    setPointTempC: -0.5, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 28, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["CA: 2% O2 + 5% CO2", "Chilling injury for some varieties below -1°C"],
    source: "database",
  },
  {
    commodity: "Watermelons (fresh)",
    hsCode: "0807.11",
    category: "Fresh Fruit",
    setPointTempC: 10, temperatureMinC: 8, temperatureMaxC: 12, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 2500, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 21, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: false, humidityControlRequired: false,
    notes: ["Chilling injury below 7°C"],
    source: "database",
  },

  // ═══ FRESH VEGETABLES ═══
  {
    commodity: "Tomatoes (fresh ripe)",
    hsCode: "0702.00",
    category: "Fresh Vegetable",
    setPointTempC: 8, temperatureMinC: 7, temperatureMaxC: 10, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 15,
    maxStorageDays: 21, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Ripe tomatoes: 8-10°C", "Mature-green tomatoes: 12-15°C (for ripening)", "Never below 7°C (chilling injury — flavor loss)", "Ethylene accelerates ripening (use for ripening rooms)"],
    source: "database",
  },
  {
    commodity: "Potatoes (fresh table)",
    hsCode: "0701.90",
    category: "Fresh Vegetable",
    setPointTempC: 4, temperatureMinC: 3, temperatureMaxC: 5, temperatureToleranceC: 1,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 180, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: false, humidityControlRequired: true,
    notes: ["Curing: 13-15°C + 95% RH for 7-14 days before storage", "Below 3°C: sugars convert (sweet taste, dark fry color)", "Sprout inhibitor (CIPC) for long storage"],
    source: "database",
  },
  {
    commodity: "Onions (fresh)",
    hsCode: "0703.10",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 1,
    humidityMinPct: 65, humidityMaxPct: 70,
    airCirculationCfm: 3000, airCirculationMode: "CONTINUOUS", freshAirVentPct: 25,
    maxStorageDays: 120, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["LOW humidity (65-70%) to prevent root growth + rot", "Curing: 25-30°C + 75% RH for 7-14 days before storage", "NEVER store with other produce (onion odor transfer)"],
    source: "database",
  },
  {
    commodity: "Garlic (fresh)",
    hsCode: "0703.20",
    category: "Fresh Vegetable",
    setPointTempC: -1, temperatureMinC: -2, temperatureMaxC: 0, temperatureToleranceC: 0.5,
    humidityMinPct: 60, humidityMaxPct: 70,
    airCirculationCfm: 2500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 20,
    maxStorageDays: 240, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Curing: 25-30°C for 7-14 days before storage", "Low humidity essential (60-70%)"],
    source: "database",
  },
  {
    commodity: "Carrots (fresh)",
    hsCode: "0706.10",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 95, humidityMaxPct: 100,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 90, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["High humidity essential (95-100%) to prevent shriveling", "Ethylene causes bitterness"],
    source: "database",
  },
  {
    commodity: "Lettuce (fresh)",
    hsCode: "0705.21",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -0.5, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 95, humidityMaxPct: 100,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 21, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Vacuum cooling recommended", "Ethylene causes russet spotting (brown patches)", "High humidity prevents wilting"],
    source: "database",
  },
  {
    commodity: "Cabbage (fresh)",
    hsCode: "0704.90",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 95, humidityMaxPct: 100,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 120, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Ethylene causes yellowing + off-flavors", "Storage up to 6 months with CA"],
    source: "database",
  },
  {
    commodity: "Cauliflower (fresh)",
    hsCode: "0704.10",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3000, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 28, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Ethylene causes yellowing"],
    source: "database",
  },
  {
    commodity: "Broccoli (fresh)",
    hsCode: "0704.20",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 95, humidityMaxPct: 100,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 21, ethyleneSensitive: true, ethyleneProducer: true,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Top-ice or slurry-ice recommended", "Very high respiration rate — needs continuous air flow", "Ice injection recommended"],
    source: "database",
  },
  {
    commodity: "Cucumbers (fresh)",
    hsCode: "0707.00",
    category: "Fresh Vegetable",
    setPointTempC: 10, temperatureMinC: 8, temperatureMaxC: 12, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 2500, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 14, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Chilling injury below 7°C (pitting, decay)", "Ethylene causes yellowing + softening"],
    source: "database",
  },
  {
    commodity: "Bell Peppers (fresh)",
    hsCode: "0709.60",
    category: "Fresh Vegetable",
    setPointTempC: 8, temperatureMinC: 7, temperatureMaxC: 10, temperatureToleranceC: 1,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 21, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Chilling injury below 7°C"],
    source: "database",
  },
  {
    commodity: "Eggplants (fresh)",
    hsCode: "0709.30",
    category: "Fresh Vegetable",
    setPointTempC: 8, temperatureMinC: 7, temperatureMaxC: 10, temperatureToleranceC: 1,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CYCLE", freshAirVentPct: 10,
    maxStorageDays: 14, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Chilling injury below 7°C (browning, pitting)"],
    source: "database",
  },
  {
    commodity: "Mushrooms (fresh)",
    hsCode: "0709.51",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 2, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 7, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Very short shelf life (7 days max)", "Vacuum cooling recommended", "MAP (3% O2 + 10% CO2) extends shelf life"],
    source: "database",
  },
  {
    commodity: "Green Beans (fresh)",
    hsCode: "0708.20",
    category: "Fresh Vegetable",
    setPointTempC: 4, temperatureMinC: 3, temperatureMaxC: 6, temperatureToleranceC: 1,
    humidityMinPct: 95, humidityMaxPct: 100,
    airCirculationCfm: 3000, airCirculationMode: "CONTINUOUS", freshAirVentPct: 10,
    maxStorageDays: 14, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["High respiration rate — needs rapid cooling", "Chilling injury below 3°C for some varieties"],
    source: "database",
  },
  {
    commodity: "Peas (fresh)",
    hsCode: "0708.10",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 95, humidityMaxPct: 100,
    airCirculationCfm: 3000, airCirculationMode: "CONTINUOUS", freshAirVentPct: 10,
    maxStorageDays: 7, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Very high respiration rate — rapid pre-cooling essential"],
    source: "database",
  },
  {
    commodity: "Spinach (fresh)",
    hsCode: "0709.70",
    category: "Fresh Vegetable",
    setPointTempC: 0, temperatureMinC: -1, temperatureMaxC: 1, temperatureToleranceC: 0.5,
    humidityMinPct: 95, humidityMaxPct: 100,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 14, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Vacuum cooling essential", "Very high respiration rate"],
    source: "database",
  },

  // ═══ FROZEN VEGETABLES ═══
  {
    commodity: "Frozen Vegetables (mixed)",
    hsCode: "0710.80",
    category: "Frozen Vegetable",
    setPointTempC: -22, temperatureMinC: -25, temperatureMaxC: -18, temperatureToleranceC: 2,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 0,
    maxStorageDays: 365, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["IQF blast freeze at -35°C before storage", "Maintain -18°C or colder"],
    source: "database",
  },
  {
    commodity: "Frozen Peas",
    hsCode: "0710.21",
    category: "Frozen Vegetable",
    setPointTempC: -22, temperatureMinC: -25, temperatureMaxC: -18, temperatureToleranceC: 2,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 0,
    maxStorageDays: 365, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["IQF recommended"],
    source: "database",
  },

  // ═══ MEAT & SEAFOOD ═══
  {
    commodity: "Frozen Beef",
    hsCode: "0202.30",
    category: "Meat",
    setPointTempC: -22, temperatureMinC: -25, temperatureMaxC: -18, temperatureToleranceC: 2,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 0,
    maxStorageDays: 365, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: false,
    notes: ["Deep frozen chain -18°C or colder", "Blast freeze at -35°C"],
    source: "database",
  },
  {
    commodity: "Chilled Beef",
    hsCode: "0201.30",
    category: "Meat",
    setPointTempC: -1, temperatureMinC: -1.5, temperatureMaxC: 0, temperatureToleranceC: 0.5,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3000, airCirculationMode: "CONTINUOUS", freshAirVentPct: 5,
    maxStorageDays: 70, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Vacuum packed + CA (80% O2 + 20% CO2) extends to 70 days", "Strictly maintain -1 to 0°C"],
    source: "database",
  },
  {
    commodity: "Frozen Chicken",
    hsCode: "0207.14",
    category: "Meat",
    setPointTempC: -22, temperatureMinC: -25, temperatureMaxC: -18, temperatureToleranceC: 2,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 0,
    maxStorageDays: 365, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: false,
    notes: ["Blast freeze at -35°C"],
    source: "database",
  },
  {
    commodity: "Frozen Shrimp",
    hsCode: "0306.17",
    category: "Seafood",
    setPointTempC: -22, temperatureMinC: -25, temperatureMaxC: -18, temperatureToleranceC: 2,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 2500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 0,
    maxStorageDays: 180, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: false,
    notes: ["Glazing (ice coating) prevents freezer burn"],
    source: "database",
  },
  {
    commodity: "Fresh Salmon (chilled)",
    hsCode: "0302.11",
    category: "Seafood",
    setPointTempC: -1, temperatureMinC: -1.5, temperatureMaxC: 0, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 3500, airCirculationMode: "CONTINUOUS", freshAirVentPct: 10,
    maxStorageDays: 14, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Slurry ice or flake ice", "Strict 0°C maintenance", "MAP (40% CO2 + 60% O2)"],
    source: "database",
  },

  // ═══ DAIRY ═══
  {
    commodity: "Cheese (hard, cheddar type)",
    hsCode: "0406.90",
    category: "Dairy",
    setPointTempC: 4, temperatureMinC: 2, temperatureMaxC: 6, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 2500, airCirculationMode: "CYCLE", freshAirVentPct: 5,
    maxStorageDays: 180, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Aging: 8-12°C for 3-12 months", "Storage: 2-6°C after cutting"],
    source: "database",
  },
  {
    commodity: "Butter",
    hsCode: "0405.10",
    category: "Dairy",
    setPointTempC: -10, temperatureMinC: -15, temperatureMaxC: -5, temperatureToleranceC: 2,
    humidityMinPct: 80, humidityMaxPct: 85,
    airCirculationCfm: 2000, airCirculationMode: "CYCLE", freshAirVentPct: 0,
    maxStorageDays: 180, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: false,
    notes: ["Frozen storage -15°C for long-term", "Short-term: 0-4°C"],
    source: "database",
  },
  {
    commodity: "Milk Powder",
    hsCode: "0402.21",
    category: "Dairy",
    setPointTempC: 15, temperatureMinC: 10, temperatureMaxC: 20, temperatureToleranceC: 3,
    humidityMinPct: 40, humidityMaxPct: 50,
    airCirculationCfm: 2000, airCirculationMode: "CYCLE", freshAirVentPct: 5,
    maxStorageDays: 730, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: false, humidityControlRequired: true,
    notes: ["LOW humidity essential (40-50%) — moisture causes caking", "Ambient storage possible (no reefer needed if dry)"],
    source: "database",
  },

  // ═══ CUT FLOWERS ═══
  {
    commodity: "Cut Roses",
    hsCode: "0603.11",
    category: "Flowers",
    setPointTempC: 1, temperatureMinC: 0, temperatureMaxC: 2, temperatureToleranceC: 0.5,
    humidityMinPct: 90, humidityMaxPct: 95,
    airCirculationCfm: 4000, airCirculationMode: "CONTINUOUS", freshAirVentPct: 20,
    maxStorageDays: 14, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Pre-cool within 1h of harvest", "Ethylene scrubber essential (causes petal drop)", "STS (silver thiosulfate) treatment pre-shipment", "Dry pack or wet pack"],
    source: "database",
  },

  // ═══ PHARMACEUTICALS ═══
  {
    commodity: "Pharmaceuticals (2-8°C cold chain)",
    hsCode: "3004.90",
    category: "Pharma",
    setPointTempC: 5, temperatureMinC: 2, temperatureMaxC: 8, temperatureToleranceC: 1.5,
    humidityMinPct: 45, humidityMaxPct: 65,
    airCirculationCfm: 2000, airCirculationMode: "CONTINUOUS", freshAirVentPct: 5,
    maxStorageDays: 365, ethyleneSensitive: false, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["GDP (Good Distribution Practice) compliance required", "Temperature loggers mandatory", "NEVER freeze (below 0°C destroys proteins)", "NEVER exceed 8°C (potency loss)", "Continuous temperature monitoring + data logger"],
    source: "database",
  },
];

export function searchPerishableDB(commodity: string, hsCode?: string): PerishableRequirement | null {
  // Try HS code exact match first
  if (hsCode) {
    const clean = hsCode.replace(/\D/g, "").slice(0, 4);
    const byHs = PERISHABLE_DB.find((p) => p.hsCode.replace(/\D/g, "").slice(0, 4) === clean);
    if (byHs) return byHs;
  }

  // Try fuzzy commodity name match
  const q = commodity.toLowerCase();
  let best: PerishableRequirement | null = null;
  let bestScore = 0;
  for (const p of PERISHABLE_DB) {
    let score = 0;
    const pc = p.commodity.toLowerCase();
    if (pc === q) score += 100;
    else if (pc.includes(q)) score += 50;
    else if (q.includes(pc)) score += 40;
    // Word-level match
    for (const w of q.split(/\s+/).filter((w) => w.length > 3)) {
      if (pc.includes(w)) score += 10;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore > 0 ? best : null;
}

export function getAllCategories(): string[] {
  return Array.from(new Set(PERISHABLE_DB.map((p) => p.category))).sort();
}

export function getAllCommodities(): { commodity: string; hsCode: string; category: string }[] {
  return PERISHABLE_DB.map((p) => ({ commodity: p.commodity, hsCode: p.hsCode, category: p.category }));
}

// AI fallback for commodities not in DB
export async function getPerishableRequirements(input: {
  commodity: string;
  hsCode?: string;
}): Promise<PerishableRequirement> {
  // 1. Try DB first
  const dbMatch = searchPerishableDB(input.commodity, input.hsCode);
  if (dbMatch) return dbMatch;

  // 2. AI fallback — generate requirements for unknown commodity
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: "You are a reefer cargo expert with knowledge of perishable cargo transport requirements (temperature, humidity, air circulation). Respond with VALID JSON ONLY based on USDA Handbook 66, IIR recommendations, and major shipping line reefer manuals.",
        },
        {
          role: "user",
          content: `Provide reefer transport requirements for: ${input.commodity} (HS ${input.hsCode || "unknown"}).

Respond with VALID JSON only:
{
  "commodity": "${input.commodity}",
  "category": "Fresh Fruit | Fresh Vegetable | Frozen Fruit | Frozen Vegetable | Meat | Dairy | Seafood | Flowers | Pharma",
  "set_point_temp_c": 4,
  "temperature_min_c": 3,
  "temperature_max_c": 6,
  "temperature_tolerance_c": 1,
  "humidity_min_pct": 85,
  "humidity_max_pct": 90,
  "air_circulation_cfm": 3000,
  "air_circulation_mode": "CONTINUOUS | CYCLE | CONTROLLED_ATMOSPHERE",
  "fresh_air_vent_pct": 15,
  "max_storage_days": 21,
  "ethylene_sensitive": false,
  "ethylene_producer": false,
  "pre_cooling_required": true,
  "humidity_control_required": true,
  "notes": ["Note 1", "Note 2"],
  "reasoning": "Brief explanation"
}

Rules:
- All temperatures in °C
- CFM = cubic feet per minute (typical 2000-4500)
- fresh_air_vent_pct = % open (0 for frozen/CA, 5-25 for fresh)
- Include chilling injury thresholds if known
- Include ethylene sensitivity (fruits often sensitive)
- Include pre-cooling requirement (fresh produce usually needs it)`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        commodity: parsed.commodity || input.commodity,
        hsCode: input.hsCode || "unknown",
        category: parsed.category || "Fresh Fruit",
        setPointTempC: parsed.set_point_temp_c ?? 4,
        temperatureMinC: parsed.temperature_min_c ?? 3,
        temperatureMaxC: parsed.temperature_max_c ?? 6,
        temperatureToleranceC: parsed.temperature_tolerance_c ?? 1,
        humidityMinPct: parsed.humidity_min_pct ?? 85,
        humidityMaxPct: parsed.humidity_max_pct ?? 90,
        airCirculationCfm: parsed.air_circulation_cfm ?? 3000,
        airCirculationMode: parsed.air_circulation_mode || "CONTINUOUS",
        freshAirVentPct: parsed.fresh_air_vent_pct ?? 15,
        controlledAtmosphere: parsed.controlled_atmosphere,
        maxStorageDays: parsed.max_storage_days ?? 21,
        ethyleneSensitive: Boolean(parsed.ethylene_sensitive),
        ethyleneProducer: Boolean(parsed.ethylene_producer),
        preCoolingRequired: Boolean(parsed.pre_cooling_required),
        humidityControlRequired: Boolean(parsed.humidity_control_required),
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        source: "ai",
      };
    }
  } catch (err) {
    // Fall through to default
  }

  // 3. Default fallback
  return {
    commodity: input.commodity,
    hsCode: input.hsCode || "unknown",
    category: "Fresh Fruit",
    setPointTempC: 4, temperatureMinC: 3, temperatureMaxC: 6, temperatureToleranceC: 1,
    humidityMinPct: 85, humidityMaxPct: 90,
    airCirculationCfm: 3000, airCirculationMode: "CONTINUOUS", freshAirVentPct: 15,
    maxStorageDays: 14, ethyleneSensitive: true, ethyleneProducer: false,
    preCoolingRequired: true, humidityControlRequired: true,
    notes: ["Default fallback requirements — verify with carrier reefer manual"],
    source: "ai",
  };
}
