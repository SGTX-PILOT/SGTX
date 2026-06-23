// SGTX Part 30 — Trade Corridor Network (TCN)
// 30.4 Corridor Eligibility Engine (A2/A1)
// 30.3 Trade Lane Passport
// 30.16 Corridor Compliance Gating

import { db } from "@/lib/db";
import { createHash } from "crypto";

// ============ Types ============
export interface CorridorTradeData {
  commodity?: string;
  origin?: string;          // port UN/LOCODE or country
  dest?: string;            // port UN/LOCODE or country
  incoterm?: string;
  value?: number;
  quantityKg?: number;
  coldChain?: boolean;
  hsCode?: string;
}

export interface CorridorEligibilityReason {
  ok: boolean;
  label: string;
  detail?: string;
  severity?: "info" | "warning" | "blocker";
}

export interface CorridorEligibilityResult {
  corridorCode: string;
  corridorName: string;
  eligible: boolean;
  score: number;            // 0-100
  confidence: number;       // 0-1
  reasons: CorridorEligibilityReason[];
  risks: string[];
  recommendedDocuments: string[];
  estimatedClearanceHours?: number;
  advisoryNote: string;
  aiLayer: "A1+A2";
}

// ============ 30.3 Trade Lane Passport ============
export async function getCorridorPassport(corridorCode: string) {
  const corridor = await db.tradeCorridor.findUnique({
    where: { corridorCode },
  });
  if (!corridor) return null;

  const passport = await db.tradeLanePassport.findFirst({
    where: { corridorCode },
    orderBy: { createdAt: "desc" },
  });

  // Compose structured passport view
  return {
    corridor: {
      code: corridor.corridorCode,
      name: corridor.corridorName,
      type: corridor.corridorType,
      origin: { country: corridor.originCountry, port: corridor.originPort },
      destination: { country: corridor.destCountry, port: corridor.destPort },
      status: corridor.status,
      verificationStatus: corridor.verificationStatus,
      operationalStatus: corridor.operationalStatus,
      transitDays: corridor.transitDays,
      lastVerifiedAt: corridor.lastVerifiedAt,
    },
    commercial: passport
      ? {
          commonIncoterms: safeJsonArray(passport.commonIncoterms),
          typicalCargoTypes: safeJsonArray(passport.typicalCargoTypes),
          cargoCapabilities: safeJson(passport.cargoCapabilities),
        }
      : null,
    logistics: passport
      ? {
          averageTransitDays: passport.averageTransitDays,
        }
      : null,
    financial: passport
      ? {
          financeEligibility: passport.financeEligibility,
          insuranceAvailability: passport.insuranceAvailability,
        }
      : null,
    compliance: passport
      ? {
          requiredCertificates: safeJsonArray(passport.requiredCertificates),
          sourceRegulations: safeJson(passport.sourceRegulations),
        }
      : null,
    passportConfidence: passport?.passportConfidence ?? 0.8,
    loomHash: passport?.loomHash ?? null,
    lastUpdated: passport?.updatedAt ?? corridor.updatedAt,
  };
}

