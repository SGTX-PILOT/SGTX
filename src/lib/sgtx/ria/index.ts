// SGTX Part 4 — RIA (Regulatory Intelligence Agent)
// Maintained tables: CommodityPackingDefault, TreatmentRequirement, CountryMrl,
// PortSpecialRule, CommodityDynamicSchemaCache, Port.
// All tables are seeded by the RIA scraper (simulated) and updated on a 6-hour cron.

import { db } from "@/lib/db";

// ============ Types ============
export interface PackingDefault {
  hsCode: string;
  commodityName: string;
  defaultPackaging: string;
  cartonsPerPallet: number;
  netWeightPerCarton: number;
  grossWeightPerCarton: number;
  tarePerCarton: number;
  palletTareKg: number | null;
  originCountry: string | null;
}

export interface TreatmentRequirementRow {
  commodityHs: string;
  originCountry: string;
  destCountry: string;
  treatmentType: string; // COLD_TREATMENT | FUMIGATION | PRE_COOLING | ISPM15 | IRRADIATION
  durationDays: number | null;
  temperatureC: number | null;
  facilityRequired: boolean;
  certificateRequired: boolean;
  notes: string | null;
}

export interface MrlRow {
  country: string;
  commodityHs: string;
  pesticide: string;
  mrlMgKg: number;
}

export interface PortRuleRow {
  portCode: string;
  portName: string;
  country: string;
  ruleType: string; // INSPECTION_REQUIRED | DOCUMENT_ADDITIONAL | COLD_CHAIN_VERIFICATION | CUSTOMS_HOLD
  description: string;
}

export interface SpecialProcedureWarning {
  treatmentType: string;
  severity: "INFO" | "WARN" | "BLOCK";
  message: string;
  certificateRequired: boolean;
  facilityRequired: boolean;
  durationDays: number | null;
  temperatureC: number | null;
  notes: string | null;
}

export interface CachedSchema {
  hsCode: string;
  originCountry: string | null;
  destCountry: string | null;
  port: string | null;
  schemaJson: any;
  expiresAt: Date;
}

// ============ Queries ============

/** 4.3.1 — Get commodity-specific packing defaults (fallback to global if originCountry not found). */
export async function getCommodityPackingDefaults(
  hsCode: string,
  originCountry?: string
): Promise<PackingDefault | null> {
  // First try origin-specific
  if (originCountry) {
    const row = await db.commodityPackingDefault.findFirst({
      where: { hsCode, originCountry },
      orderBy: { createdAt: "desc" },
    });
    if (row) return mapPackingDefault(row);
  }
  // Fallback: any packing default for this HS (origin-agnostic)
  const row = await db.commodityPackingDefault.findFirst({
    where: { hsCode },
    orderBy: { createdAt: "desc" },
  });
  return row ? mapPackingDefault(row) : null;
}

/** 4.4 — Get treatment requirements for a specific HS + origin/dest route. */
export async function getTreatmentRequirements(
  hsCode: string,
  originCountry: string,
  destCountry: string
): Promise<TreatmentRequirementRow[]> {
  // HS may be full HS (0811.10.00) — match by prefix on first 6 digits
  const hsPrefix = hsCode.replace(/\D/g, "").slice(0, 6);
  const rows = await db.treatmentRequirement.findMany({
    where: {
      AND: [
        {
          OR: [
            { commodityHs: hsCode },
            { commodityHs: { startsWith: hsPrefix } },
            { commodityHs: { startsWith: hsPrefix.slice(0, 4) } },
          ],
        },
        { OR: [{ originCountry }, { originCountry: "*" }] },
        { OR: [{ destCountry }, { destCountry: "*" }] },
      ],
    },
  });
  return rows.map(mapTreatmentRequirement);
}

