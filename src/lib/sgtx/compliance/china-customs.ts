// SGTX China Customs Compliance — Single Window (GACC) + CCC + Phytosanitary e-cert
// Logic module with mock filings. Real GACC API integration deferred.

export interface CccCertification {
  required: boolean;
  cccCertificateNumber?: string;
  ustn: string;
  hsCode: string;
  productName: string;
  status: "REQUIRED" | "EXEMPT" | "CERTIFIED";
}

export interface ChinaSingleWindowFiling {
  declarationNumber: string;
  ustn: string;
  hsCode: string;
  goodsDescription: string;
  consignee: string;
  countryOfOrigin: string;
  valueUsd: number;
  quantity: number;
  unit: string;
  customsDutyCny: number;
  vatCny: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
}

export interface PhytoEcert {
  certificateNumber: string;
  ustn: string;
  hsCode: string;
  commodity: string;
  countryOfOrigin: string;
  treatmentMethod?: string;
  status: "PENDING" | "ISSUED" | "REJECTED";
}

export interface ChinaComplianceResult {
  ccc: CccCertification;
  singleWindowFiling: ChinaSingleWindowFiling;
  phytoEcertRequired: boolean;
  phyto?: PhytoEcert;
  conditions: { condition_id: string; label: string; status: "met" | "unmet" }[];
  overallVerdict: "PASS" | "CONDITIONAL" | "DENY";
}

// CCC required HS chapters: 84-85 (machinery/electronics), 87 (vehicles), 94 (furniture), 68 (ceramics), 39 (some plastics)
const CCC_HS_CHAPTERS = [84, 85, 87, 94, 68, 39];

// Phyto required: chapters 01-14 (live plants/agri) + 15-22 (processed food)
function isPhytoRequired(hsCode: string): boolean {
  const chapter = parseInt((hsCode || "").substring(0, 2), 10);
  return chapter >= 1 && chapter <= 22;
}

function isCccRequired(hsCode: string): boolean {
  const chapter = parseInt((hsCode || "").substring(0, 2), 10);
  return CCC_HS_CHAPTERS.includes(chapter);
}

// Mock duty rate by HS chapter (5-20%)
function getChinaDutyRate(hsCode: string): number {
  const chapter = parseInt((hsCode || "").substring(0, 2), 10);
  if (chapter >= 84 && chapter <= 85) return 0.08; // electronics 8%
  if (chapter === 87) return 0.15; // vehicles 15%
  if (chapter >= 1 && chapter <= 24) return 0.10; // food 10%
  if (chapter >= 50 && chapter <= 63) return 0.12; // textiles 12%
  return 0.05; // default 5%
}

function mockNum(prefix: string): string {
  return `${prefix}${Math.random().toString().slice(2, 12).padEnd(10, "0")}`;
}

interface ChinaInput {
  ustn: string;
  destCountry: string;
  hsCode: string;
  commodity: string;
  countryOfOrigin: string;
  valueUsd: number;
  quantity: number;
  unit: string;
}

export function assessChinaCompliance(input: ChinaInput): ChinaComplianceResult {
  const dest = (input.destCountry || "").toUpperCase();
  const isChina = dest === "CN";

  if (!isChina) {
    return {
      ccc: { required: false, ustn: input.ustn, hsCode: input.hsCode, productName: input.commodity, status: "EXEMPT" },
      singleWindowFiling: {
        declarationNumber: "", ustn: input.ustn, hsCode: input.hsCode, goodsDescription: input.commodity,
        consignee: "", countryOfOrigin: input.countryOfOrigin, valueUsd: input.valueUsd,
        quantity: input.quantity, unit: input.unit, customsDutyCny: 0, vatCny: 0, status: "PENDING",
      },
      phytoEcertRequired: false, conditions: [], overallVerdict: "PASS",
    };
  }

  const conditions: { condition_id: string; label: string; status: "met" | "unmet" }[] = [];
  let verdict: "PASS" | "CONDITIONAL" | "DENY" = "PASS";

  // CCC certification
  const cccRequired = isCccRequired(input.hsCode);
  const ccc: CccCertification = cccRequired
    ? {
        required: true, cccCertificateNumber: mockNum("CCC"),
        ustn: input.ustn, hsCode: input.hsCode, productName: input.commodity, status: "CERTIFIED",
      }
    : { required: false, ustn: input.ustn, hsCode: input.hsCode, productName: input.commodity, status: "EXEMPT" };

  if (cccRequired) {
    conditions.push({ condition_id: "ccc_cert", label: `CCC certification required for HS chapter ${input.hsCode.substring(0, 2)}`, status: "met" });
  }

  // China Single Window filing
  const dutyRate = getChinaDutyRate(input.hsCode);
  const cnyRate = 7.2; // approximate USD→CNY
  const customsDutyCny = Math.round(input.valueUsd * dutyRate * cnyRate * 100) / 100;
  const vatCny = Math.round((input.valueUsd + customsDutyCny / cnyRate) * 0.13 * cnyRate * 100) / 100;

  const singleWindowFiling: ChinaSingleWindowFiling = {
    declarationNumber: mockNum("GACC"),
    ustn: input.ustn, hsCode: input.hsCode, goodsDescription: input.commodity,
    consignee: "—", countryOfOrigin: input.countryOfOrigin, valueUsd: input.valueUsd,
    quantity: input.quantity, unit: input.unit,
    customsDutyCny, vatCny, status: "ACCEPTED",
  };

  // Phytosanitary e-cert
  const phytoRequired = isPhytoRequired(input.hsCode);
  let phyto: PhytoEcert | undefined;
  if (phytoRequired) {
    phyto = {
      certificateNumber: mockNum("GACCPC"),
      ustn: input.ustn, hsCode: input.hsCode, commodity: input.commodity,
      countryOfOrigin: input.countryOfOrigin, treatmentMethod: "Fumigation (MB)",
      status: "ISSUED",
    };
    conditions.push({ condition_id: "phyto_ecert", label: "Phytosanitary e-cert issued by GACC", status: "met" });
  }

  if (conditions.some(c => c.status === "unmet")) verdict = "CONDITIONAL";

  return {
    ccc, singleWindowFiling, phytoEcertRequired: phytoRequired, phyto,
    conditions, overallVerdict: verdict,
  };
}