// ============ 30.4 Corridor Eligibility Engine ============
export async function getCorridorEligibility(
  corridorCode: string,
  tradeData: CorridorTradeData
): Promise<CorridorEligibilityResult | null> {
  const corridor = await db.tradeCorridor.findUnique({
    where: { corridorCode },
  });
  if (!corridor) return null;

  const passport = await db.tradeLanePassport.findFirst({
    where: { corridorCode },
    orderBy: { createdAt: "desc" },
  });

  const reasons: CorridorEligibilityReason[] = [];
  const risks: string[] = [];
  let score = 50; // baseline
  let blockers = 0;

  // ── Country match check ────────────────────────────────────
  const originMatch = matchLocation(tradeData.origin, corridor.originCountry, corridor.originPort);
  const destMatch = matchLocation(tradeData.dest, corridor.destCountry, corridor.destPort);
  if (originMatch && destMatch) {
    score += 20;
    reasons.push({ ok: true, label: "Origin / Destination Supported", detail: `${corridor.originPort} → ${corridor.destPort}` });
  } else {
    reasons.push({ ok: false, label: "Route mismatch", detail: `Corridor serves ${corridor.originPort} → ${corridor.destPort}`, severity: "warning" });
    score -= 10;
  }

  // ── Cargo type compatibility ───────────────────────────────
  if (passport) {
    const typical = safeJsonArray(passport.typicalCargoTypes);
    if (tradeData.commodity && typical.length > 0) {
      const matched = typical.some((c) => tradeData.commodity!.toLowerCase().includes(c.toLowerCase()));
      if (matched) {
        score += 15;
        reasons.push({ ok: true, label: "Product Supported", detail: `${tradeData.commodity} is a typical corridor cargo` });
      } else {
        reasons.push({ ok: true, label: "Product Compatibility — verify", detail: "Cargo not in typical list; manual review advised", severity: "warning" });
        score += 2;
      }
    }
    // Cold chain capability
    const caps = safeJson(passport.cargoCapabilities) as any;
    if (tradeData.coldChain) {
      if (caps?.reefer === true || caps?.cold_chain === true) {
        score += 8;
        reasons.push({ ok: true, label: "Reefer Compatible", detail: "Cold chain supported on this corridor" });
      } else {
        risks.push("Cold chain requested — corridor reefer capability not declared");
        reasons.push({ ok: false, label: "Reefer capability not declared", severity: "warning", detail: "Verify with corridor operator" });
        score -= 4;
      }
    }
    // Incoterm match
    if (tradeData.incoterm) {
      const incoterms = safeJsonArray(passport.commonIncoterms);
      if (incoterms.includes(tradeData.incoterm.toUpperCase())) {
        score += 8;
        reasons.push({ ok: true, label: "Incoterm Supported", detail: tradeData.incoterm });
      } else {
        reasons.push({ ok: true, label: "Incoterm — verify", detail: `${tradeData.incoterm} not standard for this corridor`, severity: "warning" });
      }
    }
    // Finance + insurance availability
    if (passport.financeEligibility) {
      score += 4;
      reasons.push({ ok: true, label: "Finance Eligible", detail: "Corridor qualifies for SGTX financing" });
    }
    if (passport.insuranceAvailability) {
      score += 4;
      reasons.push({ ok: true, label: "Insurance Available", detail: "Insurance coverage ≥95% available" });
    } else {
      risks.push("Insurance availability not declared for this corridor");
    }
  }

  // ── Operational status ─────────────────────────────────────
  if (corridor.operationalStatus !== "OPERATIONAL") {
    blockers++;
    reasons.push({ ok: false, label: `Corridor ${corridor.operationalStatus}`, severity: "blocker", detail: "Corridor not operational at this time" });
    score -= 25;
  } else {
    reasons.push({ ok: true, label: "Corridor Operational", detail: "Live and accepting trade flows" });
  }

  // ── Compliance gates (Part 30.16) ──────────────────────────
  const gates = await getCorridorComplianceGates(corridorCode);
  for (const g of gates) {
    if (g.gateType === "SANCTION") {
      blockers++;
      reasons.push({ ok: false, label: "Sanction gate active", detail: g.gateMessage, severity: "blocker" });
      score -= 30;
    } else if (g.gateType === "COUNTRY_RESTRICTION") {
      blockers++;
      reasons.push({ ok: false, label: "Country restriction", detail: g.gateMessage, severity: "blocker" });
      score -= 20;
    } else if (g.gateType === "PRODUCT_RESTRICTION") {
      reasons.push({ ok: false, label: "Product restriction", detail: g.gateMessage, severity: "warning" });
      score -= 5;
    } else if (g.gateType === "LICENCE") {
      risks.push(`Licence required: ${g.gateMessage}`);
      reasons.push({ ok: true, label: "Licence required", detail: g.gateMessage, severity: "warning" });
    } else if (g.gateType === "DOCUMENT") {
      reasons.push({ ok: true, label: "Additional document required", detail: g.gateMessage, severity: "info" });
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));
  const eligible = blockers === 0 && score >= 50;

  // Recommended documents
  const recommendedDocuments = passport
    ? safeJsonArray(passport.requiredCertificates)
    : ["COO", "INVOICE", "PACKING_LIST"];

  // Estimated clearance hours (rough heuristic)
  const estimatedClearanceHours = corridor.destCountry === "SA"
    ? 6 + 2 * (gates.length > 0 ? 1 : 0)
    : corridor.destCountry === "AE" ? 4 : 5;

  // Advisory note (A1 plain language — never blocks)
  const advisoryNote = composeAdvisoryNote(corridor.corridorName, eligible, score, risks);

  return {
    corridorCode: corridor.corridorCode,
    corridorName: corridor.corridorName,
    eligible,
    score,
    confidence: passport?.passportConfidence ?? 0.8,
    reasons,
    risks,
    recommendedDocuments,
    estimatedClearanceHours,
    advisoryNote,
    aiLayer: "A1+A2",
  };
}