/** 4.5 — Check special procedures and return warnings (e.g. cold treatment required). */
export async function checkSpecialProcedures(
  hsCode: string,
  origin: string,
  dest: string,
  port: string
): Promise<SpecialProcedureWarning[]> {
  const warnings: SpecialProcedureWarning[] = [];

  // 1. Treatment requirements for HS + route
  const treatments = await getTreatmentRequirements(hsCode, origin, dest);
  for (const t of treatments) {
    const severity: SpecialProcedureWarning["severity"] =
      t.treatmentType === "COLD_TREATMENT" || t.treatmentType === "FUMIGATION"
        ? "WARN"
        : "INFO";
    warnings.push({
      treatmentType: t.treatmentType,
      severity,
      message: `${t.treatmentType.replace(/_/g, " ")} required for ${hsCode} (${origin}→${dest})${
        t.durationDays ? `, ${t.durationDays} days` : ""
      }${t.temperatureC != null ? ` at ${t.temperatureC}°C` : ""}.`,
      certificateRequired: t.certificateRequired,
      facilityRequired: t.facilityRequired,
      durationDays: t.durationDays,
      temperatureC: t.temperatureC,
      notes: t.notes,
    });
  }

  // 2. Port special rules
  const portRules = await getPortRules(port);
  for (const r of portRules) {
    const severity: SpecialProcedureWarning["severity"] =
      r.ruleType === "CUSTOMS_HOLD" ? "BLOCK" : "WARN";
    warnings.push({
      treatmentType: r.ruleType,
      severity,
      message: `Port ${r.portName} (${r.portCode}): ${r.description}`,
      certificateRequired: r.ruleType === "DOCUMENT_ADDITIONAL",
      facilityRequired: r.ruleType === "COLD_CHAIN_VERIFICATION",
      durationDays: null,
      temperatureC: null,
      notes: r.description,
    });
  }

  return warnings;
}

/** 4.6 — Get MRL requirements for a destination country + HS code. */
export async function getMrlRequirements(
  country: string,
  hsCode: string
): Promise<MrlRow[]> {
  const hsPrefix = hsCode.replace(/\D/g, "").slice(0, 6);
  const rows = await db.countryMrl.findMany({
    where: {
      AND: [
        { OR: [{ country }, { country: "*" }] },
        {
          OR: [
            { commodityHs: hsCode },
            { commodityHs: { startsWith: hsPrefix } },
          ],
        },
      ],
    },
  });
  return rows.map(mapMrl);
}

/** 4.7 — Get port special rules by UN/LOCODE. */
export async function getPortRules(portCode: string): Promise<PortRuleRow[]> {
  // Support both "EGALX" and "Alexandria (EGALX)" formats
  const cleaned = portCode.match(/[A-Z]{5}/)?.[0] || portCode.trim();
  const rows = await db.portSpecialRule.findMany({
    where: { portCode: cleaned },
  });
  return rows.map(mapPortRule);
}

