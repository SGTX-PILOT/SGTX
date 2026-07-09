// SGTX GCC Customs Compliance — Saudi FASAH + UAE Dubai Trade + GCC CET + Halal
// Logic module with mock filings. Real FASAH/Dubai Trade API integration deferred.

export interface GccCustomsFiling {
  declarationNumber: string;
  ustn: string;
  gccCountry: "SA" | "AE" | "KW" | "BH" | "QA" | "OM";
  hsCode: string;
  goodsDescription: string;
  countryOfOrigin: string;
  valueUsd: number;
  customsDutyUsd: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
}

export interface HalalCertification {
  required: boolean;
  certificateNumber?: string;
  ustn: string;
  hsCode: string;
  commodity: string;
  status: "REQUIRED" | "CERTIFIED" | "NOT_APPLICABLE";
}

export interface GccComplianceResult {
  gccFiling: GccCustomsFiling;
  halal: HalalCertification;
  gaftaPreference: boolean;
  conditions: { condition_id: string; label: string; status: "met" | "unmet" }[];
  overallVerdict: "PASS" | "CONDITIONAL" | "DENY";
}

export const GCC_COUNTRIES = ["SA", "AE", "KW", "BH", "QA", "OM"];

// GAFTA members (Greater Arab Free Trade Area)
export const GAFTA_COUNTRIES = [
  "EG", "SA", "AE", "KW", "BH", "QA", "OM", "IQ", "JO", "LB", "LY", "MA",
  "PS", "SD", "SY", "TN", "YE", "DJ", "MR", "SO", "KM",
];

// Halal required: live animals (01-02), meat (0201-0210), prepared meat (1601-1605)
function isHalalRequired(hsCode: string): boolean {
  const chapter = parseInt((hsCode || "").substring(0, 2), 10);
  if (chapter === 1 || chapter === 2) return true;
  const heading = (hsCode || "").substring(0, 4);
  if (["1601", "1602", "1603", "1604", "1605"].includes(heading)) return true;
  return false;
}

function isGccCountry(country: string): boolean {
  return GCC_COUNTRIES.includes(country.toUpperCase());
}

function isGaftaCountry(country: string): boolean {
  return GAFTA_COUNTRIES.includes(country.toUpperCase());
}

function mockNum(prefix: string): string {
  return `${prefix}${Math.random().toString().slice(2, 12).padEnd(10, "0")}`;
}

interface GccInput {
  ustn: string;
  destCountry: string;
  hsCode: string;
  commodity: string;
  countryOfOrigin: string;
  valueUsd: number;
}

export function assessGccCompliance(input: GccInput): GccComplianceResult {
  const dest = (input.destCountry || "").toUpperCase() as "SA" | "AE" | "KW" | "BH" | "QA" | "OM";
  const isGcc = isGccCountry(dest);

  if (!isGcc) {
    return {
      gccFiling: {
        declarationNumber: "", ustn: input.ustn, gccCountry: dest as any,
        hsCode: input.hsCode, goodsDescription: input.commodity,
        countryOfOrigin: input.countryOfOrigin, valueUsd: input.valueUsd,
        customsDutyUsd: 0, status: "PENDING",
      },
      halal: { required: false, ustn: input.ustn, hsCode: input.hsCode, commodity: input.commodity, status: "NOT_APPLICABLE" },
      gaftaPreference: false, conditions: [], overallVerdict: "PASS",
    };
  }

  const conditions: { condition_id: string; label: string; status: "met" | "unmet" }[] = [];
  let verdict: "PASS" | "CONDITIONAL" | "DENY" = "PASS";

  // GCC Common External Tariff (CET): 5% standard, 0% for GCC-origin (GAFTA preference)
  const gaftaPreference = isGaftaCountry(input.countryOfOrigin);
  const dutyRate = gaftaPreference ? 0 : 0.05;
  const customsDutyUsd = Math.round(input.valueUsd * dutyRate * 100) / 100;

  // Filing number prefix by country
  const prefix = dest === "SA" ? "FASAH" : dest === "AE" ? "DUBAI" : "GCC";

  const gccFiling: GccCustomsFiling = {
    declarationNumber: mockNum(prefix),
    ustn: input.ustn, gccCountry: dest, hsCode: input.hsCode,
    goodsDescription: input.commodity, countryOfOrigin: input.countryOfOrigin,
    valueUsd: input.valueUsd, customsDutyUsd, status: "ACCEPTED",
  };

  if (gaftaPreference) {
    conditions.push({ condition_id: "gafta_preference", label: "GAFTA preference applied — 0% GCC duty", status: "met" });
  }

  // Halal certification
  const halalRequired = isHalalRequired(input.hsCode);
  const halal: HalalCertification = halalRequired
    ? {
        required: true, certificateNumber: mockNum("HALAL"),
        ustn: input.ustn, hsCode: input.hsCode, commodity: input.commodity, status: "CERTIFIED",
      }
    : { required: false, ustn: input.ustn, hsCode: input.hsCode, commodity: input.commodity, status: "NOT_APPLICABLE" };

  if (halalRequired) {
    conditions.push({ condition_id: "halal_cert", label: "Halal certification required for meat/animal products", status: "met" });
  }

  if (conditions.some(c => c.status === "unmet")) verdict = "CONDITIONAL";

  return { gccFiling, halal, gaftaPreference, conditions, overallVerdict: verdict };
}