// ============ 30.16 Corridor Compliance Gates ============
export async function getCorridorComplianceGates(corridorCode: string) {
  return db.corridorComplianceGate.findMany({
    where: { corridorCode, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

// ============ Helpers ============
function safeJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function safeJson(raw: string | null | undefined): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function matchLocation(input: string | undefined, country: string, port: string): boolean {
  if (!input) return true; // skip check when not provided (advisory)
  const v = input.trim().toUpperCase();
  if (!v) return true;
  return v === country.toUpperCase() || v === port.toUpperCase() || port.toUpperCase().includes(v) || v.includes(port.toUpperCase());
}

function composeAdvisoryNote(corridorName: string, eligible: boolean, score: number, risks: string[]): string {
  if (eligible && risks.length === 0) {
    return `${corridorName} is fully compatible with this trade (score ${score}/100). The corridor eligibility engine (A2) recommends proceeding. Advisory only — final compliance decision remains with the Governor.`;
  }
  if (eligible && risks.length > 0) {
    return `${corridorName} is broadly compatible (score ${score}/100), but the following risks should be reviewed: ${risks.join("; ")}. Advisory only.`;
  }
  return `${corridorName} is NOT recommended for this trade (score ${score}/100). Blockers detected. Advisory only — never auto-blocks; final decision remains with the Governor.`;
}

// ============ 30.6 Loom anchoring helper ============
export function computeCorridorLoomHash(payload: any): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}

// ============ 30.2 Corridor Registry — seed data ============
export const SEED_CORRIDORS = [
  {
    corridorCode: "EGY-ITA-RORO-001",
    corridorName: "Egypt–Italy RoRo (Mediterranean)",
    corridorType: "RORO",
    originCountry: "EG",
    originPort: "EGDAM",
    destCountry: "IT",
    destPort: "ITTRS",
    status: "STRATEGIC",
    verificationStatus: "GOVERNMENT_VERIFIED",
    operationalStatus: "OPERATIONAL",
    transitDays: 6,
  },
  {
    corridorCode: "EGY-KSA-RORO-001",
    corridorName: "Egypt–Saudi Arabia RoRo (Red Sea)",
    corridorType: "RORO",
    originCountry: "EG",
    originPort: "EGSAF",
    destCountry: "SA",
    destPort: "SAJED",
    status: "STRATEGIC",
    verificationStatus: "GOVERNMENT_VERIFIED",
    operationalStatus: "OPERATIONAL",
    transitDays: 3,
  },
  {
    corridorCode: "EGY-UAE-RORO-001",
    corridorName: "Egypt–UAE RoRo (Red Sea / Gulf)",
    corridorType: "RORO",
    originCountry: "EG",
    originPort: "EGDAM",
    destCountry: "AE",
    destPort: "AEJEA",
    status: "CERTIFIED",
    verificationStatus: "GOVERNMENT_VERIFIED",
    operationalStatus: "OPERATIONAL",
    transitDays: 5,
  },
];

export const SEED_PASSPORTS: Record<string, {
  commonIncoterms: string[];
  typicalCargoTypes: string[];
  averageTransitDays: number;
  cargoCapabilities: any;
  financeEligibility: boolean;
  insuranceAvailability: boolean;
  requiredCertificates: string[];
  passportConfidence: number;
}> = {
  "EGY-ITA-RORO-001": {
    commonIncoterms: ["FOB", "CFR", "CIF", "DAP", "DDP"],
    typicalCargoTypes: ["Fresh Produce", "Vehicles", "Industrial Goods", "Refrigerated Cargo"],
    averageTransitDays: 6,
    cargoCapabilities: { fresh_produce: true, vehicles: true, reefer: true, industrial: true },
    financeEligibility: true,
    insuranceAvailability: true,
    requiredCertificates: ["COO", "HEALTH_CERT", "PACKING_LIST", "INVOICE", "PHYTOSANITARY_CERT"],
    passportConfidence: 0.95,
  },
  "EGY-KSA-RORO-001": {
    commonIncoterms: ["FOB", "CFR", "DAP"],
    typicalCargoTypes: ["Fresh Produce", "Vehicles", "Construction Materials", "Refrigerated Cargo"],
    averageTransitDays: 3,
    cargoCapabilities: { fresh_produce: true, vehicles: true, reefer: true, construction: true },
    financeEligibility: true,
    insuranceAvailability: true,
    requiredCertificates: ["COO", "HEALTH_CERT", "PACKING_LIST", "INVOICE", "SFDA_FOOD_CERT", "HALAL_CERT", "PHYTOSANITARY_CERT"],
    passportConfidence: 0.92,
  },
  "EGY-UAE-RORO-001": {
    commonIncoterms: ["FOB", "CFR", "CIF"],
    typicalCargoTypes: ["Vehicles", "Machinery", "Construction Materials", "Perishable Goods"],
    averageTransitDays: 5,
    cargoCapabilities: { vehicles: true, machinery: true, reefer: true, construction: true },
    financeEligibility: true,
    insuranceAvailability: true,
    requiredCertificates: ["COO", "PACKING_LIST", "INVOICE", "UAE_CUSTOMS_DECLARATION"],
    passportConfidence: 0.9,
  },
};

export const SEED_PORTS = [
  { portUnlocode: "EGDAM", portName: "Damietta", country: "EG", portCapacity: { roro: 500, containers: 1000, bulk: 200, cold_storage: 150 }, portCongestionLevel: "LOW", portOperatingHours: "24/7", inspectionFacilities: { health: true, phytosanitary: true }, customsFacilities: { nafeza: true, broker_lounge: true }, corridorMappings: ["EGY-ITA-RORO-001", "EGY-UAE-RORO-001"] },
  { portUnlocode: "EGSAF", portName: "Safaga", country: "EG", portCapacity: { roro: 300, containers: 400, bulk: 100, cold_storage: 80 }, portCongestionLevel: "LOW", portOperatingHours: "06:00-22:00", inspectionFacilities: { health: true, phytosanitary: true }, customsFacilities: { nafeza: true }, corridorMappings: ["EGY-KSA-RORO-001"] },
  { portUnlocode: "EGALX", portName: "Alexandria", country: "EG", portCapacity: { roro: 400, containers: 1200, bulk: 250, cold_storage: 200 }, portCongestionLevel: "MODERATE", portOperatingHours: "24/7", inspectionFacilities: { health: true, phytosanitary: true }, customsFacilities: { nafeza: true, broker_lounge: true }, corridorMappings: ["EGY-ITA-RORO-001", "EGY-KSA-RORO-001"] },
  { portUnlocode: "EGPSD", portName: "Port Said", country: "EG", portCapacity: { roro: 350, containers: 900, bulk: 180, cold_storage: 120 }, portCongestionLevel: "LOW", portOperatingHours: "24/7", inspectionFacilities: { health: true }, customsFacilities: { nafeza: true }, corridorMappings: ["EGY-ITA-RORO-001"] },
  { portUnlocode: "EGTWF", portName: "Port Tawfik", country: "EG", portCapacity: { roro: 250, containers: 200, bulk: 80, cold_storage: 50 }, portCongestionLevel: "LOW", portOperatingHours: "06:00-22:00", inspectionFacilities: { health: true }, customsFacilities: { nafeza: true }, corridorMappings: ["EGY-KSA-RORO-001", "EGY-UAE-RORO-001"] },
  { portUnlocode: "ITTRS", portName: "Trieste", country: "IT", portCapacity: { roro: 600, containers: 800, bulk: 220, cold_storage: 160 }, portCongestionLevel: "LOW", portOperatingHours: "24/7", inspectionFacilities: { health: true, phytosanitary: true, customs: true }, customsFacilities: { eu_customs: true }, corridorMappings: ["EGY-ITA-RORO-001"] },
  { portUnlocode: "ITLIV", portName: "Livorno", country: "IT", portCapacity: { roro: 500, containers: 700, bulk: 180, cold_storage: 140 }, portCongestionLevel: "MODERATE", portOperatingHours: "24/7", inspectionFacilities: { health: true, phytosanitary: true }, customsFacilities: { eu_customs: true }, corridorMappings: ["EGY-ITA-RORO-001"] },
  { portUnlocode: "ITGOA", portName: "Genoa", country: "IT", portCapacity: { roro: 450, containers: 950, bulk: 200, cold_storage: 150 }, portCongestionLevel: "MODERATE", portOperatingHours: "24/7", inspectionFacilities: { health: true, phytosanitary: true }, customsFacilities: { eu_customs: true }, corridorMappings: ["EGY-ITA-RORO-001"] },
  { portUnlocode: "SAJED", portName: "Jeddah", country: "SA", portCapacity: { roro: 700, containers: 1500, bulk: 300, cold_storage: 220 }, portCongestionLevel: "MODERATE", portOperatingHours: "24/7", inspectionFacilities: { health: true, sfda: true, phytosanitary: true }, customsFacilities: { sa_customs: true, sfda_liaison: true }, corridorMappings: ["EGY-KSA-RORO-001"] },
  { portUnlocode: "SAYNB", portName: "Yanbu", country: "SA", portCapacity: { roro: 300, containers: 400, bulk: 150, cold_storage: 80 }, portCongestionLevel: "LOW", portOperatingHours: "24/7", inspectionFacilities: { health: true, sfda: true }, customsFacilities: { sa_customs: true }, corridorMappings: ["EGY-KSA-RORO-001"] },
  { portUnlocode: "SADMM", portName: "Dammam", country: "SA", portCapacity: { roro: 400, containers: 1100, bulk: 250, cold_storage: 180 }, portCongestionLevel: "MODERATE", portOperatingHours: "24/7", inspectionFacilities: { health: true, sfda: true }, customsFacilities: { sa_customs: true }, corridorMappings: ["EGY-KSA-RORO-001"] },
  { portUnlocode: "AEJEA", portName: "Jebel Ali", country: "AE", portCapacity: { roro: 800, containers: 2200, bulk: 350, cold_storage: 280 }, portCongestionLevel: "LOW", portOperatingHours: "24/7", inspectionFacilities: { health: true, customs: true }, customsFacilities: { uae_customs: true }, corridorMappings: ["EGY-UAE-RORO-001"] },
  { portUnlocode: "AEKLF", portName: "Khalifa Port", country: "AE", portCapacity: { roro: 350, containers: 1200, bulk: 200, cold_storage: 150 }, portCongestionLevel: "LOW", portOperatingHours: "24/7", inspectionFacilities: { health: true, customs: true }, customsFacilities: { uae_customs: true }, corridorMappings: ["EGY-UAE-RORO-001"] },
];

export const SEED_COMPLIANCE_GATES = [
  { corridorCode: "EGY-KSA-RORO-001", gateType: "LICENCE", gateCondition: JSON.stringify({ cert: "SFDA_FOOD_CERT", appliesWhen: "cargo contains food" }), gateMessage: "SFDA inspection required for food cargo (adds 1-2 days)" },
  { corridorCode: "EGY-KSA-RORO-001", gateType: "DOCUMENT", gateCondition: JSON.stringify({ certs: ["HALAL_CERT"] }), gateMessage: "Halal certification must be issued by an SFDA-approved body" },
  { corridorCode: "EGY-UAE-RORO-001", gateType: "DOCUMENT", gateCondition: JSON.stringify({ certs: ["UAE_CUSTOMS_DECLARATION"] }), gateMessage: "UAE Customs Declaration mandatory for cargo import" },
  { corridorCode: "EGY-ITA-RORO-001", gateType: "DOCUMENT", gateCondition: JSON.stringify({ certs: ["PHYTOSANITARY_CERT"] }), gateMessage: "Phytosanitary certificate required for plant-origin cargo" },
];

export const SEED_GOVERNMENT_NODES = [
  { countryCode: "EG", authorityName: "Ministry of Transport", authorityType: "MINISTRY", authorityLevel: "NATIONAL", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["corridors"], verify: ["corridors"] }), verificationStatus: "VERIFIED" },
  { countryCode: "EG", authorityName: "Egyptian Customs Authority", authorityType: "CUSTOMS", authorityLevel: "NATIONAL", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["declarations", "corridors"], verify: ["declarations"] }), verificationStatus: "VERIFIED" },
  { countryCode: "EG", authorityName: "GOEIC", authorityType: "TRADE_AGENCY", authorityLevel: "NATIONAL", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["exports"], verify: ["export_permits"] }), verificationStatus: "VERIFIED" },
  { countryCode: "EG", authorityName: "Damietta Port Authority", authorityType: "PORT_AUTHORITY", authorityLevel: "PORT", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["port_calls", "congestion"] }), verificationStatus: "VERIFIED" },
  { countryCode: "EG", authorityName: "Safaga Port Authority", authorityType: "PORT_AUTHORITY", authorityLevel: "PORT", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["port_calls", "congestion"] }), verificationStatus: "VERIFIED" },
  { countryCode: "IT", authorityName: "Italian Customs (Agenzia delle Dogane)", authorityType: "CUSTOMS", authorityLevel: "NATIONAL", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["declarations", "corridors"] }), verificationStatus: "VERIFIED" },
  { countryCode: "IT", authorityName: "Trieste Port Authority", authorityType: "PORT_AUTHORITY", authorityLevel: "PORT", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["port_calls", "congestion"] }), verificationStatus: "VERIFIED" },
  { countryCode: "SA", authorityName: "Saudi Customs Authority", authorityType: "CUSTOMS", authorityLevel: "NATIONAL", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["declarations", "corridors"] }), verificationStatus: "VERIFIED" },
  { countryCode: "SA", authorityName: "Saudi Food & Drug Authority (SFDA)", authorityType: "TRADE_AGENCY", authorityLevel: "NATIONAL", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["food_cargo"], verify: ["food_certificates"] }), verificationStatus: "VERIFIED" },
  { countryCode: "SA", authorityName: "Jeddah Port Authority", authorityType: "PORT_AUTHORITY", authorityLevel: "PORT", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["port_calls", "congestion"] }), verificationStatus: "VERIFIED" },
  { countryCode: "AE", authorityName: "UAE Federal Customs Authority", authorityType: "CUSTOMS", authorityLevel: "NATIONAL", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["declarations", "corridors"] }), verificationStatus: "VERIFIED" },
  { countryCode: "AE", authorityName: "Jebel Ali Port Authority (DP World)", authorityType: "PORT_AUTHORITY", authorityLevel: "PORT", nodeGtid: null, nodePermissions: JSON.stringify({ read: ["port_calls", "congestion"] }), verificationStatus: "VERIFIED" },
];

