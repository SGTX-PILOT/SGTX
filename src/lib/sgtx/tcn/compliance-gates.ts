// Corridor Compliance Gates — Part 30.11
//
// Compliance gates check whether a trade meets all corridor requirements before
// the cargo is allowed to roll on the vessel. The four gate categories are:
//
//   1. Document compliance      — COO, phyto, health cert, etc.
//   2. Customs pre-clearance    — Nafeza ACI / FASAH / Dubai Trade status
//   3. RoRo dimension check     — cargo LOA/beam/height vs vessel limits
//   4. Dangerous goods check    — IMDG class restrictions per corridor
//
// `runAllGates()` aggregates all four into a single overall status
// (PASS / CONDITIONAL / FAIL) and returns the list of gate results.

import { freshDb as db } from "@/lib/db-fresh";
import { getManifest, type Manifest } from "./roro-manifest";

export interface GateResult {
  gate: string;
  label: string;
  status: "PASS" | "CONDITIONAL" | "FAIL";
  detail: string;
  missing?: string[];
  verified?: string[];
  violations?: string[];
  restrictedItems?: string[];
}

export interface DocumentComplianceResult {
  compliant: boolean;
  missingDocs: string[];
  verifiedDocs: string[];
  detail: string;
}

export interface CustomsPreClearanceResult {
  status: "PASS" | "CONDITIONAL" | "FAIL";
  clearancePort: string;
  estimatedHours: number;
  detail: string;
}

export interface RoRoDimensionResult {
  compliant: boolean;
  violations: string[];
  detail: string;
}

export interface DangerousGoodsResult {
  compliant: boolean;
  restrictedItems: string[];
  detail: string;
}

/**
 * Check document compliance: compare corridor-required certificates
 * (from the TradeLanePassport) against documents uploaded for the trade
 * (Trade.documents JSON).
 */
export async function checkDocumentCompliance(
  corridorCode: string,
  ustn: string
): Promise<DocumentComplianceResult> {
  const passport = await db.tradeLanePassport.findFirst({
    where: { corridorCode },
    orderBy: { passportVersion: "desc" },
  });
  const required: string[] = passport
    ? (() => {
        try {
          return JSON.parse(passport.requiredCertificates || "[]");
        } catch {
          return [];
        }
      })()
    : [];
  if (required.length === 0) {
    return { compliant: true, missingDocs: [], verifiedDocs: [], detail: "No required certificates defined for corridor" };
  }
  // Look up the trade and its uploaded documents (Document table)
  const trade = await db.trade.findFirst({ where: { ustn }, include: { documents: true } });
  if (!trade) {
    return { compliant: false, missingDocs: required, verifiedDocs: [], detail: `No trade found for USTN ${ustn}` };
  }
  // Map corridor-required certificate codes (e.g. COO, HEALTH_CERT, PHYTOSANITARY)
  // to the Document.type / DocumentRequirement.docType vocabularies used in DB.
  const synonymMap: Record<string, string[]> = {
    COO: ["CERTIFICATE_ORIGIN", "COO", "EUR1"],
    PHYTOSANITARY: ["PHYTO", "PHYTOSANITARY"],
    HEALTH_CERT: ["HEALTH_CERT", "HEALTH_CERTIFICATE"],
    SFDA_FOOD_CERT: ["SFDA_FOOD_CERT", "FOOD_CERT", "SFDA"],
    HALAL: ["HALAL"],
    COLD_CHAIN_LOG: ["COLD_CHAIN_LOG", "COLD_TREATMENT"],
    PACKING_LIST: ["PACKING_LIST"],
    INVOICE: ["COMMERCIAL_INVOICE", "INVOICE"],
    UAE_CUSTOMS_DECLARATION: ["CUSTOMS_DECL", "UAE_CUSTOMS_DECLARATION"],
  };
  const uploadedTypes = (trade.documents || []).map((d: any) => d.type || "").filter(Boolean);
  const verifiedDocs = required.filter((r) => {
    const synonyms = synonymMap[r] || [r];
    return uploadedTypes.some((u: string) => synonyms.some((s) => u.toUpperCase().includes(s.toUpperCase())));
  });
  const missingDocs = required.filter((r) => !verifiedDocs.includes(r));
  return {
    compliant: missingDocs.length === 0,
    missingDocs,
    verifiedDocs,
    detail:
      missingDocs.length === 0
        ? `All ${required.length} required certificates uploaded`
        : `Missing ${missingDocs.length}/${required.length}: ${missingDocs.join(", ")}`,
  };
}