/** 4.8 — Get cached dynamic schema (returns null if expired). */
export async function getCachedSchema(
  hsCode: string,
  origin?: string,
  dest?: string,
  port?: string
): Promise<CachedSchema | null> {
  const row = await db.commodityDynamicSchemaCache.findFirst({
    where: {
      hsCode,
      originCountry: origin || null,
      destCountry: dest || null,
      port: port || null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    hsCode: row.hsCode,
    originCountry: row.originCountry,
    destCountry: row.destCountry,
    port: row.port,
    schemaJson: JSON.parse(row.schemaJson),
    expiresAt: row.expiresAt,
  };
}

/** 4.8 — Upsert schema cache with 6-hour expiry. */
export async function cacheSchema(
  hsCode: string,
  schema: any,
  origin?: string,
  dest?: string,
  port?: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + 6 * 3600 * 1000);
  await db.commodityDynamicSchemaCache.create({
    data: {
      hsCode,
      originCountry: origin || null,
      destCountry: dest || null,
      port: port || null,
      schemaJson: JSON.stringify(schema),
      expiresAt,
    },
  });
}

// ============ Mapping helpers ============
function mapPackingDefault(r: any): PackingDefault {
  return {
    hsCode: r.hsCode,
    commodityName: r.commodityName,
    defaultPackaging: r.defaultPackaging,
    cartonsPerPallet: r.cartonsPerPallet,
    netWeightPerCarton: r.netWeightPerCarton,
    grossWeightPerCarton: r.grossWeightPerCarton,
    tarePerCarton: r.tarePerCarton,
    palletTareKg: r.palletTareKg,
    originCountry: r.originCountry,
  };
}
function mapTreatmentRequirement(r: any): TreatmentRequirementRow {
  return {
    commodityHs: r.commodityHs,
    originCountry: r.originCountry,
    destCountry: r.destCountry,
    treatmentType: r.treatmentType,
    durationDays: r.durationDays,
    temperatureC: r.temperatureC,
    facilityRequired: r.facilityRequired,
    certificateRequired: r.certificateRequired,
    notes: r.notes,
  };
}
function mapMrl(r: any): MrlRow {
  return {
    country: r.country,
    commodityHs: r.commodityHs,
    pesticide: r.pesticide,
    mrlMgKg: r.mrlMgKg,
  };
}
function mapPortRule(r: any): PortRuleRow {
  return {
    portCode: r.portCode,
    portName: r.portName,
    country: r.country,
    ruleType: r.ruleType,
    description: r.description,
  };
}

// ============ 4.13.1 — Seed RIA data ============
// Initial example data: citrus Egypt→Japan cold treatment, strawberries→USA pre-cooling,
// ISPM-15 for wood packaging.

export async function seedRiaData(): Promise<{
  packingDefaults: number;
  treatments: number;
  mrls: number;
  portRules: number;
  ports: number;
}> {
  // Clear (idempotent re-seed)
  await db.commodityPackingDefault.deleteMany();
  await db.treatmentRequirement.deleteMany();
  await db.countryMrl.deleteMany();
  await db.portSpecialRule.deleteMany();
  await db.port.deleteMany();

  // -------- Ports --------
  const ports = [
    { unlocode: "EGALX", name: "Alexandria", country: "EG", region: "Mediterranean" },
    { unlocode: "EGPSD", name: "Port Said", country: "EG", region: "Mediterranean" },
    { unlocode: "DEHAM", name: "Hamburg", country: "DE", region: "Northern Europe" },
    { unlocode: "NLRTM", name: "Rotterdam", country: "NL", region: "Northern Europe" },
    { unlocode: "JPTYO", name: "Tokyo", country: "JP", region: "East Asia" },
    { unlocode: "JPKOB", name: "Kobe", country: "JP", region: "East Asia" },
    { unlocode: "USLAX", name: "Los Angeles", country: "US", region: "North America" },
    { unlocode: "USNYC", name: "New York", country: "US", region: "North America" },
    { unlocode: "VNCAN", name: "Can Tho", country: "VN", region: "Southeast Asia" },
    { unlocode: "SGSIN", name: "Singapore", country: "SG", region: "Southeast Asia" },
    { unlocode: "AEDXB", name: "Dubai", country: "AE", region: "Middle East" },
    { unlocode: "SADMM", name: "Dammam", country: "SA", region: "Middle East" },
  ];
  for (const p of ports) await db.port.create({ data: p });

  // -------- Commodity packing defaults --------
  const packingDefaults = [
    // Strawberries (frozen IQF) — Egypt origin
    {
      hsCode: "0811.10.00",
      commodityName: "Frozen Strawberries (IQF)",
      defaultPackaging: "CORRUGATED_CARTON_LINED_PE",
      cartonsPerPallet: 80,
      netWeightPerCarton: 12.5,
      grossWeightPerCarton: 13.6,
      tarePerCarton: 1.1,
      palletTareKg: 18.0,
      originCountry: "EG",
    },
    // Oranges (fresh) — Egypt origin (used in Egypt→Japan cold treatment scenario)
    {
      hsCode: "0805.10.00",
      commodityName: "Fresh Oranges (Navel)",
      defaultPackaging: "TELESCOPIC_CARTON",
      cartonsPerPallet: 60,
      netWeightPerCarton: 15.0,
      grossWeightPerCarton: 16.2,
      tarePerCarton: 1.2,
      palletTareKg: 20.0,
      originCountry: "EG",
    },
    // Lemons (fresh) — Vietnam origin
    {
      hsCode: "0805.50.00",
      commodityName: "Fresh Lemons",
      defaultPackaging: "CORRUGATED_CARTON",
      cartonsPerPallet: 70,
      netWeightPerCarton: 10.0,
      grossWeightPerCarton: 11.0,
      tarePerCarton: 1.0,
      palletTareKg: 18.0,
      originCountry: "VN",
    },
    // Strawberries (fresh) — for USA pre-cooling scenario
    {
      hsCode: "0810.10.00",
      commodityName: "Fresh Strawberries",
      defaultPackaging: "CLAMHELL_CARTON",
      cartonsPerPallet: 100,
      netWeightPerCarton: 4.5,
      grossWeightPerCarton: 5.0,
      tarePerCarton: 0.5,
      palletTareKg: 16.0,
      originCountry: "EG",
    },
    // Citrus (general)
    {
      hsCode: "0805",
      commodityName: "Fresh Citrus (mixed)",
      defaultPackaging: "TELESCOPIC_CARTON",
      cartonsPerPallet: 60,
      netWeightPerCarton: 15.0,
      grossWeightPerCarton: 16.2,
      tarePerCarton: 1.2,
      palletTareKg: 20.0,
      originCountry: null,
    },
    // Wood-packing material (for ISPM-15)
    {
      hsCode: "4415.10.00",
      commodityName: "Wooden Pallets (ISPM-15 subject)",
      defaultPackaging: "WOOD_PALLET_HEAT_TREATED",
      cartonsPerPallet: 0,
      netWeightPerCarton: 0,
      grossWeightPerCarton: 20.0,
      tarePerCarton: 0,
      palletTareKg: 20.0,
      originCountry: null,
    },
  ];
  for (const p of packingDefaults) await db.commodityPackingDefault.create({ data: p });

  // -------- Treatment requirements --------
  const treatments = [
    // Citrus Egypt → Japan: cold treatment (Japan MAFF regulation)
    {
      commodityHs: "0805.10.00",
      originCountry: "EG",
      destCountry: "JP",
      treatmentType: "COLD_TREATMENT",
      durationDays: 14,
      temperatureC: 1.0,
      facilityRequired: true,
      certificateRequired: true,
      notes:
        "Japan MAFF cold treatment for Mediterranean fruit fly (Ceratitis capitata). Must be performed in-transit or in approved pre-cooling facility. Continuous temperature log required.",
    },
    // Citrus Egypt → Japan: fumigation alternative (methyl bromide)
    {
      commodityHs: "0805.10.00",
      originCountry: "EG",
      destCountry: "JP",
      treatmentType: "FUMIGATION",
      durationDays: 1,
      temperatureC: 21.0,
      facilityRequired: true,
      certificateRequired: true,
      notes: "Methyl bromide fumigation at 32 g/m³ for 2h as alternative to cold treatment (JP MAFF schedule).",
    },
    // Strawberries → USA: pre-cooling (USDA APHIS)
    {
      commodityHs: "0810.10.00",
      originCountry: "EG",
      destCountry: "US",
      treatmentType: "PRE_COOLING",
      durationDays: 1,
      temperatureC: 0.5,
      facilityRequired: true,
      certificateRequired: true,
      notes:
        "USDA APHIS pre-cooling to pulp temperature ≤ 0.5°C within 2h of harvest. Required for entry via cold-treatment ports (USLAX, USNYC).",
    },
    // Strawberries (frozen) → EU: cold chain verification (no treatment but cold-chain audit)
    {
      commodityHs: "0811.10.00",
      originCountry: "EG",
      destCountry: "DE",
      treatmentType: "PRE_COOLING",
      durationDays: null,
      temperatureC: -18.0,
      facilityRequired: false,
      certificateRequired: true,
      notes: "Frozen state must be maintained at -18°C throughout transit. Cold chain log mandatory.",
    },
    // Wood packaging ISPM-15 (universal)
    {
      commodityHs: "4415",
      originCountry: "*",
      destCountry: "*",
      treatmentType: "ISPM15",
      durationDays: null,
      temperatureC: 56.0,
      facilityRequired: true,
      certificateRequired: true,
      notes:
        "ISPM-15: Wood packaging must be heat-treated (56°C core for 30 min) or methyl-bromide fumigated. IPPC mark required on each pallet/crate.",
    },
    // Citrus Egypt → EU: pre-export inspection (no treatment but inspection)
    {
      commodityHs: "0805.10.00",
      originCountry: "EG",
      destCountry: "DE",
      treatmentType: "FUMIGATION",
      durationDays: 1,
      temperatureC: 18.0,
      facilityRequired: false,
      certificateRequired: true,
      notes: "Optional pre-export fumigation (recommended for long transit). Phytosanitary certificate mandatory.",
    },
    // Lemons Vietnam → Egypt: irradiation alternative
    {
      commodityHs: "0805.50.00",
      originCountry: "VN",
      destCountry: "EG",
      treatmentType: "IRRADIATION",
      durationDays: 1,
      temperatureC: null,
      facilityRequired: true,
      certificateRequired: true,
      notes:
        "Irradiation at 150 Gy as alternative phytosanitary treatment. Must be performed at approved facility with dosimetry report.",
    },
  ];
  for (const t of treatments) await db.treatmentRequirement.create({ data: t });

  // -------- MRL (Maximum Residue Limits) --------
  const mrls = [
    // EU MRLs (Regulation (EC) 396/2005)
    { country: "DE", commodityHs: "0811.10.00", pesticide: "Chlorpyrifos", mrlMgKg: 0.05 },
    { country: "DE", commodityHs: "0811.10.00", pesticide: "Boscalid", mrlMgKg: 3.0 },
    { country: "DE", commodityHs: "0811.10.00", pesticide: "Captan", mrlMgKg: 0.05 },
    { country: "DE", commodityHs: "0811.10.00", pesticide: "Cypermethrin", mrlMgKg: 1.0 },
    { country: "DE", commodityHs: "0805.10.00", pesticide: "Chlorpyrifos", mrlMgKg: 0.3 },
    { country: "DE", commodityHs: "0805.10.00", pesticide: "Imazalil", mrlMgKg: 5.0 },
    { country: "DE", commodityHs: "0805.10.00", pesticide: "Thiabendazole", mrlMgKg: 6.0 },
    // Japan MRLs (MHLW — Food Sanitation Act)
    { country: "JP", commodityHs: "0805.10.00", pesticide: "Chlorpyrifos", mrlMgKg: 0.01 },
    { country: "JP", commodityHs: "0805.10.00", pesticide: "Imazalil", mrlMgKg: 2.0 },
    { country: "JP", commodityHs: "0805.10.00", pesticide: "OPP (ortho-phenylphenol)", mrlMgKg: 10.0 },
    // USA MRLs (EPA — 40 CFR 180)
    { country: "US", commodityHs: "0810.10.00", pesticide: "Captan", mrlMgKg: 25.0 },
    { country: "US", commodityHs: "0810.10.00", pesticide: "Boscalid", mrlMgKg: 1.5 },
    { country: "US", commodityHs: "0810.10.00", pesticide: "Pyrethrin", mrlMgKg: 1.0 },
    // Egypt MRLs (NFSA)
    { country: "EG", commodityHs: "0805.50.00", pesticide: "Chlorpyrifos", mrlMgKg: 0.2 },
    { country: "EG", commodityHs: "0805.50.00", pesticide: "Imazalil", mrlMgKg: 5.0 },
  ];
  for (const m of mrls) await db.countryMrl.create({ data: m });

  // -------- Port special rules --------
  const portRules = [
    // Tokyo: strict inspection for cold-treatment goods
    {
      portCode: "JPTYO",
      portName: "Tokyo",
      country: "JP",
      ruleType: "INSPECTION_REQUIRED",
      description:
        "All cold-treatment citrus shipments require on-arrival pulp temperature verification by MAFF inspector.",
    },
    {
      portCode: "JPTYO",
      portName: "Tokyo",
      country: "JP",
      ruleType: "COLD_CHAIN_VERIFICATION",
      description:
        "Continuous temperature logger (electronic) must be presented to MAFF before unloading.",
    },
    // Kobe: alternative Japan port, requires inspection
    {
      portCode: "JPKOB",
      portName: "Kobe",
      country: "JP",
      ruleType: "INSPECTION_REQUIRED",
      description: "Cold-treatment citrus: pre-arrival notification 24h before ETA to MAFF Kobe.",
    },
    // LA: USDA pre-cooling verification
    {
      portCode: "USLAX",
      portName: "Los Angeles",
      country: "US",
      ruleType: "COLD_CHAIN_VERIFICATION",
      description:
        "Fresh strawberries: USDA APHIS verifies pre-cooling treatment certificate before release.",
    },
    {
      portCode: "USLAX",
      portName: "Los Angeles",
      country: "US",
      ruleType: "DOCUMENT_ADDITIONAL",
      description: "Phytosanitary certificate + pre-cooling treatment record (FV-21 form) required.",
    },
    // NYC: similar
    {
      portCode: "USNYC",
      portName: "New York",
      country: "US",
      ruleType: "COLD_CHAIN_VERIFICATION",
      description: "Strawberries: pre-cooling verification per 7 CFR 319.56.",
    },
    // Hamburg: EU border inspection
    {
      portCode: "DEHAM",
      portName: "Hamburg",
      country: "DE",
      ruleType: "INSPECTION_REQUIRED",
      description:
        "EU border control: document check + identity check + physical check on 1-5% of consignments (Regulation 2017/625).",
    },
    {
      portCode: "DEHAM",
      portName: "Hamburg",
      country: "DE",
      ruleType: "DOCUMENT_ADDITIONAL",
      description:
        "EU: Common Health Entry Document (CHED) via TRACES required for animal-origin & plant products.",
    },
    // Rotterdam: ISPM-15 enforcement
    {
      portCode: "NLRTM",
      portName: "Rotterdam",
      country: "NL",
      ruleType: "DOCUMENT_ADDITIONAL",
      description:
        "Strict ISPM-15 enforcement on all wood packaging. Non-compliant wood destroyed at importer's expense.",
    },
    // Alexandria: customs hold for high-value
    {
      portCode: "EGALX",
      portName: "Alexandria",
      country: "EG",
      ruleType: "CUSTOMS_HOLD",
      description:
        "ACI (Advance Cargo Information) declaration mandatory 48h before vessel arrival (Nafeza).",
    },
    // Port Said: transit inspection
    {
      portCode: "EGPSD",
      portName: "Port Said",
      country: "EG",
      ruleType: "INSPECTION_REQUIRED",
      description:
        "Transit cargo via Suez Canal subject to NFSA inspection if discharging at Port Said.",
    },
  ];
  for (const r of portRules) await db.portSpecialRule.create({ data: r });

  return {
    packingDefaults: packingDefaults.length,
    treatments: treatments.length,
    mrls: mrls.length,
    portRules: portRules.length,
    ports: ports.length,
  };
}