export const SEED_ANALYTICS = [
  { corridorCode: "EGY-ITA-RORO-001", measurementPeriod: "2026-Q1", volume: 1240, gmvUsd: 38_400_000, averageTransitDays: 6.2, onTimePerformance: 0.94, documentDelayRate: 0.06, customsClearanceHours: 5.5, portCongestionHours: 2.1, financingDemand: 12_000_000 },
  { corridorCode: "EGY-ITA-RORO-001", measurementPeriod: "2026-Q2", volume: 1380, gmvUsd: 42_100_000, averageTransitDays: 6.0, onTimePerformance: 0.96, documentDelayRate: 0.05, customsClearanceHours: 5.0, portCongestionHours: 1.8, financingDemand: 14_500_000 },
  { corridorCode: "EGY-KSA-RORO-001", measurementPeriod: "2026-Q1", volume: 2100, gmvUsd: 28_900_000, averageTransitDays: 3.4, onTimePerformance: 0.91, documentDelayRate: 0.08, customsClearanceHours: 7.2, portCongestionHours: 3.4, financingDemand: 9_000_000 },
  { corridorCode: "EGY-KSA-RORO-001", measurementPeriod: "2026-Q2", volume: 2350, gmvUsd: 31_700_000, averageTransitDays: 3.1, onTimePerformance: 0.93, documentDelayRate: 0.07, customsClearanceHours: 6.8, portCongestionHours: 2.9, financingDemand: 10_500_000 },
  { corridorCode: "EGY-UAE-RORO-001", measurementPeriod: "2026-Q1", volume: 980, gmvUsd: 22_300_000, averageTransitDays: 5.1, onTimePerformance: 0.92, documentDelayRate: 0.05, customsClearanceHours: 4.6, portCongestionHours: 1.5, financingDemand: 7_800_000 },
  { corridorCode: "EGY-UAE-RORO-001", measurementPeriod: "2026-Q2", volume: 1120, gmvUsd: 25_100_000, averageTransitDays: 4.9, onTimePerformance: 0.95, documentDelayRate: 0.04, customsClearanceHours: 4.2, portCongestionHours: 1.2, financingDemand: 9_100_000 },
];