/**
 * Check customs pre-clearance status. In production this would call Nafeza /
 * FASAH / Dubai Trade APIs. Here we use a heuristic based on the corridor's
 * origin country (Egypt = Nafeza ACI, Saudi = FASAH, UAE = Dubai Trade) and
 * whether a customs declaration exists for the USTN.
 */
export async function checkCustomsPreClearance(
  corridorCode: string,
  ustn: string
): Promise<CustomsPreClearanceResult> {
  const corridor = await db.tradeCorridor.findUnique({ where: { corridorCode } });
  if (!corridor) return { status: "FAIL", clearancePort: "unknown", estimatedHours: 0, detail: "Corridor not found" };
  const originCountry = corridor.originCountry;
  const schemeMap: Record<string, { name: string; port: string; hours: number }> = {
    EG: { name: "Nafeza ACI", port: "Origin port (Egypt)", hours: 4 },
    SA: { name: "FASAH", port: "Origin port (KSA)", hours: 6 },
    AE: { name: "Dubai Trade", port: "Origin port (UAE)", hours: 3 },
    IT: { name: "AIDA", port: "Origin port (Italy)", hours: 4 },
  };
  const scheme = schemeMap[originCountry] || { name: "Origin Single Window", port: "Origin port", hours: 8 };
  // Look up customs declaration via the trade (CustomsDeclaration is keyed by tradeId, not USTN)
  const trade = await db.trade.findFirst({ where: { ustn }, include: { customsDecls: true } });
  const decl = trade?.customsDecls?.[0];
  if (!trade) {
    return {
      status: "CONDITIONAL",
      clearancePort: scheme.port,
      estimatedHours: scheme.hours,
      detail: `No trade found for USTN — pre-clearance via ${scheme.name} pending`,
    };
  }
  if (!decl) {
    return {
      status: "CONDITIONAL",
      clearancePort: scheme.port,
      estimatedHours: scheme.hours,
      detail: `No customs declaration filed yet — pre-clearance via ${scheme.name} pending`,
    };
  }
  if (decl.status === "CLEARED") {
    return { status: "PASS", clearancePort: scheme.port, estimatedHours: 0, detail: `Customs pre-cleared via ${scheme.name}` };
  }
  return {
    status: "CONDITIONAL",
    clearancePort: scheme.port,
    estimatedHours: scheme.hours,
    detail: `Customs declaration ${decl.status} via ${scheme.name} — estimated ${scheme.hours}h to clear`,
  };
}

/**
 * Check RoRo dimension compliance: cargo LOA / beam / height vs vessel limits
 * from the corridor passport's cargoTypeCapabilities JSON.
 */
export async function checkRoRoDimensions(
  corridorCode: string,
  manifestItems: Array<{ itemType?: string; lengthM?: number; widthM?: number; heightM?: number; weightKg?: number; licensePlate?: string | null }>
): Promise<RoRoDimensionResult> {
  const passport = await db.tradeLanePassport.findFirst({
    where: { corridorCode },
    orderBy: { passportVersion: "desc" },
  });
  const caps: any = (() => {
    try {
      return JSON.parse(passport?.cargoTypeCapabilities || "{}");
    } catch {
      return {};
    }
  })();
  const maxLoa = Number(caps.roro_max_loa_m || 200);
  const maxBeam = Number(caps.roro_max_beam_m || 32);
  const rampCap = Number(caps.roro_ramp_capacity_t || 250);
  const violations: string[] = [];
  for (const item of manifestItems) {
    const plate = item.licensePlate || `item`;
    if (item.lengthM && item.lengthM > maxLoa) {
      violations.push(`${plate}: LOA ${item.lengthM}m exceeds max ${maxLoa}m`);
    }
    if (item.widthM && item.widthM > maxBeam) {
      violations.push(`${plate}: beam ${item.widthM}m exceeds max ${maxBeam}m`);
    }
    // Ramp capacity is per-axle or per-trailer — flag items over 80% of ramp capacity
    if (item.weightKg && item.weightKg / 1000 > rampCap * 0.9) {
      violations.push(`${plate}: weight ${item.weightKg}kg close to ramp capacity ${rampCap * 1000}kg`);
    }
    if (item.itemType === "MACHINERY" && (item.lengthM || 0) > maxLoa * 0.95) {
      violations.push(`${plate}: MACHINERY with LOA ${item.lengthM}m too close to vessel max ${maxLoa}m`);
    }
  }
  return {
    compliant: violations.length === 0,
    violations,
    detail: violations.length === 0 ? `All ${manifestItems.length} items within vessel dimension limits` : `${violations.length} dimension violation(s)`,
  };
}