// ============ Seed orchestrator ============
export async function seedCorridorNetwork(): Promise<{
  corridors: number;
  passports: number;
  ports: number;
  gates: number;
  governmentNodes: number;
  analytics: number;
}> {
  let corridorCount = 0;
  for (const c of SEED_CORRIDORS) {
    const existing = await db.tradeCorridor.findUnique({ where: { corridorCode: c.corridorCode } });
    if (existing) {
      await db.tradeCorridor.update({
        where: { corridorCode: c.corridorCode },
        data: { ...c, lastVerifiedAt: new Date() } as any,
      });
    } else {
      await db.tradeCorridor.create({ data: { ...c, lastVerifiedAt: new Date() } as any });
    }
    corridorCount++;
  }

  let passportCount = 0;
  for (const [code, p] of Object.entries(SEED_PASSPORTS)) {
    const loomHash = computeCorridorLoomHash({ code, ...p });
    const existing = await db.tradeLanePassport.findFirst({ where: { corridorCode: code } });
    if (existing) {
      await db.tradeLanePassport.update({
        where: { id: existing.id },
        data: {
          commonIncoterms: JSON.stringify(p.commonIncoterms),
          typicalCargoTypes: JSON.stringify(p.typicalCargoTypes),
          averageTransitDays: p.averageTransitDays,
          cargoCapabilities: JSON.stringify(p.cargoCapabilities),
          financeEligibility: p.financeEligibility,
          insuranceAvailability: p.insuranceAvailability,
          requiredCertificates: JSON.stringify(p.requiredCertificates),
          passportConfidence: p.passportConfidence,
          loomHash,
        },
      });
    } else {
      await db.tradeLanePassport.create({
        data: {
          corridorCode: code,
          commonIncoterms: JSON.stringify(p.commonIncoterms),
          typicalCargoTypes: JSON.stringify(p.typicalCargoTypes),
          averageTransitDays: p.averageTransitDays,
          cargoCapabilities: JSON.stringify(p.cargoCapabilities),
          financeEligibility: p.financeEligibility,
          insuranceAvailability: p.insuranceAvailability,
          requiredCertificates: JSON.stringify(p.requiredCertificates),
          passportConfidence: p.passportConfidence,
          loomHash,
        },
      });
    }
    passportCount++;
  }

  let portCount = 0;
  for (const p of SEED_PORTS) {
    const existing = await db.portDigitalTwin.findUnique({ where: { portUnlocode: p.portUnlocode } });
    const loomHash = computeCorridorLoomHash(p);
    const data = {
      portName: p.portName,
      country: p.country,
      portCapacity: JSON.stringify(p.portCapacity),
      portCongestionLevel: p.portCongestionLevel,
      portOperatingHours: p.portOperatingHours,
      inspectionFacilities: JSON.stringify(p.inspectionFacilities),
      customsFacilities: JSON.stringify(p.customsFacilities),
      corridorMappings: JSON.stringify(p.corridorMappings),
      loomHash,
    };
    if (existing) {
      await db.portDigitalTwin.update({ where: { portUnlocode: p.portUnlocode }, data });
    } else {
      await db.portDigitalTwin.create({ data: { portUnlocode: p.portUnlocode, ...data } });
    }
    portCount++;
  }

  let gateCount = 0;
  for (const g of SEED_COMPLIANCE_GATES) {
    // Avoid duplicates: check by corridorCode + gateType + message
    const existing = await db.corridorComplianceGate.findFirst({
      where: { corridorCode: g.corridorCode, gateType: g.gateType, gateMessage: g.gateMessage },
    });
    if (!existing) {
      await db.corridorComplianceGate.create({ data: g });
      gateCount++;
    }
  }

  let nodeCount = 0;
  for (const n of SEED_GOVERNMENT_NODES) {
    const existing = await db.governmentNode.findFirst({
      where: { countryCode: n.countryCode, authorityName: n.authorityName },
    });
    if (existing) {
      await db.governmentNode.update({ where: { id: existing.id }, data: n });
    } else {
      await db.governmentNode.create({ data: n });
      nodeCount++;
    }
  }

  let analyticCount = 0;
  for (const a of SEED_ANALYTICS) {
    const existing = await db.corridorAnalytic.findFirst({
      where: { corridorCode: a.corridorCode, measurementPeriod: a.measurementPeriod },
    });
    if (!existing) {
      await db.corridorAnalytic.create({ data: a });
      analyticCount++;
    }
  }

  return {
    corridors: corridorCount,
    passports: passportCount,
    ports: portCount,
    gates: gateCount,
    governmentNodes: nodeCount,
    analytics: analyticCount,
  };
}