/**
 * Check dangerous goods compliance: identify items whose HS code falls into
 * IMDG-restricted categories (explosives, flammable liquids, gases, oxidizers,
 * toxic, radioactive, corrosive). The corridor passport declares an
 * `imdg_class_limit` — items above that limit are restricted.
 */
export async function checkDangerousGoods(
  corridorCode: string,
  manifestItems: Array<{ itemType?: string; hsCode?: string | null; cargoDescription?: string | null; licensePlate?: string | null }>
): Promise<DangerousGoodsResult> {
  const passport = await db.tradeLanePassport.findFirst({
    where: { corridorCode },
    orderBy: { passportVersion: "desc" },
  });
  const caps: any = (() => {
    try {
      return JSON.parse(passport?.cargoTypeCapabilities || "{}");
    } catch {
      return {};
    }
  })();
  const classLimit = Number(caps.imdg_class_limit || 9);
  // Map HS code chapter → IMDG class (simplified)
  const hsToImdg: Record<string, number> = {
    "36": 1, // explosives
    "29": 3, // flammable liquids (organic chemicals)
    "27": 2, // flammable gases (fertilizers)
    "28": 5.1, // oxidizers (inorganic chemicals)
    "30": 6.1, // toxic
    "39": 7, // radioactive
    "38": 8, // corrosive
  };
  const restrictedItems: string[] = [];
  for (const item of manifestItems) {
    const plate = item.licensePlate || `item`;
    const hsChapter = (item.hsCode || "").split(".")[0].slice(0, 2);
    const imdgClass = hsToImdg[hsChapter];
    if (imdgClass !== undefined && imdgClass > classLimit) {
      restrictedItems.push(`${plate}: HS ${item.hsCode} → IMDG class ${imdgClass} exceeds limit ${classLimit}`);
    }
    // Keyword check on description
    const desc = (item.cargoDescription || "").toLowerCase();
    if (/(explosive|ammunition|detonator|firework|radioactive|uranium|plutonium)/.test(desc)) {
      restrictedItems.push(`${plate}: cargo description indicates restricted DG: "${item.cargoDescription}"`);
    }
  }
  return {
    compliant: restrictedItems.length === 0,
    restrictedItems,
    detail: restrictedItems.length === 0 ? `No dangerous goods violations (IMDG limit class ${classLimit})` : `${restrictedItems.length} restricted DG item(s)`,
  };
}

/**
 * Run all four compliance gates for a USTN + corridor.
 * Returns overall status (PASS / CONDITIONAL / FAIL) plus individual gate results.
 */
export async function runAllGates(corridorCode: string, ustn: string): Promise<{
  overallStatus: "PASS" | "CONDITIONAL" | "FAIL";
  gates: GateResult[];
  summary: string;
}> {
  // Fetch the manifest (if exists) to get cargo items
  const manifest: Manifest | null = await getManifest(ustn);
  const items = manifest?.items || [];

  const [docs, customs, dims, dg] = await Promise.all([
    checkDocumentCompliance(corridorCode, ustn),
    checkCustomsPreClearance(corridorCode, ustn),
    checkRoRoDimensions(corridorCode, items),
    checkDangerousGoods(corridorCode, items),
  ]);

  const gates: GateResult[] = [
    {
      gate: "DOCUMENTS",
      label: "Document Compliance",
      status: docs.compliant ? "PASS" : "FAIL",
      detail: docs.detail,
      missing: docs.missingDocs,
      verified: docs.verifiedDocs,
    },
    {
      gate: "CUSTOMS",
      label: "Customs Pre-Clearance",
      status: customs.status,
      detail: customs.detail,
    },
    {
      gate: "DIMENSIONS",
      label: "RoRo Dimension Check",
      status: dims.compliant ? "PASS" : "FAIL",
      detail: dims.detail,
      violations: dims.violations,
    },
    {
      gate: "DG",
      label: "Dangerous Goods Check",
      status: dg.compliant ? "PASS" : "FAIL",
      detail: dg.detail,
      restrictedItems: dg.restrictedItems,
    },
  ];

  const statuses = gates.map((g) => g.status);
  const overallStatus: "PASS" | "CONDITIONAL" | "FAIL" = statuses.includes("FAIL")
    ? "FAIL"
    : statuses.includes("CONDITIONAL")
    ? "CONDITIONAL"
    : "PASS";
  const passCount = gates.filter((g) => g.status === "PASS").length;
  const summary = `${passCount}/${gates.length} gates passed — overall ${overallStatus}`;

  return { overallStatus, gates, summary };
}
